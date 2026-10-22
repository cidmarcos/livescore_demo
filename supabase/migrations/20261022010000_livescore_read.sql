-- LiveScore Demo — leitura pelo banco próprio
-- Projeto: https://frwzyqaciughjqcsxark.supabase.co
--
-- Cole este arquivo no SQL Editor desse projeto e execute.
-- Não rode no banco do Futodds.
-- Depende de 20261021233000_livescore_sync.sql. Nenhuma tabela muda.

create or replace function public.livescore_read_list(bucket text, day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = livescore, public
as $$
declare
  last_run livescore.sync_runs;
  day_start timestamptz := (day::timestamp at time zone 'UTC');
  day_end timestamptz := ((day + 1)::timestamp at time zone 'UTC');
  cards jsonb;
begin
  if bucket not in ('live', 'upcoming') or day is null then
    return null;
  end if;

  select *
    into last_run
  from livescore.sync_runs
  where job = case when bucket = 'live' then 'live' else 'prelive' end
    and status in ('ok', 'partial')
  order by started_at desc
  limit 1;

  if last_run.id is null or last_run.finished_at is null then
    return null;
  end if;

  if bucket = 'live' then
    if last_run.finished_at < now() - interval '6 minutes' then
      return null;
    end if;

    select coalesce(jsonb_agg(card order by kickoff nulls last, fixture_id), '[]'::jsonb)
      into cards
    from livescore.fixtures
    where phase = 'live';

    return jsonb_build_object('matches', cards, 'syncedAt', last_run.finished_at);
  end if;

  if last_run.finished_at < now() - interval '45 minutes'
     or day_end > last_run.started_at + interval '24 hours'
     or day_end <= now() then
    return null;
  end if;

  select coalesce(jsonb_agg(card order by kickoff nulls last, fixture_id), '[]'::jsonb)
    into cards
  from livescore.fixtures
  where phase = 'upcoming'
    and kickoff >= day_start
    and kickoff < day_end
    and list_seen_at >= last_run.started_at;

  return jsonb_build_object('matches', cards, 'syncedAt', last_run.finished_at);
end;
$$;

create or replace function public.livescore_read_document(
  fixture text,
  document_kind text,
  max_age_seconds integer
)
returns jsonb
language sql
stable
security definer
set search_path = livescore, public
as $$
  select jsonb_build_object(
    'phase', f.phase,
    'payload', d.payload,
    'fetchedAt', d.fetched_at
  )
  from livescore.fixtures as f
  left join livescore.documents as d
    on d.fixture_id = f.fixture_id
   and d.kind = document_kind
   and d.fetched_at >= now() - make_interval(secs => greatest(coalesce(max_age_seconds, 0), 0))
  where f.fixture_id = fixture;
$$;

revoke all on function public.livescore_read_list(text, date) from public, anon, authenticated;
revoke all on function public.livescore_read_document(text, text, integer) from public, anon, authenticated;
grant execute on function public.livescore_read_list(text, date) to service_role;
grant execute on function public.livescore_read_document(text, text, integer) to service_role;
