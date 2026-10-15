import { Activity } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { Crest } from "@/components/livescore/crest";
import type { MomentumPoint } from "@/lib/livescore/parse";
import type { MatchCard } from "@/lib/livescore/types";

export function MomentumChart({ points, match }: { points: MomentumPoint[]; match: MatchCard }) {
  const lastMinute = points[points.length - 1]?.minute ?? 0;

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
      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          O fluxo aparece quando os lances começam a chegar.
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-surface-2/40 px-1 py-2">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={points} barCategoryGap={1}>
                <ReferenceLine y={0} stroke="oklch(1 0 0 / 18%)" />
                {lastMinute >= 45 ? (
                  <ReferenceLine x={45} stroke="oklch(1 0 0 / 30%)" strokeDasharray="4 4" />
                ) : null}
                <XAxis dataKey="minute" hide />
                <YAxis hide />
                <Bar dataKey="value" radius={[2, 2, 2, 2]} isAnimationActive={false}>
                  {points.map((point) => (
                    <Cell
                      key={point.minute}
                      fill={point.value >= 0 ? "oklch(0.74 0.17 155)" : "oklch(0.7 0.17 295)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex justify-between px-1 text-[10px] font-medium text-muted-foreground">
            <span>0'</span>
            {lastMinute >= 45 ? <span>Intervalo</span> : null}
            <span>{lastMinute}'</span>
          </div>
        </>
      )}
    </div>
  );
}
