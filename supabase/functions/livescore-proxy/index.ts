import { HttpError, one, oneObject, oneRow, pages } from "../_shared/livescore/client.ts";
import { rpc } from "../_shared/livescore/db.ts";
import {
  mapGroups,
  normalizeEnded,
  normalizeLive,
  normalizeSide,
  normalizeUpcoming,
  readBookmakerOdds,
  readEvents,
  readLive,
  readOdds,
  readPreview,
  statsFromEnded,
  statsFromLive,
  type Phase,
} from "../_shared/livescore/normalize.ts";

const TTL = {
  live: 60,
  upcoming: 10 * 60,
  ended: 300,
  detail: 60,
  events: 60,
  lineups: 10 * 60,
  table: 6 * 60 * 60,
  radar: 60,
} as const;

const FRESH = {
  live: 6 * 60,
  prelive: 45 * 60,
} as const;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-expose-headers": "x-livescore-source",
  "cache-control": "no-store",
};

type Source = { source: "db" | "api" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "GET") {
    return json({ error: "Método não permitido." }, 405);
  }

  const apiKey = Deno.env.get("FUTODDS_API_KEY");
  if (!apiKey) {
    return json({ error: "A função ainda não tem a chave da API configurada." }, 500);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "";
  const ctx: Source = { source: "api" };

  try {
    if (action === "list") return json(await listAction(apiKey, url, ctx), 200, ctx);
    if (action === "detail") return json(await detailAction(apiKey, url, ctx), 200, ctx);
    if (action === "events") return json(await eventsAction(apiKey, url, ctx), 200, ctx);
    if (action === "lineups") return json(await lineupsAction(apiKey, url), 200, ctx);
    if (action === "table") return json(await tableAction(apiKey, url), 200, ctx);
    if (action === "radar") return json(await radarAction(apiKey), 200, ctx);
    if (action === "bookmaker_odds") return json(await bookmakerOddsAction(apiKey, url, ctx), 200, ctx);
    return json({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    const message =
      error instanceof HttpError ? error.message : "Não foi possível consultar os jogos.";
    return json({ error: message }, status);
  }
});

async function listAction(apiKey: string, url: URL, ctx: Source) {
  const date = readDate(url.searchParams.get("date"));
  const bucket = readBucket(url.searchParams.get("bucket"));
  if (bucket !== "ended") {
    const stored = await dbRead<{ matches: unknown[] }>("livescore_read_list", { bucket, day: date });
    if (stored && Array.isArray(stored.matches)) {
      ctx.source = "db";
      return { bucket, date, matches: stored.matches };
    }
  }
  return cached(`list:${bucket}:${date}`, ttlForBucket(bucket), async () => {
    if (bucket === "live") {
      const rows = await pages(apiKey, "/matches-live");
      return { bucket, date, matches: rows.map((row) => normalizeLive(row)) };
    }
    if (bucket === "ended") {
      const rows = await pages(
        apiKey,
        `/matches-ended-result?date_from=${date}&date_to=${date}`,
      );
      return { bucket, date, matches: rows.map((row) => normalizeEnded(row)) };
    }
    const rows = await pages(apiKey, `/matches-upcoming?date_from=${date}&date_to=${date}`);
    return { bucket, date, matches: rows.map((row) => normalizeUpcoming(row)) };
  });
}

async function detailAction(apiKey: string, url: URL, ctx: Source) {
  const fixtureId = readId(url.searchParams.get("fixture_id"), "fixture_id");
  const phase = await resolvePhase(apiKey, fixtureId, url.searchParams.get("phase"));
  if (phase !== "ended") {
    const payload = await storedPayload(
      fixtureId,
      phase === "live" ? "live_detail" : "upcoming_detail",
      phase === "live" ? FRESH.live : FRESH.prelive,
    );
    if (payload && payload.unavailable !== true && payload.phase === phase && payload.match) {
      ctx.source = "db";
      return payload;
    }
  }
  const cacheKey =
    phase === "upcoming"
      ? `detail:upcoming:v4:${fixtureId}`
      : phase === "live"
        ? `detail:live:v2:${fixtureId}`
        : `detail:${phase}:${fixtureId}`;
  const ttl = phase === "upcoming" ? TTL.upcoming : TTL.detail;
  return cached(cacheKey, ttl, async () => {
    if (phase === "live") {
      const data = await oneObject(apiKey, `/matches-live-detail?fixture_id=${fixtureId}`);
      return {
        phase,
        match: normalizeLive(data),
        stats: statsFromLive(data.stats),
        odds: readOdds(data),
        live: readLive(data),
      };
    }
    if (phase === "ended") {
      const data = await oneRow(apiKey, `/matches-ended-stats?fixture_id=${fixtureId}`);
      return {
        phase,
        match: normalizeEnded(data),
        stats: statsFromEnded(data.stats),
        odds: readOdds(data),
      };
    }
    const data = await oneObject(
      apiKey,
      `/matches-upcoming-detail?fixture_id=${fixtureId}&fields=stats_extra,match_leg`,
    );
    return {
      phase,
      match: normalizeUpcoming(data),
      stats: [],
      odds: readOdds(data),
      preview: readPreview(data),
    };
  });
}

async function eventsAction(apiKey: string, url: URL, ctx: Source) {
  const fixtureId = readId(url.searchParams.get("fixture_id"), "fixture_id");
  const phase = await resolvePhase(apiKey, fixtureId, url.searchParams.get("phase"));
  if (phase === "live") {
    const payload = await storedPayload(fixtureId, "events", FRESH.live);
    if (payload && Array.isArray(payload.events) && "timeline" in payload) {
      ctx.source = "db";
      return { events: payload.events, timeline: payload.timeline };
    }
  }
  return cached(`events:${phase}:${fixtureId}`, TTL.events, async () => {
    const eventsPath =
      phase === "ended"
        ? `/matches-ended-events?fixture_id=${fixtureId}`
        : `/matches-live-events?fixture_id=${fixtureId}`;
    let events: { text: string }[] = [];
    if (phase !== "upcoming") {
      try {
        const row = await oneRow(apiKey, eventsPath);
        events = readEvents(row);
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 404) throw error;
      }
    }
    let timeline: unknown = null;
    try {
      const row = await oneRow(apiKey, `/matches-stats-timeline?fixture_id=${fixtureId}`);
      timeline = row?.trend ?? null;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
    }
    return { events, timeline };
  });
}

