import type { LivescoreSearch, MatchCard, Phase, Trend } from "./types";

const EVENT_RE = /^(\d+)'\s*-\s*(.*?)\s*-\s*(.+)$/;

export type EventKind = "goal" | "shot_on" | "shot_off" | "corner" | "yellow" | "red" | "other";

export type ParsedEvent = {
  minute: number;
  kind: EventKind;
  kindLabel: string;
  team: string;
  text: string;
};

export type MomentumPoint = {
  minute: number;
  value: number;
};

const KIND_LABEL: Record<EventKind, string> = {
  goal: "Gol",
  shot_on: "Chute no gol",
  shot_off: "Chute para fora",
  corner: "Escanteio",
  yellow: "Cartão amarelo",
  red: "Cartão vermelho",
  other: "Lance",
};

const KIND_WEIGHT: Record<EventKind, number> = {
  goal: 4,
  shot_on: 2,
  shot_off: 1,
  corner: 1.5,
  yellow: 0.4,
  red: 0.8,
  other: 0,
};

export function todaySaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDayLabel(isoDate: string, today = todaySaoPaulo()) {
  if (isoDate === today) return "Hoje";
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1, 12));
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function isMidnightUtc(value: string | null) {
  if (!value) return false;
  return /T00:00:00(?:\.0+)?(?:Z|\+00:00)$/.test(value);
}

export function formatKickoff(iso: string | null) {
  if (!iso) return { time: null as string | null, label: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { time: null, label: "" };
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
  }).format(date);
  if (isMidnightUtc(iso)) {
    const utcDay = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
    }).format(date);
    return { time: null, label: utcDay };
  }
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return { time, label: `${day} · ${time}` };
}

export function statusLabel(status: string | null, phase: Phase) {
  if (status === "HT_1ST") return "1º tempo";
  if (status === "HT_2ND") return "2º tempo";
  if (status === "HT") return "Intervalo";
  if (status === "PAUSED") return "Parado";
  if (phase === "ended" || status === "FT") return "Encerrado";
  if (phase === "upcoming") return "Agendado";
  return "Ao vivo";
}

export function minuteLabel(match: Pick<MatchCard, "status" | "elapsed" | "phase" | "kickoff">) {
  if (match.status === "HT") return "INT";
  if (match.status === "PAUSED") return "PAR";
  if (match.status === "HT_1ST" || match.status === "HT_2ND") {
    return match.elapsed != null ? `${match.elapsed}'` : "AO VIVO";
  }
  if (match.phase === "ended") return "FT";
  if (match.phase === "upcoming") return formatKickoff(match.kickoff).time ?? "—";
  return "AO VIVO";
}

export function eventKind(raw: string): EventKind {
  const kind = raw.toLowerCase();
  if (kind === "goal" || kind.endsWith(" goal")) return "goal";
  if (kind.includes("shot on")) return "shot_on";
  if (kind.includes("shot off")) return "shot_off";
  if (kind.includes("corner")) return "corner";
  if (kind.includes("red card")) return "red";
  if (kind.includes("yellow")) return "yellow";
  return "other";
}

export function parseEvent(text: string): ParsedEvent | null {
  const match = text.match(EVENT_RE);
  if (!match) return null;
  const minute = Number(match[1]);
  const middle = match[2]?.trim() ?? "";
  const team = match[3]?.trim() ?? "";
  if (!Number.isFinite(minute) || !middle || !team) return null;
  const kindName = middle.replace(/^\d+(st|nd|rd|th)\s+/i, "");
  const kind = eventKind(kindName);
  return {
    minute,
    kind,
    kindLabel: kind === "other" ? kindName : KIND_LABEL[kind],
    team,
    text,
  };
}

export function teamSide(team: string, homeName: string, awayName: string) {
  const target = normalizeName(team);
  const home = normalizeName(homeName);
  const away = normalizeName(awayName);
  if (home && (target === home || target.includes(home) || home.includes(target))) return "home" as const;
  if (away && (target === away || target.includes(away) || away.includes(target))) return "away" as const;
  return null;
}

