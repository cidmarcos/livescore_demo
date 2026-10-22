# Base do LiveScore

Projeto: `frwzyqaciughjqcsxark`.

A tela lê pela função `livescore-proxy`. As rotinas abaixo copiam a API para o esquema `livescore`, e o proxy responde primeiro com o que está no banco. Quando o dado não está lá ou está velho, ele consulta a API e usa o cache `public.api_cache`.

## Aplicar

1. Em Settings, API, copie a service role key deste projeto.
2. No SQL Editor, troque `COLE_A_SERVICE_ROLE_KEY`, descomente a linha do Vault e execute [supabase/migrations/20261021233000_livescore_sync.sql](migrations/20261021233000_livescore_sync.sql).
3. Não execute esse arquivo no banco do Futodds.

```sql
select vault.create_secret('COLE_A_SERVICE_ROLE_KEY', 'service_role_key');
```

Se o nome `service_role_key` já existir, apague o secret antigo no painel do Vault antes de criar de novo. A função também aceita o header `x-cron-secret` quando o secret `CRON_SECRET` estiver configurado.

## Tabelas

- `livescore.fixtures`: um jogo por `fixture_id`, com fase, horário e o cartão normalizado.
- `livescore.documents`: payload atual. Os tipos são `live_detail`, `upcoming_detail`, `events` e `bookmaker_odds`.
- `livescore.sync_runs`: cada execução, com status, chamadas HTTP, jogos e o erro.
- `livescore.sync_locks`: impede duas execuções da mesma rotina ao mesmo tempo.
- `livescore.sync_cursors`: de onde a rotina pré-live continua quando a lista não cabe em 90 segundos.

Só o `service_role` escreve. A demo não lê essas tabelas.

## Rotinas

`livescore-sync-live`, a cada 3 minutos:

- `GET /matches-live`
- para cada jogo, `GET /matches-live-detail`, `GET /matches-live-events` e `GET /matches-stats-timeline` (fluxo da partida)
- jogo que estava ao vivo e saiu da lista passa a `ended`, sem consultar o endpoint de encerrados

`livescore-sync-prelive`, a cada 30 minutos:

- `GET /matches-upcoming` de hoje e de amanhã, em UTC
- fica só o jogo com início nas próximas 24 horas
- para cada um, `GET /matches-upcoming-detail?fields=stats_extra,match_leg` e `GET /matches-bookmaker-odds`
- documento buscado há menos de 25 minutos não é repetido
- jogo com início há mais de 7 dias, fora do ao vivo, sai da base e leva os documentos

Há 220 ms entre chamadas. A função responde na hora e termina o trabalho em seguida, para o agendador não cortar a requisição.

## O que o site lê do banco

O SQL [supabase/migrations/20261022010000_livescore_read.sql](migrations/20261022010000_livescore_read.sql) cria `livescore_read_list` e `livescore_read_document`, usadas pelo proxy.

- Lista ao vivo, quando a rotina ao vivo terminou há menos de 6 minutos.
- Lista pré-live de um dia (em UTC) que termina dentro das 24 horas da última rotina pré-live, rodada há menos de 45 minutos.
- Detalhe ao vivo, lances e fluxo gravados há menos de 6 minutos.
- Detalhe pré-live e odds das casas gravados há menos de 45 minutos.
- A fase do jogo, quando o site não informa.

Continuam pela API com cache: encerrados, outras datas, formações, classificação e radar. O header `x-livescore-source` diz se a resposta veio de `db` ou de `api`.

## Saúde

```sql
select * from livescore.sync_health;
```

`stale` fica verdadeiro quando a última execução falhou, ficou presa ou passou de 6 minutos no ao vivo e de 45 minutos no pré-live.

```sql
select job, status, http_calls, fixtures_seen, fixtures_saved, error, detail, started_at
from livescore.sync_runs
order by started_at desc
limit 20;
```
