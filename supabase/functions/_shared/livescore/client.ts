const FUTODDS_BASE = "https://csv.futodds.com/functions/v1";
const PAGE_LIMIT = 80;
const MAX_PAGES = 8;
const MIN_GAP_MS = 220;

let nextSlot = 0;
let calls = 0;

export function resetHttpCalls() {
  calls = 0;
}

export function httpCallCount() {
  return calls;
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function pages(apiKey: string, path: string) {
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

export async function oneObject(apiKey: string, path: string) {
  const data = await one(apiKey, path);
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  if (Array.isArray(data) && data[0]) return data[0];
  throw new HttpError(404, "Jogo não encontrado.");
}

export async function oneRow(apiKey: string, path: string) {
  return oneObject(apiKey, path);
}

export async function one(apiKey: string, path: string) {
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
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  if (slot > now) await delay(slot - now);
  calls += 1;
  const response = await fetch(`${FUTODDS_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
