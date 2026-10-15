import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { LivescoreApp } from "@/components/livescore/livescore-app";
import { validateLivescoreSearch } from "@/lib/livescore/parse";

export const Route = createFileRoute("/")({
  validateSearch: validateLivescoreSearch,
  head: () => ({
    meta: [
      { title: "LiveScore Demo" },
      { name: "description", content: "Placar ao vivo de futebol." },
      { property: "og:title", content: "LiveScore Demo" },
      { property: "og:description", content: "Placar ao vivo de futebol." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  return (
    <LivescoreApp
      search={search}
      fixtureId={null}
      onSearch={(next) => {
        void navigate({ to: "/", search: next, replace: true });
      }}
      onBrowse={(next) => {
        void navigate({ to: "/", search: next });
      }}
      onOpen={(fixtureId) => {
        void navigate({ to: "/jogo/$fixtureId", params: { fixtureId }, search });
      }}
      onClose={() => {
        void navigate({ to: "/", search });
      }}
    />
  );
}
