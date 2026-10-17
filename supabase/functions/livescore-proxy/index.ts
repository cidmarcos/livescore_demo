const FUTODDS_BASE = "https://csv.futodds.com/functions/v1";
const PAGE_LIMIT = 80;
const MAX_PAGES = 8;
const MIN_GAP_MS = 220;

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

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "no-store",
};

type Phase = "live" | "ended" | "upcoming";

let lastCall = 0;

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

  try {
    if (action === "list") return json(await listAction(apiKey, url));
    if (action === "detail") return json(await detailAction(apiKey, url));
    if (action === "events") return json(await eventsAction(apiKey, url));
    if (action === "lineups") return json(await lineupsAction(apiKey, url));
    if (action === "table") return json(await tableAction(apiKey, url));
    if (action === "radar") return json(await radarAction(apiKey));
    return json({ error: "Ação desconhecida." }, 400);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    const message =
      error instanceof HttpError ? error.message : "Não foi possível consultar os jogos.";
    return json({ error: message }, status);
  }
});

async function listAction(apiKey: string, url: URL) {
  const date = readDate(url.searchParams.get("date"));
  const bucket = readBucket(url.searchParams.get("bucket"));
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

async function detailAction(apiKey: string, url: URL) {
  const fixtureId = readId(url.searchParams.get("fixture_id"), "fixture_id");
  const phase = await resolvePhase(apiKey, fixtureId, url.searchParams.get("phase"));
  return cached(`detail:${phase}:${fixtureId}`, TTL.detail, async () => {
    if (phase === "live") {
      const data = await oneObject(apiKey, `/matches-live-detail?fixture_id=${fixtureId}`);
      return {
        phase,
        match: normalizeLive(data),
        stats: statsFromLive(data.stats),
        odds: readOdds(data),
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
    const data = await oneObject(apiKey, `/matches-upcoming-detail?fixture_id=${fixtureId}`);
    return {
      phase,
      match: normalizeUpcoming(data),
      stats: [],
      odds: readOdds(data),
    };
  });
}

async function eventsAction(apiKey: string, url: URL) {
  const fixtureId = readId(url.searchParams.get("fixture_id"), "fixture_id");
  const phase = await resolvePhase(apiKey, fixtureId, url.searchParams.get("phase"));
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

async function pages(apiKey: string, path: string) {
  const rows: Record<string, any>[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const joiner = path.includes("?") ? "&" : "?";
    const data = await one(apiKey, `${path}${joiner}page=${page}&limit=${PAGE_LIMIT}`);
    const list = Array.isArray(data) ? data : [];
    let fresh = 0;
    for (const row of list) {
      const id = String(row.fixture_id ?? row.wh_event_id ?? rows.length + fresh);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      fresh += 1;
    }
    if (fresh === 0 || list.length < PAGE_LIMIT) break;
  }
  return rows;
}

async function oneObject(apiKey: string, path: string) {
  const data = await one(apiKey, path);
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  if (Array.isArray(data) && data[0]) return data[0];
  throw new HttpError(404, "Jogo não encontrado.");
}

async function oneRow(apiKey: string, path: string) {
  return oneObject(apiKey, path);
}

async function one(apiKey: string, path: string) {
  const { status, body } = await upstream(apiKey, path);
  if (status === 401 || status === 403) {
    throw new HttpError(status, "A API recusou o acesso.");
  }
  if (status === 429) {
    throw new HttpError(429, "Muitas requisições. Tente de novo em instantes.");
  }
  if (status === 404 || body?.success === false) {
    const missing = status === 404 || /not found/i.test(String(body?.error ?? ""));
    if (missing) throw new HttpError(404, "Jogo não encontrado.");
    throw new HttpError(status >= 400 ? status : 502, "Não foi possível consultar os jogos.");
  }
  if (status >= 400) {
    throw new HttpError(status, "Não foi possível consultar os jogos.");
  }
  return body?.data;
}

async function upstream(apiKey: string, path: string) {
  const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCall));
  if (wait > 0) await delay(wait);
  lastCall = Date.now();
  const response = await fetch(`${FUTODDS_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function normalizeLive(row: Record<string, any>) {
  const status = row.status ? String(row.status) : null;
  return card({
    row,
    phase: "live",
    homeName: row.home_name,
    awayName: row.away_name,
    kickoff: row.date ? String(row.date) : null,
    status,
    elapsed: numberOrNull(row.elapsed),
    score: scoreFromLive(row.scores, status),
  });
}

function normalizeEnded(row: Record<string, any>) {
  const kickoff = row.kickoff ? String(row.kickoff) : row.date ? String(row.date) : null;
  return card({
    row,
    phase: "ended",
    homeName: row.home_name,
    awayName: row.away_name,
    kickoff,
    status: "FT",
    elapsed: null,
    score: {
      home: numberOrNull(row.score?.ft_home),
      away: numberOrNull(row.score?.ft_away),
      htHome: numberOrNull(row.score?.ht_home),
      htAway: numberOrNull(row.score?.ht_away),
    },
  });
}

function normalizeUpcoming(row: Record<string, any>) {
  const unix = numberOrNull(row.time);
  const kickoff =
    unix != null
      ? new Date(unix * 1000).toISOString()
      : row.date
        ? String(row.date)
        : row.kickoff
          ? String(row.kickoff)
          : null;
  return card({
    row,
    phase: "upcoming",
    homeName: row.home_team_name ?? row.home_name,
    awayName: row.away_team_name ?? row.away_name,
    kickoff,
    status: null,
    elapsed: null,
    score: null,
  });
}

function card(input: {
  row: Record<string, any>;
  phase: Phase;
  homeName: unknown;
  awayName: unknown;
  kickoff: string | null;
  status: string | null;
  elapsed: number | null;
  score: { home: number | null; away: number | null; htHome: number | null; htAway: number | null } | null;
}) {
  const kickoff = input.kickoff;
  return {
    fixtureId: String(input.row.fixture_id),
    homeName: String(input.homeName ?? "Casa"),
    awayName: String(input.awayName ?? "Visitante"),
    homeImageId: textOrNull(input.row.home_image_id),
    awayImageId: textOrNull(input.row.away_image_id),
    leagueId: input.row.league_id != null ? String(input.row.league_id) : null,
    leagueName: String(input.row.league_name ?? input.row.competition_name ?? "Competição"),
    country: textOrNull(input.row.cc ?? input.row.competition_country),
    status: input.status,
    elapsed: input.elapsed,
    kickoff,
    kickoffMidnight: isMidnightUtc(kickoff),
    score: input.score,
    idBetfair: textOrNull(input.row.id_betfair),
    phase: input.phase,
  };
}

function scoreFromLive(scores: Record<string, { home?: unknown; away?: unknown }> | null, status: string | null) {
  if (!scores || typeof scores !== "object") return null;
  const keys = Object.keys(scores).sort((a, b) => Number(a) - Number(b));
  const current = scores[keys[keys.length - 1] ?? ""] ?? {};
  const first = scores["1"] ?? {};
  return {
    home: numberOrNull(current.home),
    away: numberOrNull(current.away),
    htHome: status === "HT_1ST" ? null : numberOrNull(first.home),
    htAway: status === "HT_1ST" ? null : numberOrNull(first.away),
  };
}

const LIVE_STATS: [string, string][] = [
  ["possession_rt", "Posse de bola"],
  ["xg", "xG"],
  ["on_target", "Chutes no gol"],
  ["off_target", "Chutes para fora"],
  ["corners", "Escanteios"],
  ["yellowcards", "Cartões amarelos"],
  ["redcards", "Cartões vermelhos"],
  ["attacks", "Ataques"],
  ["dangerous_attacks", "Ataques perigosos"],
];

const ENDED_STATS: [string, string][] = [
  ["possession", "Posse de bola"],
  ["xg", "xG"],
  ["on_target", "Chutes no gol"],
  ["off_target", "Chutes para fora"],
  ["corners", "Escanteios"],
  ["yellowcards", "Cartões amarelos"],
  ["redcards", "Cartões vermelhos"],
  ["attacks", "Ataques"],
  ["dangerous_attacks", "Ataques perigosos"],
];

function statsFromLive(stats: Record<string, unknown> | null) {
  if (!stats) return [];
  return LIVE_STATS.flatMap(([key, label]) => {
    const value = stats[key];
    if (!Array.isArray(value)) return [];
    const home = numberOrNull(value[0]);
    const away = numberOrNull(value[1]);
    if (home == null || away == null) return [];
    return [{ key, label, home, away }];
  });
}

function statsFromEnded(stats: { ft?: Record<string, { home?: unknown; away?: unknown }> } | null) {
  const ft = stats?.ft;
  if (!ft) return [];
  return ENDED_STATS.flatMap(([key, label]) => {
    const value = ft[key];
    if (!value) return [];
    const home = numberOrNull(value.home);
    const away = numberOrNull(value.away);
    if (home == null || away == null) return [];
    return [{ key, label, home, away }];
  });
}

function readOdds(row: Record<string, any>) {
  const ft = row.odds?.ft_result ?? row.bf_odds?.ft_result;
  const home = numberOrNull(ft?.home);
  const draw = numberOrNull(ft?.draw);
  const away = numberOrNull(ft?.away);
  if (home == null || draw == null || away == null) return null;
  return { home, draw, away };
}

function readEvents(row: Record<string, any>) {
  const list = Array.isArray(row?.events) ? row.events : [];
  return list
    .map((item: { text?: unknown }) => ({ text: String(item?.text ?? "") }))
    .filter((item: { text: string }) => item.text.length > 0);
}

function normalizeSide(side: Record<string, any> | null) {
  if (!side) return null;
  return {
    name: String(side.name ?? ""),
    formation: textOrNull(side.formation),
    coach: textOrNull(side.coach),
    lineupStatus: textOrNull(side.lineup_status),
    starters: players(side.starters),
    substitutes: players(side.substitutes),
    unconfirmed: players(side.unconfirmed),
    topPlayers: players(side.top_players),
    missing: missingPlayers(side.missing),
  };
}

function players(list: unknown) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    name: String(item?.name ?? item?.player_name ?? "Jogador"),
    shirtNumber: numberOrNull(item?.shirt_number ?? item?.number),
    position: textOrNull(item?.position),
    imageUrl: textOrNull(item?.image_url),
  }));
}

function missingPlayers(list: unknown) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (typeof item === "string") return { name: item, reason: null };
    return {
      name: String(item?.name ?? item?.player ?? item?.player_name ?? "Jogador"),
      reason: textOrNull(item?.reason ?? item?.status ?? item?.injury),
    };
  });
}

function mapGroups(groups: unknown) {
  if (!Array.isArray(groups)) return [];
  return groups.map((group) => ({
    groupName: String(group?.group_name ?? ""),
    standings: Array.isArray(group?.standings) ? group.standings.map(mapStanding) : [],
  }));
}

function mapStanding(row: Record<string, any>) {
  return {
    pos: numberOrNull(row.pos) ?? 0,
    teamName: String(row.team_name ?? ""),
    teamImageId: textOrNull(row.team_image_id),
    played: numberOrNull(row.games_played) ?? 0,
    win: numberOrNull(row.win) ?? 0,
    draw: numberOrNull(row.draw) ?? 0,
    loss: numberOrNull(row.loss) ?? 0,
    goalsFor: numberOrNull(row.goals_for) ?? 0,
    goalsAgainst: numberOrNull(row.goals_against) ?? 0,
    goalDiff: numberOrNull(row.goal_diff) ?? 0,
    points: numberOrNull(row.points) ?? 0,
  };
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

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: unknown) {
  if (value == null || value === "") return null;
  return String(value);
}

function isMidnightUtc(value: string | null) {
  if (!value) return false;
  return /T00:00:00(?:\.0+)?(?:Z|\+00:00)$/.test(value);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });
}
