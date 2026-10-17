import type { StatLine } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

export function StatBars({ stats }: { stats: StatLine[] }) {
  return (
    <div className="space-y-4">
      {stats.map((stat) => {
        const max = Math.max(Math.abs(stat.home), Math.abs(stat.away)) || 1;
        const homeWins = stat.home > stat.away;
        const awayWins = stat.away > stat.home;
        return (
          <div key={stat.key}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span
                className={cn(
                  "min-w-10 rounded-md px-1.5 text-left font-bold tabular-nums",
                  homeWins ? "bg-home/15 text-home" : "text-muted-foreground",
                )}
              >
                {formatStat(stat.home, stat.key)}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
              <span
                className={cn(
                  "min-w-10 rounded-md px-1.5 text-right font-bold tabular-nums",
                  awayWins ? "bg-away/15 text-away" : "text-muted-foreground",
                )}
              >
                {formatStat(stat.away, stat.key)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex h-2 justify-end overflow-hidden rounded-full bg-surface-2">
                <span
                  className={cn("rounded-full transition-[width] duration-500", homeWins ? "bg-home" : "bg-home/45")}
                  style={{ width: `${(Math.abs(stat.home) / max) * 100}%` }}
                />
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                <span
                  className={cn("rounded-full transition-[width] duration-500", awayWins ? "bg-away" : "bg-away/45")}
                  style={{ width: `${(Math.abs(stat.away) / max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatStat(value: number, key: string) {
  if (key.startsWith("possession") || key.endsWith("_pct")) {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
