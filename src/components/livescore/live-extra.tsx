import { useState } from "react";

import { StatBars } from "@/components/livescore/stat-bars";
import type { BookPrice, LiveExtra, OptaRow } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

type Price = { home: number; draw: number; away: number };

export function impliedProbability(odds: Price) {
  const home = 1 / odds.home;
  const draw = 1 / odds.draw;
  const away = 1 / odds.away;
  const total = home + draw + away;
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    home: (home / total) * 100,
    draw: (draw / total) * 100,
    away: (away / total) * 100,
  };
}

export function PressurePanel({ live }: { live: LiveExtra }) {
  if (live.pressure.length === 0) return null;
  return (
    <section className="ls-card p-4 md:p-5">
      <h3 className="mb-4 text-sm font-bold">Pressão</h3>
      <StatBars stats={live.pressure} />
    </section>
  );
}

export function MinuteWindows({ live }: { live: LiveExtra }) {
  const [minutes, setMinutes] = useState(live.windows[0]?.minutes ?? 5);
  const window = live.windows.find((item) => item.minutes === minutes) ?? live.windows[0];
  if (!window) return null;
  return (
    <section className="ls-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">Últimos minutos</h3>
        <div className="flex rounded-full bg-surface-2 p-0.5">
          {live.windows.map((item) => (
            <button
              key={item.minutes}
              type="button"
              onClick={() => setMinutes(item.minutes)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                item.minutes === window.minutes ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {item.minutes} min
            </button>
          ))}
        </div>
      </div>
      <StatBars stats={window.stats} />
    </section>
  );
}

export function ProbabilityPanel({ odds }: { odds: Price }) {
  const probability = impliedProbability(odds);
  if (!probability) return null;
  return (
    <section className="ls-card p-4 md:p-5">
      <h3 className="text-sm font-bold">Probabilidade da partida</h3>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">Calculada a partir das odds 1X2, já sem a margem da casa.</p>
      <div className="grid grid-cols-3 gap-2">
        <Chance label="Casa" value={probability.home} tone="home" />
        <Chance label="Empate" value={probability.draw} tone="draw" />
        <Chance label="Fora" value={probability.away} tone="away" />
      </div>
    </section>
  );
}

export function OddsPanel({ odds, books }: { odds: Price | null; books: BookPrice[] }) {
  const rows = oddsRows(odds, books);
  if (rows.length === 0) return null;
  return (
    <section className="ls-card p-4 md:p-5">
      <h3 className="mb-3 text-sm font-bold">Odds 1X2</h3>
      <div className="mb-2 grid grid-cols-[1fr_repeat(3,3.5rem)] gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Casa de apostas</span>
        <span className="text-center">Casa</span>
        <span className="text-center">Empate</span>
        <span className="text-center">Fora</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((book) => (
          <div key={book.name} className="grid grid-cols-[1fr_repeat(3,3.5rem)] items-center gap-2 text-sm">
            <span className="truncate font-medium">{book.name}</span>
            <span className="text-center font-bold tabular-nums text-home">{book.home.toFixed(2)}</span>
            <span className="text-center font-bold tabular-nums">{book.draw.toFixed(2)}</span>
            <span className="text-center font-bold tabular-nums text-away">{book.away.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function oddsRows(odds: Price | null, books: BookPrice[]) {
  const rows = books.map((book) => ({ ...book }));
  if (odds && !rows.some((book) => samePrice(book, odds))) {
    rows.unshift({ name: "1X2", home: odds.home, draw: odds.draw, away: odds.away });
  }
  return rows;
}

function samePrice(left: Price, right: Price) {
  return Math.abs(left.home - right.home) < 0.001 && Math.abs(left.draw - right.draw) < 0.001 && Math.abs(left.away - right.away) < 0.001;
}

function Chance({ label, value, tone }: { label: string; value: number; tone: "home" | "draw" | "away" }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 px-2 py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          tone === "home"
            ? "mt-1 text-xl font-bold tabular-nums text-home"
            : tone === "away"
              ? "mt-1 text-xl font-bold tabular-nums text-away"
              : "mt-1 text-xl font-bold tabular-nums"
        }
      >
        {`${value.toFixed(value >= 10 ? 0 : 1)}%`}
      </p>
    </div>
  );
}

export function LiveOpta({ live }: { live: LiveExtra }) {
  if (live.opta.length === 0) return null;
  return (
    <div className="ls-card space-y-6 p-4 md:p-5">
      {live.opta.map((group) => {
        const numeric = group.rows.filter((row) => row.homeValue != null && row.awayValue != null);
        const text = group.rows.filter((row) => row.homeValue == null || row.awayValue == null);
        return (
          <div key={group.title}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
            {numeric.length > 0 ? (
              <StatBars
                stats={numeric.map((row, index) => ({
                  key: percentRow(row) ? `opta-${group.title}-${index}-pct` : `opta-${group.title}-${index}`,
                  label: row.label,
                  home: row.homeValue ?? 0,
                  away: row.awayValue ?? 0,
                }))}
              />
            ) : null}
            {text.length > 0 ? (
              <div className={cn("space-y-2", numeric.length > 0 && "mt-4")}>
                {text.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-10 font-bold tabular-nums text-home">{row.home}</span>
                    <span className="text-center text-xs font-medium text-muted-foreground">{row.label}</span>
                    <span className="min-w-10 text-right font-bold tabular-nums text-away">{row.away}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function percentRow(row: OptaRow) {
  return row.home.includes("%") || row.away.includes("%") || /posse|possession/i.test(row.label);
}
