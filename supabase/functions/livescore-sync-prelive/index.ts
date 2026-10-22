import { HttpError, oneObject, pages } from "../_shared/livescore/client.ts";
import { rpc } from "../_shared/livescore/db.ts";
import {
  normalizeUpcoming,
  readBookmakerOdds,
  readOdds,
  readPreview,
} from "../_shared/livescore/normalize.ts";
import { accept, budget, unauthorized, withRun } from "../_shared/livescore/run.ts";

const HORIZON_MS = 24 * 60 * 60 * 1000;
const FRESH_MS = 25 * 60 * 1000;
const WORKERS = 2;

type Card = ReturnType<typeof normalizeUpcoming>;
type Freshness = { fixture_id: string; upcoming_at: string | null; odds_at: string | null };

Deno.serve(async (request) => {
  const denied = unauthorized(request);
  if (denied) return denied;
  const apiKey = Deno.env.get("FUTODDS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "A função ainda não tem a chave da API configurada." }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return accept(withRun("prelive", 600, () => syncPrelive(apiKey)));
});

async function syncPrelive(apiKey: string) {
  const over = budget(130_000);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const removed = await rpc<number>("livescore_cleanup", {});
  const today = utcDate(0);
  const tomorrow = utcDate(1);
  const rows = [
    ...(await pages(apiKey, `/matches-upcoming?date_from=${today}&date_to=${today}`)),
    ...(await pages(apiKey, `/matches-upcoming?date_from=${tomorrow}&date_to=${tomorrow}`)),
  ];
  const seen = new Set<string>();
  const now = Date.now();
  const cards = rows.flatMap((row) => {
    const card = normalizeUpcoming(row);
    if (!/^\d+$/.test(card.fixtureId) || seen.has(card.fixtureId)) return [];
    const kickoff = card.kickoff ? Date.parse(card.kickoff) : Number.NaN;
    if (!Number.isFinite(kickoff) || kickoff < now - 5 * 60_000 || kickoff > now + HORIZON_MS) return [];
    seen.add(card.fixtureId);
    return [card];
  });

  const listed = await rpc<number>("livescore_upsert_fixtures", { rows: cards });
  const freshness = await rpc<Freshness[]>("livescore_prelive_queue", {
    ids: cards.map((card) => card.fixtureId),
  });
  const fresh = new Map((freshness ?? []).map((row) => [row.fixture_id, row]));
  const pending = orderPending(cards, fresh, await rpc<string | null>("livescore_cursor", { job_name: "prelive" }));

  let details = 0;
  let odds = 0;
  let saved = 0;
  let next = 0;

  const worker = async () => {
    while (next < pending.length && !over()) {
      const card = pending[next];
      next += 1;
      if (!card) break;
      const row = fresh.get(card.fixtureId);
      const jobs: Promise<boolean>[] = [];
      if (!isFresh(row?.upcoming_at, now)) {
        details += 1;
        jobs.push(saveDetail(apiKey, card.fixtureId));
      }
      if (!isFresh(row?.odds_at, now)) {
        odds += 1;
        jobs.push(saveOdds(apiKey, card.fixtureId));
      }
      const results = await Promise.all(jobs);
      if (results.some(Boolean)) saved += 1;
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, () => worker()));

  const partial = next < pending.length;
  const cursor = partial ? (pending[next]?.fixtureId ?? null) : null;
  await rpc<null>("livescore_set_cursor", { job_name: "prelive", next_cursor: cursor });

  return {
    partial,
    fixturesSeen: cards.length,
    fixturesSaved: saved,
    detail: { listed, pending: pending.length, details, odds, removed, cursor },
  };
}

function orderPending(cards: Card[], fresh: Map<string, Freshness>, cursor: string | null) {
  const pending = cards.filter((card) => {
    const row = fresh.get(card.fixtureId);
    return !isFresh(row?.upcoming_at, Date.now()) || !isFresh(row?.odds_at, Date.now());
  });
  pending.sort((left, right) => {
    const age = ageOf(fresh.get(left.fixtureId)) - ageOf(fresh.get(right.fixtureId));
    if (age !== 0) return age;
    return Date.parse(left.kickoff ?? "") - Date.parse(right.kickoff ?? "");
  });
  if (!cursor) return pending;
  const index = pending.findIndex((card) => card.fixtureId === cursor);
  if (index < 0) return pending;
  return [...pending.slice(index), ...pending.slice(0, index)];
}

function ageOf(row: Freshness | undefined) {
  const upcoming = row?.upcoming_at ? Date.parse(row.upcoming_at) : 0;
  const odds = row?.odds_at ? Date.parse(row.odds_at) : 0;
  return Math.min(Number.isFinite(upcoming) ? upcoming : 0, Number.isFinite(odds) ? odds : 0);
}

function isFresh(value: string | null | undefined, now: number) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= now - FRESH_MS;
}

async function saveDetail(apiKey: string, fixtureId: string) {
  try {
    const data = await oneObject(
      apiKey,
      `/matches-upcoming-detail?fixture_id=${fixtureId}&fields=stats_extra,match_leg`,
    );
    await rpc<null>("livescore_upsert_document", {
      fixture: fixtureId,
      document_kind: "upcoming_detail",
      document_payload: {
        phase: "upcoming",
        match: normalizeUpcoming(data),
        stats: [],
        odds: readOdds(data),
        preview: readPreview(data),
      },
    });
    return true;
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
    await rpc<null>("livescore_upsert_document", {
      fixture: fixtureId,
      document_kind: "upcoming_detail",
      document_payload: { unavailable: true },
    });
    return true;
  }
}

async function saveOdds(apiKey: string, fixtureId: string) {
  try {
    const data = await oneObject(apiKey, `/matches-bookmaker-odds?fixture_id=${fixtureId}`);
    await rpc<null>("livescore_upsert_document", {
      fixture: fixtureId,
      document_kind: "bookmaker_odds",
      document_payload: { books: readBookmakerOdds(data) },
    });
    return true;
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
    await rpc<null>("livescore_upsert_document", {
      fixture: fixtureId,
      document_kind: "bookmaker_odds",
      document_payload: { books: [] },
    });
    return true;
  }
}

function utcDate(offsetDays: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
