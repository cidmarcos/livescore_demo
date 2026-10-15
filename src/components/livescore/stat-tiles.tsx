import { CalendarClock, CheckCircle2, Radio, Star } from "lucide-react";

import type { LivescoreSearch, Phase } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

type TileId = "favoritos" | Phase;

export function StatTiles({
  search,
  counts,
  onSelect,
}: {
  search: LivescoreSearch;
  counts: Record<TileId, number | null>;
  onSelect: (id: TileId) => void;
}) {
  const tiles: { id: TileId; label: string; icon: typeof Radio; tone: string }[] = [
    { id: "favoritos", label: "Favoritos", icon: Star, tone: "text-[oklch(0.82_0.15_85)]" },
    { id: "live", label: "Ao vivo", icon: Radio, tone: "text-live" },
    { id: "ended", label: "Finalizados", icon: CheckCircle2, tone: "text-win" },
    { id: "upcoming", label: "Próximos", icon: CalendarClock, tone: "text-primary" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 md:gap-3">
      {tiles.map((tile) => {
        const active =
          tile.id === "favoritos"
            ? search.aba === "favoritos"
            : search.aba !== "favoritos" && search.filtro === tile.id;
        const value = counts[tile.id];
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onSelect(tile.id)}
            aria-pressed={active}
            className={cn(
              "ls-card group relative overflow-hidden px-2.5 py-2.5 text-left transition-all md:px-4 md:py-3",
              active ? "ls-glow bg-accent/40" : "hover:border-primary/30",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold tabular-nums md:text-2xl">{value ?? "–"}</span>
              <tile.icon className={cn("hidden size-4 opacity-80 sm:block", tile.tone)} />
            </div>
            <span className="mt-0.5 block truncate text-[9px] font-semibold uppercase text-muted-foreground sm:text-[10px] sm:tracking-wider md:text-[11px]">
              {tile.label}
            </span>
            {active ? <span className="ls-brand absolute inset-x-0 bottom-0 h-0.5" /> : null}
          </button>
        );
      })}
    </div>
  );
}
