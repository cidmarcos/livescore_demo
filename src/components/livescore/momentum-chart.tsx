import { Activity } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { Crest } from "@/components/livescore/crest";
import type { MomentumPoint } from "@/lib/livescore/parse";
import type { MatchCard } from "@/lib/livescore/types";

const MATCH_MINUTES = 100;

export function MomentumChart({ points, match }: { points: MomentumPoint[]; match: MatchCard }) {
  const byMinute = new Map(points.map((point) => [point.minute, point.value]));
  const minutes = Array.from({ length: MATCH_MINUTES }, (_, index) => {
    const minute = index + 1;
    return { minute, value: byMinute.get(minute) ?? 0 };
  });
  const peak = Math.max(1, ...minutes.map((point) => Math.abs(point.value)));

  return (
    <div className="ls-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Activity className="size-4 text-primary" />
          Fluxo da partida
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-home" />
            <Crest imageId={match.homeImageId} name={match.homeName} className="size-4" />
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-away" />
            <Crest imageId={match.awayImageId} name={match.awayName} className="size-4" />
          </span>
        </div>
      </div>
      <div className="rounded-xl bg-surface-2/40 px-1 py-2">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={minutes} barCategoryGap={0} barGap={0}>
            <ReferenceLine y={0} stroke="oklch(1 0 0 / 18%)" />
            <ReferenceLine x={45} stroke="oklch(1 0 0 / 30%)" strokeDasharray="4 4" />
            <XAxis dataKey="minute" hide />
            <YAxis hide domain={[-peak, peak]} />
            <Bar dataKey="value" isAnimationActive={false}>
              {minutes.map((point) => (
                <Cell
                  key={point.minute}
                  fill={point.value >= 0 ? "oklch(0.74 0.17 155)" : "oklch(0.7 0.17 295)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="relative mt-2 h-4 text-[10px] font-medium text-muted-foreground">
        <span className="absolute left-0">0'</span>
        <span className="absolute left-[45%] -translate-x-1/2">Intervalo</span>
        <span className="absolute right-0">100'</span>
      </div>
    </div>
  );
}
