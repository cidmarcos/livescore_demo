# Livescore Demo

Placar de futebol ao vivo, no estilo de um app de resultados. A demo mostra jogos ao vivo, próximos e encerrados, com detalhe da partida, lances, estatísticas, odds e classificação. Não há login.

O projeto nasceu de um teste “olá mundo” e hoje é esta demo. Ele está ligado ao [Lovable](https://lovable.dev): commits na `main` voltam para o editor. Evite reescrever o histórico já publicado.

## Telas

- `/` lista os jogos do dia, com busca, filtro de competição e favoritos no navegador.
- `/jogo/$fixtureId` abre o jogo: fluxo da partida, lances, abas de ao vivo e pré-live, pressão, Opta, probabilidade, odds, formações e classificação.

## De onde vêm os dados

O site só chama a função `livescore-proxy`. Ela lê primeiro o banco próprio. Se o dado não estiver lá, ou estiver velho, consulta a API e usa o cache `public.api_cache`.

A resposta traz o header `x-livescore-source` com `db` ou `api`.

| Dado | Origem |
| --- | --- |
| Lista, detalhe, lances e fluxo ao vivo | Banco, se a rotina ao vivo rodou há menos de 6 minutos |
| Lista e detalhe pré-live de hoje, e odds das casas | Banco, se o pré-live rodou há menos de 45 minutos e o dia cabe na janela de 24 horas |
| Encerrados, outras datas, formações, classificação e radar | API, com cache |

Duas rotinas enchem o banco, no projeto Supabase `frwzyqaciughjqcsxark`:

- `livescore-sync-live`, a cada 3 minutos.
- `livescore-sync-prelive`, a cada 30 minutos, só com jogos que começam nas próximas 24 horas.

O esquema, as tabelas e a consulta de saúde estão em [supabase/livescore.md](supabase/livescore.md).

## Rodar localmente

É preciso Node.js. O lockfile do projeto é o `bun.lock`.

```sh
bun install
npx vite dev --port 8080 --strictPort --host
```

A demo abre em `http://localhost:8080/`.

`npm run dev` também sobe o Vite, mas o script não repassa uma porta extra. Para fixar a porta, use o comando acima.

## O que não está no repositório

Chaves e tokens ficam só no painel do Supabase:

- `FUTODDS_API_KEY`, usada pelas funções para consultar a API.
- A service role, guardada no Vault com o nome `service_role_key`, para o agendador chamar as rotinas.

O id do projeto e a URL pública do Supabase não autenticam ninguém.
