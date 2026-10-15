import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { LivescoreApp } from "@/components/livescore/livescore-app";
import { validateLivescoreSearch } from "@/lib/livescore/parse";

export const Route = createFileRoute("/jogo/$fixtureId")({
  validateSearch: validateLivescoreSearch,
  head: () => ({
    meta: [{ title: "Jogo · LiveScore Demo" }],
  }),
  component: MatchPage,
});

function MatchPage() {
  const { fixtureId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  return (
    <LivescoreApp
      search={search}
      fixtureId={fixtureId}
      onSearch={(next) => {
        void navigate({ to: "/jogo/$fixtureId", params: { fixtureId }, search: next, replace: true });
      }}
      onBrowse={(next) => {
        void navigate({ to: "/", search: next });
      }}
      onOpen={(nextId) => {
        void navigate({ to: "/jogo/$fixtureId", params: { fixtureId: nextId }, search });
      }}
      onClose={() => {
        void navigate({ to: "/", search });
      }}
    />
  );
}
