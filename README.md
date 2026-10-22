# Livescore Demo

Placar de futebol ao vivo, no estilo de um app de resultados. A demo mostra jogos ao vivo, próximos e encerrados, com detalhe da partida, lances, estatísticas, odds e classificação. Não há login.

> **Dados de futebol: [futodds.com](https://futodds.com)**
> Toda esta demonstração roda sobre a API de futebol do **[Futodds](https://futodds.com)**. É uma API bem completa e bem organizada, pronta para colocar no ar placares ao vivo, apps de estatísticas, comparadores de odds e ferramentas de análise. Para usar nos seus próprios projetos, conheça os planos e assine em **[futodds.com](https://futodds.com)**.

## API de Futebol — [futodds.com](https://futodds.com)

A API do **[futodds.com](https://futodds.com)** entrega em endpoints REST padronizados tudo o que a demo exibe, sem precisar juntar várias fontes diferentes:

- **Ao vivo em tempo real:** placar, minuto, lances, fluxo da partida (momentum minuto a minuto), estatísticas da partida, janelas dos últimos 5/10/15/20 minutos, índices de pressão (`PI1`, `PI2`, `APPM`, `CG`), estatísticas detalhadas estilo Opta e radar ao vivo.
- **Pré-live completo:** médias e retrospecto por time (geral e 1º tempo), projeções de gols, médias combinadas, placares corretos prováveis, probabilidades calculadas para dezenas de mercados (1X2, HT, primeiro gol, dupla chance, linhas de gols, ambas marcam e escanteios) e informações de ida/volta, estádio e temporada.
- **Odds e movimentação:** cotações 1X2 de múltiplas casas e grade completa de mercados na Pinnacle e na Bet365 com abertura, odd atual e pico.
- **Escalações e tabelas:** titulares, reservas, desfalques, formação no campo e classificação geral, mandante e visitante.

Assine a API em **[futodds.com](https://futodds.com)** para receber sua chave (`FUTODDS_API_KEY`) e integrar os mesmos dados no seu sistema.

## Telas

- `/` lista os jogos do dia, com busca, filtro de competição e favoritos no navegador.
- `/jogo/$fixtureId` abre o jogo: fluxo da partida, lances, abas de ao vivo e pré-live, pressão, Opta, probabilidade, odds, formações e classificação.

## De onde vêm os dados

O site só chama a função `livescore-proxy`. Ela lê primeiro o banco próprio. Se o dado não estiver lá, ou estiver velho, consulta a API do [futodds.com](https://futodds.com) e usa o cache `public.api_cache`.

A resposta traz o header `x-livescore-source` com `db` ou `api`.

| Dado | Origem |
| --- | --- |
| Lista, detalhe, lances e fluxo ao vivo | Banco, se a rotina ao vivo rodou há menos de 6 minutos |
| Lista e detalhe pré-live de hoje, e odds das casas | Banco, se o pré-live rodou há menos de 45 minutos e o dia cabe na janela de 24 horas |
| Encerrados, outras datas, formações, classificação e radar | API ([futodds.com](https://futodds.com)), com cache |

Duas rotinas sincronizam os dados da API para o banco no projeto Supabase `frwzyqaciughjqcsxark`:

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

- `FUTODDS_API_KEY`, chave de assinatura do [futodds.com](https://futodds.com) usada pelas funções para consultar a API.
- A service role, guardada no Vault com o nome `service_role_key`, para o agendador chamar as rotinas.

O id do projeto e a URL pública do Supabase não autenticam ninguém.

---

Este projeto está ligado ao [Lovable](https://lovable.dev): commits na `main` voltam para o editor. Evite reescrever o histórico já publicado.