async function lineupsAction(apiKey: string, url: URL) {
  const fixtureId = readId(url.searchParams.get("fixture_id"), "fixture_id");
  return cached(`lineups:${fixtureId}`, TTL.lineups, async () => {
    const data = await oneObject(apiKey, `/matches-lineups?fixture_id=${fixtureId}`);
    return {
      fixtureId,
      home: normalizeSide(data.home),
      away: normalizeSide(data.away),
    };
  });
}

async function tableAction(apiKey: string, url: URL) {
  const leagueId = readId(url.searchParams.get("league_id"), "league_id");
  return cached(`table:${leagueId}`, TTL.table, async () => {
    const data = await oneObject(apiKey, `/league-table?league_id=${leagueId}`);
    const tables = data.tables ?? {};
    return {
      leagueId,
      seasonName: data.season_name ? String(data.season_name) : null,
      tables: {
        overall: mapGroups(tables.overall),
        home: mapGroups(tables.home),
        away: mapGroups(tables.away),
      },
    };
  });
}

async function bookmakerOddsAction(apiKey: string, url: URL, ctx: Source) {
  const fixtureId = readId(url.searchParams.get("fixture_id"), "fixture_id");
  const payload = await storedPayload(fixtureId, "bookmaker_odds", FRESH.prelive);
  if (payload && Array.isArray(payload.books)) {
    ctx.source = "db";
    return { books: payload.books };
  }
  return cached(`bookmaker-odds:v1:${fixtureId}`, TTL.lineups, async () => {
    try {
      const data = await oneObject(apiKey, `/matches-bookmaker-odds?fixture_id=${fixtureId}`);
      return { books: readBookmakerOdds(data) };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return { books: [] };
      throw error;
    }
  });
}

