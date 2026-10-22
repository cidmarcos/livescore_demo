import { httpCallCount, resetHttpCalls } from "./client.ts";
import { rpc } from "./db.ts";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export type RunResult = {
  partial: boolean;
  fixturesSeen: number;
  fixturesSaved: number;
  detail: Record<string, unknown>;
};

export function unauthorized(request: Request): Response | null {
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const header = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : "";
  if (service && bearer.length === service.length && sameSecret(service, bearer)) return null;
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const got = request.headers.get("x-cron-secret") ?? "";
  if (expected && expected.length === got.length && sameSecret(expected, got)) return null;
  return json({ error: "Não autorizado." }, 401);
}

export function budget(limitMs = 90_000) {
  const started = Date.now();
  return () => Date.now() - started > limitMs;
}

export async function withRun(
  job: "live" | "prelive",
  seconds: number,
  task: () => Promise<RunResult>,
) {
  resetHttpCalls();
  let runId = 0;
  try {
    runId = Number(await rpc<number | null>("livescore_try_lock", { job_name: job, seconds }));
    if (!Number.isFinite(runId) || runId <= 0) return;
    const result = await task();
    await finish(runId, result.partial ? "partial" : "ok", result, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronização.";
    console.error(message);
    if (runId > 0) {
      await finish(runId, "error", { partial: false, fixturesSeen: 0, fixturesSaved: 0, detail: {} }, message).catch(
        () => undefined,
      );
    }
  }
}

export function accept(work: Promise<void>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
    return json({ accepted: true }, 202);
  }
  return work.then(() => json({ accepted: true }));
}

async function finish(runId: number, status: "ok" | "error" | "partial", result: RunResult, error: string | null) {
  await rpc<null>("livescore_finish_run", {
    run_id: runId,
    run_status: status,
    run_http_calls: httpCallCount(),
    run_fixtures_seen: result.fixturesSeen,
    run_fixtures_saved: result.fixturesSaved,
    run_error: error,
    run_detail: result.detail,
  });
}

function sameSecret(left: string, right: string) {
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
