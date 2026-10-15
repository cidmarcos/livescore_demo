import { useQuery } from "@tanstack/react-query";
import { BarChart3, MousePointerClick, Shirt, Trophy } from "lucide-react";

import { BottomNav } from "@/components/livescore/bottom-nav";
import { LiveStrip } from "@/components/livescore/live-strip";
import { MatchDetail } from "@/components/livescore/match-detail";
import { MatchList } from "@/components/livescore/match-list";
import { navSearch, type NavId } from "@/components/livescore/nav";
import { StatTiles } from "@/components/livescore/stat-tiles";
import { TopBar } from "@/components/livescore/top-bar";
import { Toaster } from "@/components/ui/sonner";
import { fetchList, LivescoreError } from "@/lib/livescore/api";
import { useFavorites } from "@/lib/livescore/favorites";
import { todaySaoPaulo } from "@/lib/livescore/parse";
import type { LivescoreSearch, Phase } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

export function LivescoreApp({
  search,
  fixtureId,
  onSearch,
  onBrowse,
  onOpen,
  onClose,
}: {
  search: LivescoreSearch;
  fixtureId: string | null;
  onSearch: (search: LivescoreSearch) => void;
  onBrowse: (search: LivescoreSearch) => void;
  onOpen: (fixtureId: string) => void;
  onClose: () => void;
}) {
  const favorites = useFavorites();
  const today = todaySaoPaulo();
  const live = useQuery({
    queryKey: ["livescore", "list", today, "live"],
    queryFn: () => fetchList(today, "live"),
    refetchInterval: 15_000,
  });
  const ended = useQuery({
    queryKey: ["livescore", "list", search.data, "ended"],
    queryFn: () => fetchList(search.data, "ended"),
    refetchInterval: 60_000,
  });
  const upcoming = useQuery({
    queryKey: ["livescore", "list", search.data, "upcoming"],
    queryFn: () => fetchList(search.data, "upcoming"),
    refetchInterval: 60_000,
  });

  const byPhase = { live, ended, upcoming };
  const list = byPhase[search.filtro];
  const matches = list.data?.matches ?? [];
  const liveMatches = live.data?.matches ?? [];
  const known =
    [liveMatches, ended.data?.matches ?? [], upcoming.data?.matches ?? []]
      .flat()
      .find((match) => match.fixtureId === fixtureId) ?? null;

  function nav(id: NavId) {
    onBrowse(navSearch(search, id));
  }

  function selectTile(id: "favoritos" | Phase) {
    if (id === "favoritos") {
      onBrowse({ ...search, aba: "favoritos", liga: "" });
      return;
    }
    onBrowse({
      ...search,
      aba: "todos",
      filtro: id,
      data: id === "live" ? today : search.data,
      liga: "",
    });
  }

  return (
    <div className="min-h-dvh pb-24 text-foreground lg:pb-8">
      <TopBar
        search={search}
        liveCount={liveMatches.length}
        onQuery={(q) => onSearch({ ...search, q })}
        onNav={nav}
        onHome={() => onBrowse(navSearch(search, "live"))}
      />

      <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-4 md:px-6 md:py-6">
        <div className={cn("space-y-5", fixtureId && "hidden md:block")}>
          <LiveStrip
            matches={liveMatches}
            selectedId={fixtureId}
            onOpen={onOpen}
            onSeeAll={() => nav("live")}
          />
          <StatTiles
            search={search}
            counts={{
              favoritos: favorites.ids.length,
              live: live.data ? liveMatches.length : null,
              ended: ended.data ? ended.data.matches.length : null,
              upcoming: upcoming.data ? upcoming.data.matches.length : null,
            }}
            onSelect={selectTile}
          />
        </div>

        <div className="grid min-w-0 items-start gap-4 md:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] md:gap-5">
          <aside
            className={cn(
              "min-w-0 md:sticky md:top-20 md:h-[calc(100dvh-6rem)]",
              fixtureId && "hidden md:block",
            )}
          >
            <MatchList
              search={search}
              matches={matches}
              favoriteIds={favorites.ids}
              selectedId={fixtureId}
              loading={list.isPending}
              error={list.error ? messageFrom(list.error) : null}
              onSearch={onSearch}
              onOpen={onOpen}
              onToggleFavorite={favorites.toggle}
            />
          </aside>
          <main
            className={cn(
              "ls-scroll min-w-0 md:sticky md:top-20 md:h-[calc(100dvh-6rem)] md:overflow-y-auto md:pr-1",
              !fixtureId && "hidden md:block",
            )}
          >
            {fixtureId ? (
              <MatchDetail key={fixtureId} fixtureId={fixtureId} known={known} onClose={onClose} />
            ) : (
              <EmptyDetail />
            )}
          </main>
        </div>
      </div>

      <BottomNav search={search} liveCount={liveMatches.length} onNav={nav} />
      <Toaster theme="dark" position="top-center" />
    </div>
  );
}

function EmptyDetail() {
  const hints = [
    { icon: BarChart3, label: "Fluxo e estatísticas" },
    { icon: Shirt, label: "Escalações no campo" },
    { icon: Trophy, label: "Classificação da liga" },
  ];
  return (
    <div className="ls-card grid h-full min-h-80 place-items-center p-8 text-center">
      <div className="max-w-sm">
        <span className="ls-brand mx-auto grid size-14 place-items-center rounded-2xl shadow-[0_12px_32px_-12px_var(--color-glow)]">
          <MousePointerClick className="size-6 text-white" />
        </span>
        <h2 className="mt-5 text-lg font-bold">Escolha um jogo</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Toque em qualquer partida da lista para abrir o placar completo.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {hints.map((hint) => (
            <div key={hint.label} className="rounded-xl border border-border bg-surface-2/60 p-3">
              <hint.icon className="mx-auto size-4 text-primary" />
              <p className="mt-2 text-[11px] leading-tight text-muted-foreground">{hint.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function messageFrom(error: unknown) {
  if (error instanceof LivescoreError) return error.message;
  if (error instanceof Error) return error.message;
  return "Não foi possível carregar os jogos.";
}