async function radarAction(apiKey: string) {
  return cached("radar", TTL.radar, async () => {
    const rows = await pages(apiKey, "/matches-william-hill");
    const radars = rows
      .map((row) => {
        const fixtureId = row.fixture_id != null ? String(row.fixture_id) : "";
        const radarUrl = row.radar_urls?.dark?.pt;
        if (!fixtureId || typeof radarUrl !== "string") return null;
        return { fixtureId, url: radarUrl };
      })
      .filter((item): item is { fixtureId: string; url: string } => item !== null);
    return { radars };
  });
}

async function resolvePhase(apiKey: string, fixtureId: string, raw: string | null): Promise<Phase> {
  if (raw === "live" || raw === "ended" || raw === "upcoming") return raw;
  if (raw && raw !== "auto") throw new HttpError(400, "Fase inválida.");
  const stored = await dbRead<{ phase?: unknown }>("livescore_read_document", {
    fixture: fixtureId,
    document_kind: "live_detail",
    max_age_seconds: 0,
  });
  if (stored?.phase === "live" || stored?.phase === "upcoming" || stored?.phase === "ended") {
    return stored.phase;
  }
  for (const phase of ["live", "ended", "upcoming"] as const) {
    const found = await probe(apiKey, fixtureId, phase);
    if (found) return phase;
  }
  throw new HttpError(404, "Jogo não encontrado.");
}

async function probe(apiKey: string, fixtureId: string, phase: Phase) {
  const path =
    phase === "live"
      ? `/matches-live-detail?fixture_id=${fixtureId}`
      : phase === "ended"
        ? `/matches-ended-stats?fixture_id=${fixtureId}`
        : `/matches-upcoming-detail?fixture_id=${fixtureId}`;
  try {
    await one(apiKey, path);
    return true;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return false;
    throw error;
  }
}

function ttlForBucket(bucket: Phase) {
  if (bucket === "live") return TTL.live;
  if (bucket === "ended") return TTL.ended;
  return TTL.upcoming;
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = await cacheGet(key);
  if (hit != null) return hit as T;
  const value = await load();
  await cachePut(key, value, ttl);
  return value;
}

async function cacheGet(key: string) {
  const base = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !service) return null;
  try {
    const response = await fetch(`${base}/rest/v1/rpc/cache_get`, {
      method: "POST",
      headers: rpcHeaders(service),
      body: JSON.stringify({ key }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function cachePut(key: string, payload: unknown, ttl: number) {
  const base = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !service) return;
  try {
    await fetch(`${base}/rest/v1/rpc/cache_put`, {
      method: "POST",
      headers: rpcHeaders(service),
      body: JSON.stringify({ key, payload, ttl_seconds: ttl }),
    });
  } catch {
    // O placar continua mesmo sem a tabela de cache.
  }
}

function rpcHeaders(service: string) {
  return {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
  };
}

function readDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "Informe a data no formato AAAA-MM-DD.");
  }
  return value;
}

function readBucket(value: string | null): Phase {
  if (value === "live" || value === "ended" || value === "upcoming") return value;
  throw new HttpError(400, "Filtro inválido.");
}

function readId(value: string | null, label: string) {
  if (!value || !/^\d+$/.test(value)) throw new HttpError(400, `${label} inválido.`);
  return value;
}

async function dbRead<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    return await rpc<T | null>(fn, args);
  } catch {
    return null;
  }
}

async function storedPayload(fixtureId: string, kind: string, maxAge: number) {
  const stored = await dbRead<{ payload?: Record<string, any> | null }>("livescore_read_document", {
    fixture: fixtureId,
    document_kind: kind,
    max_age_seconds: maxAge,
  });
  const payload = stored?.payload;
  return payload && typeof payload === "object" ? payload : null;
}

function json(body: unknown, status = 200, ctx?: Source) {
  const headers: Record<string, string> = { ...cors, "content-type": "application/json; charset=utf-8" };
  if (ctx) headers["x-livescore-source"] = ctx.source;
  return new Response(JSON.stringify(body), { status, headers });
}
