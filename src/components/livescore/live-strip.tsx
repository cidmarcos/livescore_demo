import { ChevronRight } from "lucide-react";

import { Crest } from "@/components/livescore/crest";
import { Flag } from "@/components/livescore/flag";
import { minuteLabel } from "@/lib/livescore/parse";
import type { MatchCard } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

export function LiveStrip({
  matches,
  selectedId,
  onOpen,
  onSeeAll,
}: {
  matches: MatchCard[];
  selectedId: string | null;
  onOpen: (fixtureId: string) => void;
  onSeeAll: () => void;
}) {
  if (matches.length === 0) return null;
  const featured = [...matches].sort((a, b) => (b.elapsed ?? 0) - (a.elapsed ?? 0)).slice(0, 10);

  return (
    <section className="ls-enter">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight">
            <span className="ls-live-dot" />
            Ao vivo agora
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {matches.length} {matches.length === 1 ? "jogo rolando" : "jogos rolando"} neste momento
          </p>
        </div>
        <button
          type="button"
          onClick={onSeeAll}
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Ver todos
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      <div className="ls-no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {featured.map((match) => (
          <button
            key={match.fixtureId}
            type="button"
            onClick={() => onOpen(match.fixtureId)}
            className={cn(
              "ls-card w-[248px] shrink-0 snap-start p-3.5 text-left transition-transform hover:-translate-y-0.5",
              selectedId === match.fixtureId && "ls-glow",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Flag code={match.country} className="h-3 w-4" />
                <span className="truncate">{match.leagueName}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-bold text-live">
                <span className="ls-live-dot !size-1.5" />
                {minuteLabel(match)}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <StripTeam name={match.homeName} imageId={match.homeImageId} goals={match.score?.home ?? null} />
              <StripTeam name={match.awayName} imageId={match.awayImageId} goals={match.score?.away ?? null} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function StripTeam({
  name,
  imageId,
  goals,
}: {
  name: string;
  imageId: string | null;
  goals: number | null;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Crest imageId={imageId} name={name} className="size-6" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      <span className="text-lg font-bold tabular-nums">{goals ?? "–"}</span>
    </div>
  );
}
