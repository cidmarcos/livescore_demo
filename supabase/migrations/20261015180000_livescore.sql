-- LiveScore Demo
-- Projeto: https://frwzyqaciughjqcsxark.supabase.co
--
-- Cole este arquivo no SQL Editor desse projeto e execute.
-- Não rode no banco do Futodds.
-- Cria só o cache da API. Não há tabela de usuário, sessão ou favorito.

create table if not exists public.api_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null
);

create index if not exists api_cache_expires_at_idx on public.api_cache (expires_at);

alter table public.api_cache enable row level security;

revoke all on table public.api_cache from anon, authenticated;
grant all on table public.api_cache to service_role;

create or replace function public.cache_get(key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select payload
    into result
  from public.api_cache
  where cache_key = key
    and expires_at > now();

  return result;
end;
$$;

create or replace function public.cache_put(key text, payload jsonb, ttl_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if key is null or length(key) = 0 or ttl_seconds is null or ttl_seconds < 1 then
    return;
  end if;

  insert into public.api_cache (cache_key, payload, expires_at)
  values (key, payload, now() + make_interval(secs => ttl_seconds))
  on conflict (cache_key) do update
    set payload = excluded.payload,
        expires_at = excluded.expires_at;
end;
$$;

revoke all on function public.cache_get(text) from public, anon, authenticated;
revoke all on function public.cache_put(text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.cache_get(text) to service_role;
grant execute on function public.cache_put(text, jsonb, integer) to service_role;
