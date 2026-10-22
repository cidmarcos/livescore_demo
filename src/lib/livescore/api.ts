import type {
  DetailPayload,
  EventsPayload,
  LineupsPayload,
  ListPayload,
  Phase,
  BookmakerOddsPayload,
  RadarPayload,
  TablePayload,
} from "./types";

export class LivescoreError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const baseUrl =
  import.meta.env["VITE_SUPABASE_URL"] || "https://frwzyqaciughjqcsxark.supabase.co";
const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];

export function livescoreConfigured() {
  return Boolean(baseUrl);
}

export async function fetchList(date: string, bucket: Phase) {
  return call<ListPayload>({ action: "list", date, bucket });
}

export async function fetchDetail(fixtureId: string, phase: Phase | "auto") {
  return call<DetailPayload>({ action: "detail", fixture_id: fixtureId, phase });
}

export async function fetchEvents(fixtureId: string, phase: Phase | "auto") {
  return call<EventsPayload>({ action: "events", fixture_id: fixtureId, phase });
}

export async function fetchLineups(fixtureId: string) {
  return call<LineupsPayload>({ action: "lineups", fixture_id: fixtureId });
}

export async function fetchTable(leagueId: string) {
  return call<TablePayload>({ action: "table", league_id: leagueId });
}

export async function fetchBookmakerOdds(fixtureId: string) {
  return call<BookmakerOddsPayload>({ action: "bookmaker_odds", fixture_id: fixtureId });
}

export async function fetchRadars() {
  return call<RadarPayload>({ action: "radar" });
}

export function logoUrl(imageId: string) {
  return `https://csv.futodds.com/functions/v1/team-logo-proxy/${imageId}.png?size=m`;
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const url = new URL("/functions/v1/livescore-proxy", baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const headers = new Headers();
  if (anonKey) {
    headers.set("apikey", anonKey);
    headers.set("Authorization", `Bearer ${anonKey}`);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      throw new LivescoreError(response.status, body.error ?? "Não foi possível carregar os jogos.");
    }
    return body as T;
  }
  throw new LivescoreError(429, "Muitas requisições. Tente de novo em instantes.");
}
