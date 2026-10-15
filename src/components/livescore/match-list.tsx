import { CalendarDays, ChevronLeft, ChevronRight, Search, Star, Trophy, WifiOff } from "lucide-react";

import { Crest } from "@/components/livescore/crest";
import { formatDayLabel, minuteLabel, shiftDate, todaySaoPaulo } from "@/lib/livescore/parse";
import type { LivescoreSearch, MatchCard, Phase } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

const filterTitle: Record<Phase, string> = {
  live: "Ao vivo",
  ended: "Finalizados",
  upcoming: "Próximos",
};

export function MatchList({
  search,
  matches,
  favoriteIds,
  selectedId,
  loading,
  error,
  onSearch,
  onOpen,
  onToggleFavorite,
}: {
  search: LivescoreSearch;
  matches: MatchCard[];
  favoriteIds: string[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSearch: (search: LivescoreSearch) => void;
  onOpen: (fixtureId: string) => void;
  onToggleFavorite: (fixtureId: string) => void;
}) {
  const today = todaySaoPaulo();
  const query = search.q.trim().toLowerCase();
  const favoriteSet = new Set(favoriteIds);
  const filtered = matches.filter((match) => {
    if (search.aba === "favoritos" && !favoriteSet.has(match.fixtureId)) return false;
    if (search.liga && (match.leagueId ?? match.leagueName) !== search.liga) return false;
    if (!query) return true;
    return (
      match.homeName.toLowerCase().includes(query) || match.awayName.toLowerCase().includes(query)
    );
  });
  const groups = groupMatches(filtered, search.filtro);
  const competitions = competitionOptions(matches);
  const showCompetitions = search.aba === "competicoes" && !search.liga;
  const title = search.aba === "favoritos" ? "Favoritos" : filterTitle[search.filtro];

  return (
    <section className="ls-card flex min-w-0 flex-col md:h-full md:overflow-hidden">
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 pl-1">
            <p className="text-sm font-bold">{title}</p>
            <p className="text-[11px] text-muted-foreground">
              {loading ? "Carregando..." : `${filtered.length} ${filtered.length === 1 ? "jogo" : "jogos"}`}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-2/70 p-1">
            <button
              type="button"
              aria-label="Dia anterior"
              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => changeDate(search, -1, onSearch)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold",
                search.data === today ? "bg-primary/15 text-primary" : "hover:bg-accent",
              )}
              onClick={() => onSearch({ ...search, data: today, filtro: "live", liga: "" })}
            >
              <CalendarDays className="size-3.5" />
              {formatDayLabel(search.data, today)}
            </button>
            <button
              type="button"
              aria-label="Próximo dia"
              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => changeDate(search, 1, onSearch)}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        {competitions.length > 1 && !showCompetitions ? (
          <div className="ls-no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
            <button
              type="button"
              data-active={!search.liga}
              className="ls-pill shrink-0"
              onClick={() => onSearch({ ...search, liga: "" })}
            >
              Todas
            </button>
            {competitions.slice(0, 12).map((competition) => (
              <button
                key={competition.id}
                type="button"
                data-active={search.liga === competition.id}
                className="ls-pill max-w-44 shrink-0"
                onClick={() => onSearch({ ...search, liga: competition.id })}
              >
                <span className="truncate">{competition.name}</span>
                <span className="opacity-70">{competition.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ls-scroll min-h-0 flex-1 md:overflow-y-auto">
        {showCompetitions ? (
          <CompetitionList
            competitions={competitions}
            onSelect={(liga) => onSearch({ ...search, liga, aba: "todos" })}
          />
        ) : null}
        {error ? (
          <EmptyState icon={WifiOff} title="Não deu para carregar" text={error} tone="loss" />
        ) : null}
        {loading && matches.length === 0 ? <ListSkeleton /> : null}
        {!loading && !error && !showCompetitions && filtered.length === 0 ? (
          search.aba === "favoritos" ? (
            <EmptyState
              icon={Star}
              title="Nenhum favorito aqui"
              text="Toque na estrela de um jogo para acompanhar de perto."
            />
          ) : query ? (
            <EmptyState icon={Search} title="Nada encontrado" text={`Nenhum time com "${search.q}".`} />
          ) : (
            <EmptyState icon={CalendarDays} title="Sem jogos" text="Nenhuma partida neste filtro e dia." />
          )
        ) : null}
        {!showCompetitions
          ? groups.map((group) => (
              <div key={group.key} className="ls-enter pb-1">
                <div className="sticky top-[116px] z-10 flex items-center gap-2.5 bg-card/95 px-3 py-2.5 backdrop-blur md:top-0">
                  <LeagueBadge name={group.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold uppercase tracking-wide">{group.name}</p>
                    {group.country ? (
                      <p className="truncate text-[10px] uppercase text-muted-foreground">{group.country}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {group.matches.length}
                  </span>
                </div>
                <div className="space-y-1 px-2">
                  {group.matches.map((match) => (
                    <MatchRow
                      key={match.fixtureId}
                      match={match}
                      selected={match.fixtureId === selectedId}
                      favorite={favoriteSet.has(match.fixtureId)}
                      onOpen={() => onOpen(match.fixtureId)}
                      onToggleFavorite={() => onToggleFavorite(match.fixtureId)}
                    />
                  ))}
                </div>
              </div>
            ))
          : null}
      </div>
    </section>
  );
}

function LeagueBadge({ name }: { name: string }) {
  return (
    <span className="ls-brand grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white">
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function CompetitionList({
  competitions,
  onSelect,
}: {
  competitions: { id: string; name: string; country: string | null; count: number }[];
  onSelect: (id: string) => void;
}) {
  if (competitions.length === 0) {
    return <EmptyState icon={Trophy} title="Sem competições" text="Nada neste filtro e dia." />;
  }
  return (
    <ul className="space-y-1 p-2">
      {competitions.map((competition) => (
        <li key={competition.id}>
          <button
            type="button"
            onClick={() => onSelect(competition.id)}
            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2"
          >
            <LeagueBadge name={competition.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{competition.name}</span>
              {competition.country ? (
                <span className="block truncate text-[11px] uppercase text-muted-foreground">
                  {competition.country}
                </span>
              ) : null}
            </span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
              {competition.count}
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function MatchRow({
  match,
  selected,
  favorite,
  onOpen,
  onToggleFavorite,
}: {
  match: MatchCard;
  selected: boolean;
  favorite: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const playing = match.status === "HT_1ST" || match.status === "HT_2ND";
  const home = match.score?.home ?? null;
  const away = match.score?.away ?? null;
  const hasScore = home != null && away != null;
  const homeLead = hasScore && home > away;
  const awayLead = hasScore && away > home;

  return (
    <div
      className={cn(
        "group relative flex items-stretch rounded-xl border border-transparent transition-colors",
        selected ? "border-primary/40 bg-primary/10" : "hover:bg-surface-2/80",
      )}
    >
      {selected ? <span className="ls-brand absolute inset-y-2 left-0 w-0.5 rounded-full" /> : null}
      <button
        type="button"
        onClick={onOpen}
        className="grid min-w-0 flex-1 grid-cols-[48px_1fr_auto] items-center gap-2 py-2.5 pl-2.5 pr-1 text-left"
      >
        <span className="flex flex-col items-start gap-1">
          <StatusBadge match={match} playing={playing} />
        </span>
        <span className="min-w-0 space-y-1.5">
          <TeamLine name={match.homeName} imageId={match.homeImageId} dim={awayLead} />
          <TeamLine name={match.awayName} imageId={match.awayImageId} dim={homeLead} />
        </span>
        <span
          className={cn(
            "min-w-7 space-y-1.5 text-right text-sm font-bold tabular-nums",
            playing && "text-live",
          )}
        >
          {hasScore ? (
            <>
              <span className={cn("block", awayLead && !playing && "text-muted-foreground")}>{home}</span>
              <span className={cn("block", homeLead && !playing && "text-muted-foreground")}>{away}</span>
            </>
          ) : (
            <span className="block text-xs font-medium text-muted-foreground">vs</span>
          )}
        </span>
      </button>
      <button
        type="button"
        aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        aria-pressed={favorite}
        onClick={onToggleFavorite}
        className="grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <Star
          className={cn(
            "size-4 transition-transform group-hover:scale-110",
            favorite && "fill-[oklch(0.82_0.15_85)] text-[oklch(0.82_0.15_85)]",
          )}
        />
      </button>
    </div>
  );
}

function StatusBadge({ match, playing }: { match: MatchCard; playing: boolean }) {
  const label = minuteLabel(match);
  if (playing) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold tabular-nums text-live">
        <span className="ls-live-dot !size-1.5" />
        {label}
      </span>
    );
  }
  if (match.status === "HT" || match.status === "PAUSED") {
    return (
      <span className="rounded-md bg-[oklch(0.82_0.15_85/15%)] px-1.5 py-0.5 text-[10px] font-bold text-[oklch(0.85_0.15_85)]">
        {label}
      </span>
    );
  }
  if (match.phase === "ended") {
    return (
      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">FT</span>
    );
  }
  return <span className="text-xs font-semibold tabular-nums text-muted-foreground">{label}</span>;
}

function TeamLine({ name, imageId, dim }: { name: string; imageId: string | null; dim: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Crest imageId={imageId} name={name} className="size-5" />
      <span className={cn("truncate text-[13px]", dim ? "text-muted-foreground" : "font-semibold")}>{name}</span>
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
  tone = "primary",
}: {
  icon: typeof Star;
  title: string;
  text: string;
  tone?: "primary" | "loss";
}) {
  return (
    <div className="px-6 py-14 text-center">
      <span
        className={cn(
          "mx-auto grid size-12 place-items-center rounded-2xl",
          tone === "loss" ? "bg-loss/15 text-loss" : "bg-primary/15 text-primary",
        )}
      >
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-60 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl bg-surface-2/50 p-3">
          <div className="h-3 w-8 animate-pulse rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-6 w-4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function changeDate(
  search: LivescoreSearch,
  days: number,
  onSearch: (search: LivescoreSearch) => void,
) {
  const data = shiftDate(search.data, days);
  const today = todaySaoPaulo();
  const filtro: Phase = data < today ? "ended" : data > today ? "upcoming" : "live";
  onSearch({ ...search, data, filtro, liga: "" });
}

function groupMatches(matches: MatchCard[], filtro: Phase) {
  const groups = new Map<
    string,
    { key: string; name: string; country: string | null; matches: MatchCard[] }
  >();
  for (const match of matches) {
    const key = match.leagueId ?? match.leagueName;
    const group = groups.get(key) ?? {
      key,
      name: match.leagueName,
      country: countryLabel(match),
      matches: [],
    };
    group.matches.push(match);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.matches.sort((a, b) => compareMatches(a, b, filtro));
  }
  return [...groups.values()];
}

function countryLabel(match: MatchCard) {
  if (!match.country || match.country === match.leagueName) return null;
  return match.country.length <= 3 ? match.country.toUpperCase() : match.country;
}

function compareMatches(a: MatchCard, b: MatchCard, filtro: Phase) {
  if (filtro === "live") return (b.elapsed ?? 0) - (a.elapsed ?? 0);
  const aTime = a.kickoff ? Date.parse(a.kickoff) : 0;
  const bTime = b.kickoff ? Date.parse(b.kickoff) : 0;
  return filtro === "upcoming" ? aTime - bTime : bTime - aTime;
}

function competitionOptions(matches: MatchCard[]) {
  const map = new Map<string, { id: string; name: string; country: string | null; count: number }>();
  for (const match of matches) {
    const id = match.leagueId ?? match.leagueName;
    const current = map.get(id) ?? { id, name: match.leagueName, country: countryLabel(match), count: 0 };
    current.count += 1;
    map.set(id, current);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt"));
}
