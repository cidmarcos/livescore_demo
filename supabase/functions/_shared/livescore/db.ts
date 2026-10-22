export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const base = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !service) throw new Error("Supabase não configurado.");
  const response = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${fn} ${response.status}: ${text.slice(0, 400)}`);
  if (!text) return null as T;
  return JSON.parse(text) as T;
}
