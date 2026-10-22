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
    if (action === "bookmaker_odds") return json(await bookmakerOddsAction(apiKey, url));
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

async function bookmakerOddsAction(apiKey: string, url: URL) {
  const fixtureId = readId(url.searchParams.get("fixture_id"), "fixture_id");
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

const TEAM_STATS: [string, string][] = [
  ["ppj", "Pontos por jogo"],
  ["win_pct", "Vitórias"],
  ["avg_goals_scored", "Gols marcados"],
  ["avg_goals_conceded", "Gols sofridos"],
  ["xg", "xG"],
  ["btts_pct", "Ambas marcam"],
  ["over_25_pct", "Over 2.5"],
  ["corners_ft_avg", "Escanteios"],
  ["clean_sheet_pct", "Sem sofrer gols"],
];

const BOOK_NAMES: Record<string, string> = {
  bet365: "Bet365",
  betfair: "Betfair",
  pinnacle: "Pinnacle",
  betano: "Betano",
  superbet: "Superbet",
  betbra: "BetBra",
};

function readPreview(row: Record<string, any>) {
  const homeName = String(row.home_name ?? row.home_team_name ?? "");
  const awayName = String(row.away_name ?? row.away_team_name ?? "");
  return {
    competition: readCompetition(row.competition),
    standings: readStandings(row.standings),
    probability: readProbability(row.probability),
    books: readBooks(row.odds),
    markets: readPreviewMarkets(row.odds),
    teamStats: pairStats(row.stats?.home, row.stats?.away, TEAM_STATS),
    extraStats: pairExtra(row.stats_extra?.home, row.stats_extra?.away),
    statGroups: [
      ...readTeamGroups(row.stats?.home, row.stats?.away),
      ...readExtraGroups(row.stats_extra?.home, row.stats_extra?.away),
    ],
    facts: readFacts(row.stats?.match),
    venue: venueName(row.venue),
    season: textOrNull(row.season),
    correctScores: readCorrectScores(row.correct_scores),
    matchLeg: readMatchLeg(row.match_leg),
    firstLeg: readFirstLeg(row.first_leg_score),
    otherNames: {
      home: alternateName(row.other_names?.home, homeName),
      away: alternateName(row.other_names?.away, awayName),
    },
  };
}

function readCompetition(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object") return null;
  const competition = {
    type: textOrNull(raw.type),
    seasonProgress: numberOrNull(raw.season_progress),
    isFriendly: boolOrNull(raw.is_friendly),
    isCup: boolOrNull(raw.is_cup),
    predictability: textOrNull(raw.predictability),
  };
  const empty =
    !competition.type &&
    competition.seasonProgress == null &&
    competition.isFriendly == null &&
    competition.isCup == null &&
    !competition.predictability;
  return empty ? null : competition;
}

function readStandings(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object") return null;
  const standings = {
    homePosition: numberOrNull(raw.home_position),
    awayPosition: numberOrNull(raw.away_position),
    homePlayed: numberOrNull(raw.home_played),
    awayPlayed: numberOrNull(raw.away_played),
  };
  if (standings.homePosition == null && standings.awayPosition == null) return null;
  return standings;
}

const PROBABILITY_GROUPS: [string, [string, string][]][] = [
  ["Resultado", [["home_win", "Casa"], ["draw", "Empate"], ["away_win", "Fora"]]],
  ["1º tempo", [["home_win_ht", "Casa"], ["draw_ht", "Empate"], ["away_win_ht", "Fora"]]],
  ["Primeiro gol", [["home_score_first", "Casa"], ["draw_score_first", "Nenhum"], ["away_score_first", "Fora"]]],
  ["Dupla chance", [["double_chance_1x", "1X"], ["double_chance_12", "12"], ["double_chance_x2", "X2"]]],
  ["Gols", [
    ["o05", "Over 0.5"], ["u05", "Under 0.5"],
    ["o15", "Over 1.5"], ["u15", "Under 1.5"],
    ["o25", "Over 2.5"], ["u25", "Under 2.5"],
    ["o35", "Over 3.5"], ["u35", "Under 3.5"],
    ["o45", "Over 4.5"], ["u45", "Under 4.5"],
    ["o0_1h_goals", "Over 0.5 no 1º tempo"],
  ]],
  ["Ambas marcam", [["btts", "Sim"], ["btts_no", "Não"]]],
  ["Gols dos times", [
    ["o05_home_goals", "Casa over 0.5"],
    ["o15_home_goals", "Casa over 1.5"],
    ["o05_away_goals", "Fora over 0.5"],
    ["o15_away_goals", "Fora over 1.5"],
  ]],
];

const CORNER_LINES: [string, string, string | null][] = [
  ["o4_corners", "Over 4.5", null],
  ["o5_corners", "Over 5.5", null],
  ["o6_corners", "Over 6.5", null],
  ["o7_corners", "Over 7.5", null],
  ["o8_corners", "Over 8.5", "o85_corners"],
  ["o9_corners", "Over 9.5", "o95_corners"],
  ["o10_corners", "Over 10.5", "o105_corners"],
  ["o11_corners", "Over 11.5", null],
];

function readProbability(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const scale = probabilityScale(raw);
  const num = (value: unknown) => {
    const parsed = numberOrNull(value);
    if (parsed == null) return null;
    return scale ? parsed * 100 : parsed;
  };
  const home = num(raw.home_win ?? raw.home);
  const draw = num(raw.draw);
  const away = num(raw.away_win ?? raw.away);
  const known = new Set(PROBABILITY_GROUPS.flatMap(([, lines]) => lines.map(([key]) => key)));
  known.add("o05_1h");
  for (const [key, , alias] of CORNER_LINES) {
    known.add(key);
    if (alias) known.add(alias);
  }
  const groups = PROBABILITY_GROUPS.flatMap(([title, lines]) => {
    const rows = lines.flatMap(([key, label]) => {
      const value = num(key === "o0_1h_goals" ? raw.o0_1h_goals ?? raw.o05_1h : raw[key]);
      return value == null ? [] : [{ key, label, value }];
    });
    return rows.length > 0 ? [{ title, lines: rows }] : [];
  });
  const corners = CORNER_LINES.flatMap(([key, label, alias]) => {
    const value = num(raw[key] ?? (alias ? raw[alias] : null));
    return value == null ? [] : [{ key, label, value }];
  });
  if (corners.length > 0) groups.push({ title: "Escanteios", lines: corners });
  const others = Object.entries(raw).flatMap(([key, value]) => {
    if (known.has(key) || key === "home" || key === "away") return [];
    const parsed = num(value);
    return parsed == null ? [] : [{ key, label: labelFromKey(key), value: parsed }];
  });
  if (others.length > 0) groups.push({ title: "Outros", lines: others });
  if (home == null || draw == null || away == null) return null;
  return {
    home,
    draw,
    away,
    btts: num(raw.btts ?? raw.btts_yes),
    over25: num(raw.o25 ?? raw.over25 ?? raw.over_25),
    under25: num(raw.u25 ?? raw.under25 ?? raw.under_25),
    groups,
  };
}

function probabilityScale(raw: Record<string, any>) {
  const sample = [raw.home_win ?? raw.home, raw.draw, raw.away_win ?? raw.away, raw.btts, raw.o25]
    .map((value) => numberOrNull(value))
    .filter((value): value is number => value != null);
  return sample.length > 0 && sample.every((value) => value <= 1);
}

const MARKET_KEYS = new Set(["ft_result", "ht_result", "btts", "over_under", "correct_score", "correct_scores"]);

function readPreviewMarkets(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const known = new Set(BOOKMAKER_MARKETS);
  const keys = [
    ...BOOKMAKER_MARKETS.filter((key) => isPriceMap(raw[key])),
    ...Object.keys(raw).filter((key) => !known.has(key) && isPriceMap(raw[key]) && !isBookmakerQuote(raw[key])),
  ];
  return keys.flatMap((key) => {
    const outcomes = readFlatPrices(raw[key]);
    return outcomes.length > 0 ? [{ key, outcomes }] : [];
  });
}

function isPriceMap(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBookmakerQuote(value: Record<string, any>) {
  if (!priceTriple(value)) return false;
  return Object.keys(value).every((key) => key === "home" || key === "draw" || key === "away");
}

function readFlatPrices(raw: Record<string, any>) {
  return Object.entries(raw).flatMap(([key, value]) => {
    const closing = numberOrNull(value);
    if (closing == null || closing <= 1) return [];
    return [{ key, opening: null, closing, peak: null }];
  });
}

function readBooks(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object") return [];
  const books = [];
  for (const [key, value] of Object.entries(raw)) {
    if (MARKET_KEYS.has(key)) continue;
    const price = priceTriple(value) ?? priceTriple(value?.ft_result);
    if (!price) continue;
    books.push({ name: BOOK_NAMES[key] ?? labelFromKey(key), ...price });
  }
  return books;
}

function priceTriple(value: any) {
  const home = numberOrNull(value?.home);
  const draw = numberOrNull(value?.draw);
  const away = numberOrNull(value?.away);
  if (home == null || draw == null || away == null) return null;
  return { home, draw, away };
}

function pairStats(
  home: Record<string, any> | null,
  away: Record<string, any> | null,
  fields: [string, string][],
) {
  if (!home || !away) return [];
  return fields.flatMap(([key, label]) => {
    const homeValue = numberOrNull(home[key]);
    const awayValue = numberOrNull(away[key]);
    if (homeValue == null || awayValue == null) return [];
    return [{ key, label, home: homeValue, away: awayValue }];
  });
}

const STAT_GROUPS: [string, [string, string][]][] = [
  ["Desempenho", [
    ["ppj", "Pontos por jogo"],
    ["win_pct", "Vitórias"],
    ["draw_pct", "Empates"],
    ["loss_pct", "Derrotas"],
    ["games_used", "Jogos na amostra"],
  ]],
  ["1º tempo", [
    ["ppj_ht", "Pontos por jogo"],
    ["win_ht_pct", "Vitórias"],
    ["draw_ht_pct", "Empates"],
    ["loss_ht_pct", "Derrotas"],
  ]],
  ["Gols", [
    ["avg_goals_scored", "Gols marcados"],
    ["avg_goals_conceded", "Gols sofridos"],
    ["avg_goals", "Média de gols"],
    ["avg_goals_scored_ht", "Gols marcados no 1º tempo"],
    ["avg_goals_conceded_ht", "Gols sofridos no 1º tempo"],
    ["avg_goals_ht", "Média no 1º tempo"],
    ["xg", "xG"],
  ]],
  ["Especial", [
    ["btts_pct", "Ambas marcam"],
    ["btts_no_pct", "Ambas não marcam"],
    ["clean_sheet_pct", "Sem sofrer gols"],
    ["failed_to_score_pct", "Não marcou"],
  ]],
  ["Over", [
    ["over_05_pct", "Over 0.5"],
    ["over_15_pct", "Over 1.5"],
    ["over_25_pct", "Over 2.5"],
    ["over_35_pct", "Over 3.5"],
    ["over_45_pct", "Over 4.5"],
    ["over_55_pct", "Over 5.5"],
    ["over_05_ht_pct", "Over 0.5 no 1º tempo"],
    ["over_15_ht_pct", "Over 1.5 no 1º tempo"],
  ]],
  ["Under", [
    ["under_05_pct", "Under 0.5"],
    ["under_15_pct", "Under 1.5"],
    ["under_25_pct", "Under 2.5"],
    ["under_35_pct", "Under 3.5"],
    ["under_45_pct", "Under 4.5"],
    ["under_55_pct", "Under 5.5"],
    ["under_05_ht_pct", "Under 0.5 no 1º tempo"],
    ["under_15_ht_pct", "Under 1.5 no 1º tempo"],
  ]],
  ["Gols marcados e sofridos", [
    ["over_15_scored_pct", "Marcou over 1.5"],
    ["over_25_scored_pct", "Marcou over 2.5"],
    ["over_05_conceded_pct", "Sofreu over 0.5"],
    ["over_15_conceded_pct", "Sofreu over 1.5"],
    ["over_25_conceded_pct", "Sofreu over 2.5"],
  ]],
  ["Escanteios", [
    ["corners_ft_avg", "Média"],
    ["corners_ht_avg", "Média no 1º tempo"],
  ]],
];

const FACT_GROUPS: [string, [string, string][]][] = [
  ["Projeção de gols", [
    ["projected_home_goals_ft", "Casa"],
    ["projected_away_goals_ft", "Visitante"],
    ["projected_total_goals_ft", "Total"],
    ["projected_home_goals_ht", "Casa no 1º tempo"],
    ["projected_away_goals_ht", "Visitante no 1º tempo"],
    ["projected_total_goals_ht", "Total no 1º tempo"],
  ]],
  ["Médias combinadas", [
    ["combined_goals_ft_avg", "Gols"],
    ["combined_goals_ht_avg", "Gols no 1º tempo"],
    ["combined_xg_avg", "xG"],
    ["combined_corners_ft_avg", "Escanteios"],
    ["combined_corners_ht_avg", "Escanteios no 1º tempo"],
  ]],
  ["Diferença entre os times", [
    ["goals_ft_avg_difference", "Gols"],
    ["goals_ht_avg_difference", "Gols no 1º tempo"],
    ["xg_difference", "xG"],
    ["ppg_ft_difference", "Pontos por jogo"],
    ["ppg_ht_difference", "Pontos no 1º tempo"],
  ]],
  ["Combinação", [
    ["combined_btts_yes_percentage", "Ambas marcam"],
    ["combined_btts_no_percentage", "Ambas não marcam"],
    ["combined_over05_ft_percentage", "Over 0.5"],
    ["combined_over15_ft_percentage", "Over 1.5"],
    ["combined_over25_ft_percentage", "Over 2.5"],
    ["combined_over35_ft_percentage", "Over 3.5"],
    ["combined_over45_ft_percentage", "Over 4.5"],
    ["combined_over55_ft_percentage", "Over 5.5"],
    ["combined_under25_ft_percentage", "Under 2.5"],
    ["combined_over05_ht_percentage", "Over 0.5 no 1º tempo"],
    ["combined_over15_ht_percentage", "Over 1.5 no 1º tempo"],
  ]],
];

type ExtraField = { key: string; label: string; kind: "avg" | "pct" | "simple" | "over"; line?: string };

function readTeamGroups(home: Record<string, any> | null, away: Record<string, any> | null) {
  return STAT_GROUPS.flatMap(([title, fields]) => {
    const stats = pairStats(home, away, fields);
    return stats.length > 0 ? [{ title, stats }] : [];
  });
}

function readFacts(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object") return [];
  return FACT_GROUPS.flatMap(([title, fields]) => {
    const lines = fields.flatMap(([key, label]) => {
      const value = numberOrNull(raw[key]);
      return value == null ? [] : [{ key, label, value }];
    });
    return lines.length > 0 ? [{ title, lines }] : [];
  });
}

function readExtraGroups(home: Record<string, any> | null, away: Record<string, any> | null) {
  if (!home || !away) return [];
  return extraCatalog().flatMap((group) => {
    const stats = group.fields.flatMap((field) => {
      const homeValue = extraNumber(home, field);
      const awayValue = extraNumber(away, field);
      if (homeValue == null || awayValue == null) return [];
      const key = field.line ? `${field.key}_${field.line}` : field.key;
      const percent = field.kind === "pct" || field.kind === "over" || /accuracy|conversion/.test(field.key);
      return [{ key: percent ? `${key}_pct` : key, label: field.label, home: homeValue, away: awayValue }];
    });
    return stats.length > 0 ? [{ title: group.title, stats }] : [];
  });
}

function extraCatalog(): { title: string; fields: ExtraField[] }[] {
  const over = (key: string, lines: string[]) =>
    lines.map((line) => ({ key, line, label: `Over ${line.slice(1)}.5`, kind: "over" as const }));
  return [
    { title: "Momento dos gols", fields: [
      { key: "scored_first", label: "Marcou primeiro", kind: "pct" },
      { key: "conceded_first", label: "Sofreu primeiro", kind: "pct" },
      { key: "scored_after_70", label: "Marcou após os 70", kind: "pct" },
      { key: "conceded_after_70", label: "Sofreu após os 70", kind: "pct" },
      { key: "btts_1h", label: "Ambas marcam no 1º tempo", kind: "pct" },
      { key: "btts_2h", label: "Ambas marcam no 2º tempo", kind: "pct" },
    ] },
    { title: "xG recente", fields: [
      { key: "xg_for", label: "xG a favor", kind: "avg" },
      { key: "xg_against", label: "xG contra", kind: "avg" },
      { key: "xg_total", label: "xG total", kind: "avg" },
    ] },
    { title: "Finalizações", fields: [
      { key: "shots_for", label: "A favor", kind: "avg" },
      { key: "shots_against", label: "Sofridas", kind: "avg" },
      { key: "shots_on_for", label: "No gol", kind: "avg" },
      { key: "shots_on_against", label: "No gol sofridas", kind: "avg" },
      { key: "sot_accuracy", label: "Precisão", kind: "simple" },
      { key: "shot_conversion", label: "Conversão", kind: "simple" },
    ] },
    { title: "Escanteios recentes", fields: [
      { key: "corners_for", label: "A favor", kind: "avg" },
      { key: "corners_against", label: "Contra", kind: "avg" },
      { key: "corners_total", label: "Total", kind: "avg" },
      { key: "corners_1h_for", label: "A favor no 1º tempo", kind: "avg" },
      ...over("corners_over", ["o7", "o8", "o9", "o10", "o11"]),
    ] },
    { title: "Cartões", fields: [
      { key: "cards_for", label: "A favor", kind: "avg" },
      { key: "cards_against", label: "Contra", kind: "avg" },
      { key: "yellow_cards_for", label: "Amarelos", kind: "avg" },
      { key: "red_cards_for", label: "Vermelhos", kind: "avg" },
      ...over("cards_over", ["o2", "o3", "o4", "o5"]),
    ] },
    { title: "Posse e ataques", fields: [
      { key: "possession_for", label: "Posse", kind: "avg" },
      { key: "attacks_for", label: "Ataques", kind: "avg" },
      { key: "dangerous_attacks_for", label: "Ataques perigosos", kind: "avg" },
      { key: "fouls_committed", label: "Faltas cometidas", kind: "avg" },
      { key: "fouls_won", label: "Faltas sofridas", kind: "avg" },
    ] },
  ];
}

function extraNumber(side: Record<string, any>, field: ExtraField) {
  const node = side[field.key];
  if (field.kind === "avg") return numberOrNull(node?.total_avg);
  if (field.kind === "pct") return numberOrNull(node?.total_percentage);
  if (field.kind === "over") return numberOrNull(node?.[field.line ?? ""]?.total_percentage);
  return numberOrNull(node?.total ?? node);
}

function venueName(value: unknown) {
  if (typeof value === "string") return textOrNull(value);
  if (value && typeof value === "object") return textOrNull((value as { name?: unknown }).name);
  return null;
}

function pairExtra(home: Record<string, any> | null, away: Record<string, any> | null) {
  if (!home || !away) return [];
  const skip = new Set(["team_id", "id"]);
  return Object.keys(home)
    .filter((key) => !skip.has(key) && numberOrNull(home[key]) != null && numberOrNull(away[key]) != null)
    .slice(0, 8)
    .map((key) => ({
      key,
      label: labelFromKey(key),
      home: numberOrNull(home[key]) ?? 0,
      away: numberOrNull(away[key]) ?? 0,
    }));
}

function readCorrectScores(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const rows = Object.entries(raw)
    .filter(([key]) => /^\d+-\d+$/.test(key))
    .flatMap(([score, value]) => {
      const probability = numberOrNull(value);
      return probability != null && probability > 0 ? [{ score, probability }] : [];
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 12);
  const fractional = rows.length > 0 && rows.every((row) => row.probability <= 1);
  return fractional ? rows.map((row) => ({ ...row, probability: row.probability * 100 })) : rows;
}

function readMatchLeg(value: unknown) {
  if (value === "single" || value === "first" || value === "second") return value;
  return null;
}

function readFirstLeg(raw: Record<string, any> | null) {
  const home = numberOrNull(raw?.home);
  const away = numberOrNull(raw?.away);
  if (home == null || away == null) return null;
  return { home, away };
}

function alternateName(value: unknown, main: string) {
  const name = textOrNull(value);
  if (!name || name.trim().toLowerCase() === main.trim().toLowerCase()) return null;
  return name;
}

function labelFromKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function boolOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

const PRESSURE_METRICS: [string, string][] = [
  ["pi1", "PI1"],
  ["pi2", "PI2"],
  ["pi3", "PI3"],
  ["appm", "APPM"],
  ["appm10", "APPM 10"],
  ["cg", "CG"],
  ["cg10", "CG 10"],
  ["h2h", "H2H"],
];

const WINDOW_STATS: [string, string][] = [
  ["attacks", "Ataques"],
  ["dangerous_attacks", "Ataques perigosos"],
  ["on_target", "Chutes no gol"],
  ["off_target", "Chutes para fora"],
  ["corners", "Escanteios"],
  ["total_shots", "Finalizações"],
];

const WINDOW_FIELDS: [string, 5 | 10 | 15 | 20][] = [
  ["last5min_stats", 5],
  ["last10min_stats", 10],
  ["last15min_stats", 15],
  ["last20min_stats", 20],
];

function readLive(row: Record<string, any>) {
  const books = readBooks(row.odds);
  const betfair = betfairBack(row);
  if (betfair && !books.some((book) => book.name === "Betfair")) books.unshift(betfair);
  return {
    pressure: readPressure(row.pressure_indices),
    windows: WINDOW_FIELDS.flatMap(([field, minutes]) => {
      const stats = pairStats(windowSide(row[field]?.home), windowSide(row[field]?.away), WINDOW_STATS);
      return stats.length > 0 ? [{ minutes, stats }] : [];
    }),
    opta: readOpta(row.opta_data),
    books,
  };
}

function windowSide(side: Record<string, any> | null) {
  if (!side || typeof side !== "object") return null;
  return {
    attacks: side.attacks,
    dangerous_attacks: side.dangerous_attacks ?? side.dangerousAttacks,
    on_target: side.on_target ?? side.onTarget,
    off_target: side.off_target ?? side.offTarget,
    corners: side.corners,
    total_shots: side.total_shots ?? side.totalShots ?? side.shots,
  };
}

function readPressure(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object") return [];
  const direct = pairStats(raw.home, raw.away, PRESSURE_METRICS);
  if (direct.length > 0) return direct;
  for (const key of ["last_5min", "last_10min", "last_15min", "last_20min"]) {
    const window = raw[key];
    const stats = pairStats(window?.home, window?.away, PRESSURE_METRICS);
    if (stats.length > 0) return stats;
  }
  return [];
}

function betfairBack(row: Record<string, any>) {
  const direct = priceTriple(row.bf_odds?.ft_result);
  if (direct) return { name: "Betfair", ...direct };
  const markets = Array.isArray(row.bf_odds?.markets) ? row.bf_odds.markets : [];
  const market = markets.find((item: { type?: string }) => /match_odds/i.test(String(item?.type ?? "")));
  const runners = Array.isArray(market?.runners) ? market.runners : [];
  const price = (name: string) => {
    const runner = runners.find((item: { name?: string }) => String(item?.name ?? "").toLowerCase() === name);
    const back = runner?.odds?.back?.[0]?.price ?? runner?.odds?.back;
    return numberOrNull(Array.isArray(back) ? back[0]?.price : back);
  };
  const home = price(String(row.home_name ?? "").toLowerCase()) ?? price("home");
  const draw = price("the draw") ?? price("draw");
  const away = price(String(row.away_name ?? "").toLowerCase()) ?? price("away");
  if (home == null || draw == null || away == null) return null;
  return { name: "Betfair", home, draw, away };
}

function readOpta(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object") return [];
  if (Array.isArray(raw.statistics)) return optaFromStatistics(raw.statistics);
  if (Array.isArray(raw.DATA)) return optaFromLegacy(raw.DATA);
  return [];
}

function optaFromStatistics(periods: Record<string, any>[]) {
  const period =
    periods.find((item) => /^(all|ft|full|jogo)$/i.test(String(item?.period ?? ""))) ?? periods[0];
  const groups = Array.isArray(period?.groups) ? period.groups : [];
  return groups
    .slice(0, 8)
    .flatMap((group: Record<string, any>) => {
      const items = Array.isArray(group.statisticsItems) ? group.statisticsItems : [];
      const rows = items.slice(0, 12).flatMap((item: Record<string, any>) => optaRow(item.name ?? item.key, item.home, item.away));
      return rows.length > 0 ? [{ title: optaTitle(group.groupName), rows }] : [];
    });
}

function optaFromLegacy(stages: Record<string, any>[]) {
  const stage =
    stages.find((item) => /jogo|all|full|ft/i.test(String(item?.STAGE_NAME ?? ""))) ?? stages[0];
  const groups = Array.isArray(stage?.GROUPS) ? stage.GROUPS : [];
  return groups
    .slice(0, 8)
    .flatMap((group: Record<string, any>) => {
      const items = Array.isArray(group.ITEMS) ? group.ITEMS : [];
      const rows = items
        .slice(0, 12)
        .flatMap((item: Record<string, any>) => optaRow(item.INCIDENT_NAME, item.VALUE_HOME, item.VALUE_AWAY));
      return rows.length > 0 ? [{ title: optaTitle(group.GROUP_LABEL), rows }] : [];
    });
}

function optaRow(label: unknown, home: unknown, away: unknown) {
  const title = textOrNull(label);
  const homeText = textOrNull(home);
  const awayText = textOrNull(away);
  if (!title || homeText == null || awayText == null) return [];
  return [{ label: title, home: homeText, away: awayText, homeValue: numberFromText(home), awayValue: numberFromText(away) }];
}

function numberFromText(value: unknown) {
  const direct = numberOrNull(value);
  if (direct != null) return direct;
  const text = textOrNull(value);
  if (!text) return null;
  const match = text.replace("%", "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function optaTitle(value: unknown) {
  const labels: Record<string, string> = {
    "match overview": "Destaque",
    shots: "Finalizações",
    attack: "Ataque",
    passes: "Passes",
    duels: "Duelos",
    defending: "Defesa",
    goalkeeping: "Goleiro",
    discipline: "Disciplina",
  };
  const text = textOrNull(value) ?? "Opta";
  return labels[text.toLowerCase()] ?? text;
}

const BOOKMAKER_MARKETS = [
  "ft_result",
  "ht_result",
  "double_chance",
  "dnb",
  "btts",
  "btts_1h",
  "btts_2h",
  "btts_o25",
  "highest_scoring_half",
  "asian_handicap",
  "total_goals",
  "total_goals_1h",
  "total_goals_2h",
  "home_goals",
  "away_goals",
  "goal_line",
  "goal_line_1h",
  "total_corners",
  "asian_corners",
  "asian_corners_1h",
];

function readBookmakerOdds(row: Record<string, any>) {
  const books = [
    ["pinnacle", "Pinnacle", row.pinnacle ?? row.Pinnacle],
    ["bet365", "Bet365", row.bet365 ?? row.Bet365],
  ] as const;
  return books.flatMap(([, name, markets]) => {
    const read = readBookmakerMarkets(markets);
    return read.length > 0 ? [{ name, markets: read }] : [];
  });
}

function readBookmakerMarkets(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const known = new Set(BOOKMAKER_MARKETS);
  const keys = [
    ...BOOKMAKER_MARKETS.filter((key) => raw[key]),
    ...Object.keys(raw).filter((key) => !known.has(key)),
  ];
  return keys.flatMap((key) => {
    const outcomes = readBookmakerOutcomes(raw[key]);
    return outcomes.length > 0 ? [{ key, outcomes }] : [];
  });
}

function readBookmakerOutcomes(raw: Record<string, any> | null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw).flatMap(([key, value]) => {
    const opening = numberOrNull(value?.opening);
    const closing = numberOrNull(value?.closing);
    const peak = numberOrNull(value?.peak);
    if (opening == null && closing == null && peak == null) return [];
    return [{ key, opening, closing, peak }];
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