export function goalsBySide(events: { text: string }[], homeName: string, awayName: string) {
  const home: string[] = [];
  const away: string[] = [];
  for (const event of events) {
    const parsed = parseEvent(event.text);
    if (!parsed || parsed.kind !== "goal") continue;
    const side = teamSide(parsed.team, homeName, awayName);
    if (side === "home") home.push(`${parsed.minute}'`);
    if (side === "away") away.push(`${parsed.minute}'`);
  }
  return { home, away };
}

export function momentumFromEvents(
  events: { text: string }[],
  homeName: string,
  awayName: string,
): MomentumPoint[] {
  const buckets = new Map<number, { home: number; away: number }>();
  for (const event of events) {
    const parsed = parseEvent(event.text);
    if (!parsed) continue;
    const side = teamSide(parsed.team, homeName, awayName);
    if (!side) continue;
    const bucket = buckets.get(parsed.minute) ?? { home: 0, away: 0 };
    bucket[side] += KIND_WEIGHT[parsed.kind];
    buckets.set(parsed.minute, bucket);
  }
  const max = Math.max(0, ...buckets.keys());
  if (max === 0) return [];
  const points: MomentumPoint[] = [];
  for (let minute = 1; minute <= max; minute += 1) {
    const bucket = buckets.get(minute) ?? { home: 0, away: 0 };
    points.push({ minute, value: round1(bucket.home - bucket.away) });
  }
  return points;
}

const TIMELINE_WEIGHTS: [string, number][] = [
  ["goals", 4],
  ["dangerous_attacks", 1],
  ["on_target", 2],
  ["off_target", 1],
  ["corners", 1.5],
  ["attacks", 0.15],
];

export function momentumFromTimeline(trend: Trend): MomentumPoint[] {
  let max = 0;
  for (const [key] of TIMELINE_WEIGHTS) {
    for (const side of ["home", "away"] as const) {
      for (const point of trend[key]?.[side] ?? []) {
        max = Math.max(max, Number(point.time_str) || 0);
      }
    }
  }
  if (max === 0) return [];
  const points: MomentumPoint[] = [];
  let previousHome = 0;
  let previousAway = 0;
  for (let minute = 1; minute <= max; minute += 1) {
    let home = 0;
    let away = 0;
    for (const [key, weight] of TIMELINE_WEIGHTS) {
      home += cumulativeAt(trend[key]?.home, minute) * weight;
      away += cumulativeAt(trend[key]?.away, minute) * weight;
    }
    points.push({ minute, value: round1(home - previousHome - (away - previousAway)) });
    previousHome = home;
    previousAway = away;
  }
  return points;
}

export function buildMomentum(
  events: { text: string }[],
  timeline: Trend | null,
  homeName: string,
  awayName: string,
) {
  if (timeline) {
    const fromTimeline = momentumFromTimeline(timeline);
    if (fromTimeline.some((point) => point.value !== 0)) return fromTimeline;
  }
  return momentumFromEvents(events, homeName, awayName);
}

export function validateLivescoreSearch(search: Record<string, unknown>): LivescoreSearch {
  const filtroRaw = search["filtro"];
  const abaRaw = search["aba"];
  const dataRaw = search["data"];
  const queryRaw = search["q"];
  const leagueRaw = search["liga"];
  const filtro: Phase = filtroRaw === "ended" || filtroRaw === "upcoming" ? filtroRaw : "live";
  const aba: LivescoreSearch["aba"] =
    abaRaw === "favoritos" || abaRaw === "competicoes" ? abaRaw : "todos";
  const data = typeof dataRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dataRaw) ? dataRaw : todaySaoPaulo();
  return {
    data,
    filtro,
    aba,
    q: typeof queryRaw === "string" ? queryRaw : "",
    liga: typeof leagueRaw === "string" ? leagueRaw : "",
  };
}

function cumulativeAt(points: { val: string; time_str: string }[] | undefined, minute: number) {
  let value = 0;
  for (const point of points ?? []) {
    if ((Number(point.time_str) || 0) <= minute) value = Number(point.val) || 0;
  }
  return value;
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
