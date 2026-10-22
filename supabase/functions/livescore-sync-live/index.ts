import { HttpError, oneObject, oneRow, pages } from "../_shared/livescore/client.ts";
import { rpc } from "../_shared/livescore/db.ts";
import { normalizeLive, readEvents, readLive, readOdds, statsFromLive } from "../_shared/livescore/normalize.ts";
import { accept, budget, unauthorized, withRun } from "../_shared/livescore/run.ts";

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
  return accept(withRun("live", 200, () => syncLive(apiKey)));
});

async function optional<T>(load: () => Promise<T>) {
  try {
    return await load();
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

async function syncLive(apiKey: string) {
  const over = budget(130_000);
  const rows = await pages(apiKey, "/matches-live");
  const cards = rows.map((row) => normalizeLive(row)).filter((card) => /^\d+$/.test(card.fixtureId));
  const listed = await rpc<number>("livescore_upsert_fixtures", { rows: cards });
  let details = 0;
  let events = 0;
  let missed = 0;
  let partial = false;

  for (const card of cards) {
    if (over()) {
      partial = true;
      break;
    }
    try {
      const data = await oneObject(apiKey, `/matches-live-detail?fixture_id=${card.fixtureId}`);
      await rpc<null>("livescore_upsert_document", {
        fixture: card.fixtureId,
        document_kind: "live_detail",
        document_payload: {
          phase: "live",
          match: normalizeLive(data),
          stats: statsFromLive(data.stats),
          odds: readOdds(data),
          live: readLive(data),
        },
      });
      details += 1;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      missed += 1;
    }

    if (over()) {
      partial = true;
      break;
    }
    const list = await optional(async () =>
      readEvents(await oneRow(apiKey, `/matches-live-events?fixture_id=${card.fixtureId}`)),
    );
    const timeline = over()
      ? null
      : await optional(async () => {
          const row = await oneRow(apiKey, `/matches-stats-timeline?fixture_id=${card.fixtureId}`);
          return row?.trend ?? null;
        });
    if (list != null || timeline != null) {
      await rpc<null>("livescore_upsert_document", {
        fixture: card.fixtureId,
        document_kind: "events",
        document_payload: { events: list ?? [], timeline },
      });
      events += 1;
    }
  }

  const ended = await rpc<number>("livescore_mark_ended", {
    live_ids: cards.map((card) => card.fixtureId),
  });

  return {
    partial,
    fixturesSeen: cards.length,
    fixturesSaved: details,
    detail: { listed, details, events, missed, ended },
  };
}
