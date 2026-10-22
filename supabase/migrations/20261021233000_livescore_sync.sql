-- LiveScore Demo — base própria e rotinas
-- Projeto: https://frwzyqaciughjqcsxark.supabase.co
--
-- Cole este arquivo no SQL Editor desse projeto e execute.
-- Não rode no banco do Futodds.
--
-- Antes de executar, troque COLE_A_SERVICE_ROLE_KEY pela service role
-- deste projeto (Settings, API). Ela fica só no Vault e autoriza o cron.

create schema if not exists livescore;

create table if not exists livescore.fixtures (
  fixture_id text primary key,
  phase text not null check (phase in ('upcoming', 'live', 'ended')),
  kickoff timestamptz,
  league_id text,
  league_name text,
  country text,
  home_name text not null,
  away_name text not null,
  home_image_id text,
  away_image_id text,
  status text,
  elapsed integer,
  score_home integer,
  score_away integer,
  card jsonb not null,
  list_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fixtures_phase_kickoff_idx
  on livescore.fixtures (phase, kickoff);

create table if not exists livescore.documents (
  fixture_id text not null references livescore.fixtures (fixture_id) on delete cascade,
  kind text not null check (kind in ('live_detail', 'upcoming_detail', 'events', 'bookmaker_odds')),
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (fixture_id, kind)
);

create index if not exists documents_kind_fetched_idx
  on livescore.documents (kind, fetched_at);

create table if not exists livescore.sync_runs (
  id bigint generated always as identity primary key,
  job text not null check (job in ('live', 'prelive')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'ok', 'error', 'partial')),
  http_calls integer not null default 0,
  fixtures_seen integer not null default 0,
  fixtures_saved integer not null default 0,
  error text,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists sync_runs_job_started_idx
  on livescore.sync_runs (job, started_at desc);

create table if not exists livescore.sync_locks (
  job text primary key check (job in ('live', 'prelive')),
  locked_until timestamptz not null,
  run_id bigint
);

create table if not exists livescore.sync_cursors (
  job text primary key check (job in ('live', 'prelive')),
  cursor text,
  updated_at timestamptz not null default now()
);

alter table livescore.fixtures enable row level security;
alter table livescore.documents enable row level security;
alter table livescore.sync_runs enable row level security;
alter table livescore.sync_locks enable row level security;
alter table livescore.sync_cursors enable row level security;

revoke all on schema livescore from public, anon, authenticated;
grant usage on schema livescore to postgres, service_role;

revoke all on all tables in schema livescore from public, anon, authenticated;
grant all on all tables in schema livescore to postgres, service_role;
grant all on all sequences in schema livescore to postgres, service_role;

alter default privileges in schema livescore
  grant all on tables to postgres, service_role;

create or replace function livescore.as_timestamptz(value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if value is null or length(btrim(value)) = 0 then
    return null;
  end if;
  return value::timestamptz;
exception
  when others then
    return null;
end;
$$;

create or replace function livescore.as_int(value text)
returns integer
language plpgsql
immutable
as $$
begin
  if value is null or length(btrim(value)) = 0 then
    return null;
  end if;
  return trunc(value::numeric)::integer;
exception
  when others then
    return null;
end;
$$;

create or replace function public.livescore_try_lock(job_name text, seconds integer)
returns bigint
language plpgsql
security definer
set search_path = livescore, public
as $$
declare
  new_run_id bigint;
  locked_job text;
begin
  if job_name not in ('live', 'prelive') or seconds is null or seconds < 30 then
    return null;
  end if;

  with locked as (
    insert into livescore.sync_locks (job, locked_until)
    values (job_name, now() + make_interval(secs => seconds))
    on conflict (job) do update
      set locked_until = excluded.locked_until
    where livescore.sync_locks.locked_until < now()
    returning job
  )
  select job into locked_job from locked;

  if locked_job is null then
    return null;
  end if;

  insert into livescore.sync_runs (job, status)
  values (job_name, 'running')
  returning id into new_run_id;

  update livescore.sync_locks
    set run_id = new_run_id
  where job = job_name;

  return new_run_id;
end;
$$;

create or replace function public.livescore_finish_run(
  run_id bigint,
  run_status text,
  run_http_calls integer,
  run_fixtures_seen integer,
  run_fixtures_saved integer,
  run_error text,
  run_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = livescore, public
as $$
begin
  if run_status not in ('ok', 'error', 'partial') then
    run_status := 'error';
  end if;

  update livescore.sync_runs
    set finished_at = now(),
        status = run_status,
        http_calls = coalesce(run_http_calls, 0),
        fixtures_seen = coalesce(run_fixtures_seen, 0),
        fixtures_saved = coalesce(run_fixtures_saved, 0),
        error = run_error,
        detail = coalesce(run_detail, '{}'::jsonb)
  where id = run_id;

  update livescore.sync_locks as locks
    set locked_until = now()
  where locks.run_id = livescore_finish_run.run_id;
end;
$$;

create or replace function public.livescore_upsert_fixtures(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = livescore, public
as $$
declare
  item jsonb;
  saved integer := 0;
  fixture text;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    return 0;
  end if;

  for item in select value from jsonb_array_elements(rows)
  loop
    fixture := item->>'fixtureId';
    if fixture is null or fixture !~ '^[0-9]+$' then
      continue;
    end if;

    insert into livescore.fixtures (
      fixture_id, phase, kickoff, league_id, league_name, country,
      home_name, away_name, home_image_id, away_image_id,
      status, elapsed, score_home, score_away, card, list_seen_at, updated_at
    ) values (
      fixture,
      case when item->>'phase' in ('upcoming', 'live', 'ended') then item->>'phase' else 'upcoming' end,
      livescore.as_timestamptz(item->>'kickoff'),
      item->>'leagueId',
      coalesce(item->>'leagueName', 'Competição'),
      item->>'country',
      coalesce(item->>'homeName', 'Casa'),
      coalesce(item->>'awayName', 'Visitante'),
      item->>'homeImageId',
      item->>'awayImageId',
      item->>'status',
      livescore.as_int(item->>'elapsed'),
      livescore.as_int(item#>>'{score,home}'),
      livescore.as_int(item#>>'{score,away}'),
      item,
      now(),
      now()
    )
    on conflict (fixture_id) do update
      set phase = excluded.phase,
          kickoff = excluded.kickoff,
          league_id = excluded.league_id,
          league_name = excluded.league_name,
          country = excluded.country,
          home_name = excluded.home_name,
          away_name = excluded.away_name,
          home_image_id = excluded.home_image_id,
          away_image_id = excluded.away_image_id,
          status = excluded.status,
          elapsed = excluded.elapsed,
          score_home = excluded.score_home,
          score_away = excluded.score_away,
          card = excluded.card,
          list_seen_at = now(),
          updated_at = now();
    saved := saved + 1;
  end loop;

  return saved;
end;
$$;

create or replace function public.livescore_upsert_document(
  fixture text,
  document_kind text,
  document_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = livescore, public
as $$
begin
  if fixture is null or document_kind not in ('live_detail', 'upcoming_detail', 'events', 'bookmaker_odds') then
    return;
  end if;
  if not exists (select 1 from livescore.fixtures where fixture_id = fixture) then
    return;
  end if;

  insert into livescore.documents (fixture_id, kind, payload, fetched_at)
  values (fixture, document_kind, coalesce(document_payload, '{}'::jsonb), now())
  on conflict (fixture_id, kind) do update
    set payload = excluded.payload,
        fetched_at = now();
end;
$$;

create or replace function public.livescore_mark_ended(live_ids text[])
returns integer
language plpgsql
security definer
set search_path = livescore, public
as $$
declare
  changed integer;
begin
  if live_ids is null then
    return 0;
  end if;

  update livescore.fixtures
    set phase = 'ended',
        status = coalesce(status, 'FT'),
        updated_at = now(),
        card = jsonb_set(card, '{phase}', '"ended"'::jsonb, true)
  where phase = 'live'
    and not (fixture_id = any(live_ids));

  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.livescore_prelive_queue(ids text[])
returns table(fixture_id text, upcoming_at timestamptz, odds_at timestamptz)
language sql
security definer
set search_path = livescore, public
as $$
  select
    input.fixture_id,
    detail.fetched_at,
    odds.fetched_at
  from unnest(coalesce(ids, array[]::text[])) as input(fixture_id)
  left join livescore.documents as detail
    on detail.fixture_id = input.fixture_id
   and detail.kind = 'upcoming_detail'
  left join livescore.documents as odds
    on odds.fixture_id = input.fixture_id
   and odds.kind = 'bookmaker_odds';
$$;

create or replace function public.livescore_cursor(job_name text)
returns text
language sql
security definer
set search_path = livescore, public
as $$
  select cursor from livescore.sync_cursors where job = job_name;
$$;

create or replace function public.livescore_set_cursor(job_name text, next_cursor text)
returns void
language plpgsql
security definer
set search_path = livescore, public
as $$
begin
  if job_name not in ('live', 'prelive') then
    return;
  end if;

  insert into livescore.sync_cursors (job, cursor, updated_at)
  values (job_name, next_cursor, now())
  on conflict (job) do update
    set cursor = excluded.cursor,
        updated_at = now();
end;
$$;

create or replace function public.livescore_cleanup()
returns integer
language plpgsql
security definer
set search_path = livescore, public
as $$
declare
  removed integer;
begin
  delete from livescore.fixtures
  where kickoff is not null
    and kickoff < now() - interval '7 days'
    and phase <> 'live';

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function livescore.as_timestamptz(text) from public, anon, authenticated;
revoke all on function livescore.as_int(text) from public, anon, authenticated;
revoke all on function public.livescore_try_lock(text, integer) from public, anon, authenticated;
revoke all on function public.livescore_finish_run(bigint, text, integer, integer, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.livescore_upsert_fixtures(jsonb) from public, anon, authenticated;
revoke all on function public.livescore_upsert_document(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.livescore_mark_ended(text[]) from public, anon, authenticated;
revoke all on function public.livescore_prelive_queue(text[]) from public, anon, authenticated;
revoke all on function public.livescore_cursor(text) from public, anon, authenticated;
revoke all on function public.livescore_set_cursor(text, text) from public, anon, authenticated;
revoke all on function public.livescore_cleanup() from public, anon, authenticated;

grant execute on function public.livescore_try_lock(text, integer) to service_role;
grant execute on function public.livescore_finish_run(bigint, text, integer, integer, integer, text, jsonb) to service_role;
grant execute on function public.livescore_upsert_fixtures(jsonb) to service_role;
grant execute on function public.livescore_upsert_document(text, text, jsonb) to service_role;
grant execute on function public.livescore_mark_ended(text[]) to service_role;
grant execute on function public.livescore_prelive_queue(text[]) to service_role;
grant execute on function public.livescore_cursor(text) to service_role;
grant execute on function public.livescore_set_cursor(text, text) to service_role;
grant execute on function public.livescore_cleanup() to service_role;

create or replace view livescore.sync_health
with (security_invoker = true) as
select
  jobs.job,
  runs.id as run_id,
  runs.started_at,
  runs.finished_at,
  runs.status,
  runs.http_calls,
  runs.fixtures_seen,
  runs.fixtures_saved,
  runs.error,
  case
    when runs.id is null then true
    when runs.status = 'error' then true
    when runs.status = 'running' and jobs.job = 'live' and runs.started_at < now() - interval '4 minutes' then true
    when runs.status = 'running' and jobs.job = 'prelive' and runs.started_at < now() - interval '12 minutes' then true
    when jobs.job = 'live' and coalesce(runs.finished_at, runs.started_at) < now() - interval '6 minutes' then true
    when jobs.job = 'prelive' and coalesce(runs.finished_at, runs.started_at) < now() - interval '45 minutes' then true
    else false
  end as stale
from (values ('live'), ('prelive')) as jobs(job)
left join lateral (
  select *
  from livescore.sync_runs
  where sync_runs.job = jobs.job
  order by started_at desc
  limit 1
) runs on true;

revoke all on livescore.sync_health from public, anon, authenticated;
grant select on livescore.sync_health to postgres, service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $body$
begin
  if not exists (select 1 from vault.secrets where name = 'project_url') then
    perform vault.create_secret('https://frwzyqaciughjqcsxark.supabase.co', 'project_url');
  end if;
end
$body$;

-- Troque o texto e execute esta linha se o secret ainda não existir.
-- Não rode duas vezes com o mesmo nome.
-- select vault.create_secret('COLE_A_SERVICE_ROLE_KEY', 'service_role_key');

do $body$
declare
  existing bigint;
begin
  select jobid into existing from cron.job where jobname = 'livescore-sync-live';
  if existing is not null then
    perform cron.unschedule(existing);
  end if;

  select jobid into existing from cron.job where jobname = 'livescore-sync-prelive';
  if existing is not null then
    perform cron.unschedule(existing);
  end if;
end
$body$;

select cron.schedule(
  'livescore-sync-live',
  '*/3 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/livescore-sync-live',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);

select cron.schedule(
  'livescore-sync-prelive',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/livescore-sync-prelive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);
