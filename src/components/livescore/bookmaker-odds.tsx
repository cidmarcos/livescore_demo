import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import type { BookmakerBook, BookmakerMarket } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    title: "Principais",
    keys: ["ft_result", "ht_result", "double_chance", "dnb", "btts", "btts_1h", "btts_2h", "btts_o25", "highest_scoring_half", "asian_handicap"],
  },
  {
    title: "Gols",
    keys: ["total_goals", "total_goals_1h", "total_goals_2h", "home_goals", "away_goals", "goal_line", "goal_line_1h"],
  },
  {
    title: "Escanteios",
    keys: ["total_corners", "asian_corners", "asian_corners_1h"],
  },
] as const;

const MARKET_LABELS: Record<string, string> = {
  ft_result: "Resultado final",
  ht_result: "Resultado 1º tempo",
  double_chance: "Dupla chance",
  dnb: "Empate anula",
  btts: "Ambas marcam",
  btts_1h: "Ambas marcam (1º tempo)",
  btts_2h: "Ambas marcam (2º tempo)",
  btts_o25: "Ambas marcam e over 2.5",
  highest_scoring_half: "Tempo com mais gols",
  asian_handicap: "Handicap asiático",
  total_goals: "Total de gols",
  total_goals_1h: "Gols no 1º tempo",
  total_goals_2h: "Gols no 2º tempo",
  home_goals: "Gols da casa",
  away_goals: "Gols do visitante",
  goal_line: "Linha de gols",
  goal_line_1h: "Linha de gols no 1º tempo",
  total_corners: "Total de escanteios",
  asian_corners: "Escanteios asiáticos",
  asian_corners_1h: "Escanteios asiáticos (1º tempo)",
};

const OUTCOME_LABELS: Record<string, string> = {
  home: "Casa",
  away: "Fora",
  draw: "Empate",
  yes: "Sim",
  no: "Não",
  home_draw: "1X",
  home_away: "12",
  draw_away: "X2",
  first_half: "1º tempo",
  second_half: "2º tempo",
  tie: "Empate",
};

export function PriceMarkets({ markets }: { markets: BookmakerMarket[] }) {
  if (markets.length === 0) return null;
  const groups = marketGroups(markets);
  return (
    <section className="ls-card p-4 md:p-5">
      <h3 className="text-sm font-bold">Odds pré-jogo</h3>
      <p className="mb-4 mt-1 text-xs text-muted-foreground">Todos os mercados publicados para este jogo.</p>
      <MarketGroups groups={groups} />
    </section>
  );
}

export function BookmakerOdds({
  loading,
  failed,
  books,
}: {
  loading: boolean;
  failed: boolean;
  books: BookmakerBook[];
}) {
  const [name, setName] = useState(books[0]?.name ?? "Pinnacle");
  const book = books.find((item) => item.name === name) ?? books[0];
  if (loading) {
    return <div className="ls-card h-40 animate-pulse" />;
  }
  if (failed) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Não foi possível carregar as odds da Pinnacle e da Bet365.</p>;
  }
  if (!book) {
    return <p className="py-8 text-center text-sm text-muted-foreground">A Pinnacle e a Bet365 ainda não publicaram odds deste jogo.</p>;
  }
  const groups = marketGroups(book.markets);
  return (
    <section className="ls-card p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Pinnacle e Bet365</h3>
          <p className="mt-1 text-xs text-muted-foreground">Pré-jogo, com abertura, fechamento e pico.</p>
        </div>
        {books.length > 1 ? (
          <div className="flex rounded-full bg-surface-2 p-0.5">
            {books.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setName(item.name)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold",
                  item.name === book.name ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">{book.name}</span>
        )}
      </div>
      <MarketGroups groups={groups} />
    </section>
  );
}

function MarketGroups({ groups }: { groups: { title: string; markets: BookmakerMarket[] }[] }) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {group.markets.map((market) => (
              <MarketCard
                key={market.key}
                market={market}
                wide={market.outcomes.length > 4 || market.key === "asian_handicap" || market.key.includes("corners")}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MarketCard({ market, wide }: { market: BookmakerMarket; wide: boolean }) {
  const outcomes = [...market.outcomes].sort((left, right) => compareOutcomes(left.key, right.key));
  return (
    <div className={cn("rounded-xl border border-border bg-surface-2/40 p-3", wide && "md:col-span-2")}>
      <p className="mb-2 text-[11px] font-semibold text-muted-foreground">{MARKET_LABELS[market.key] ?? labelFromKey(market.key)}</p>
      <div className={cn("grid gap-2", outcomes.length === 3 ? "grid-cols-3" : outcomes.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {outcomes.map((outcome) => (
          <Outcome key={outcome.key} label={outcomeLabel(outcome.key)} opening={outcome.opening} closing={outcome.closing} peak={outcome.peak} />
        ))}
      </div>
    </div>
  );
}

function Outcome({
  label,
  opening,
  closing,
  peak,
}: {
  label: string;
  opening: number | null;
  closing: number | null;
  peak: number | null;
}) {
  const moved = opening != null && closing != null ? closing - opening : 0;
  const up = moved > 0.001;
  const down = moved < -0.001;
  return (
    <div className="min-w-0 text-center">
      <p className="truncate text-[10px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 inline-flex items-center justify-center gap-0.5 text-sm font-bold tabular-nums",
          up && "text-rose-400",
          down && "text-emerald-400",
        )}
      >
        {up ? <TrendingUp className="size-3" /> : null}
        {down ? <TrendingDown className="size-3" /> : null}
        {price(closing)}
      </p>
      {opening != null ? <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">Abert. {price(opening)}</p> : null}
      {peak != null ? <p className="text-[10px] tabular-nums text-muted-foreground">Pico {price(peak)}</p> : null}
    </div>
  );
}

function marketGroups(markets: BookmakerMarket[]) {
  const used = new Set<string>();
  const groups: { title: string; markets: BookmakerMarket[] }[] = GROUPS.map((group) => {
    const selected = group.keys.flatMap((key) => {
      const market = markets.find((item) => item.key === key);
      if (!market) return [];
      used.add(key);
      return [market];
    });
    return { title: group.title, markets: selected };
  }).filter((group) => group.markets.length > 0);
  const others = markets.filter((market) => !used.has(market.key));
  if (others.length > 0) groups.push({ title: "Outros", markets: others });
  return groups;
}

function compareOutcomes(left: string, right: string) {
  const a = outcomeRank(left);
  const b = outcomeRank(right);
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

function outcomeRank(key: string): [number, number, number] {
  const simple = ["home", "draw", "tie", "away", "yes", "no", "home_draw", "home_away", "draw_away", "first_half", "second_half"];
  const index = simple.indexOf(key);
  if (index >= 0) return [0, index, 0];
  const over = key.match(/^(over|under)_(\d+)$/);
  const overSide = over?.[1];
  const overLine = over?.[2];
  if (overSide && overLine) return [1, tenthLine(overLine) ?? 0, overSide === "over" ? 0 : 1];
  const exact = key.match(/^exactly_(\d+)$/)?.[1];
  if (exact) return [2, Number(exact), 0];
  const handicap = key.match(/^(home|away)_(m|p)?(\d+)$/);
  const team = handicap?.[1];
  const digits = handicap?.[3];
  if (team && digits) {
    const value = lineNumber(digits);
    const signed = value == null ? 0 : handicap?.[2] === "m" ? -value : value;
    return [3, signed, team === "home" ? 0 : 1];
  }
  return [9, 0, 0];
}

function outcomeLabel(key: string) {
  if (OUTCOME_LABELS[key]) return OUTCOME_LABELS[key];
  const over = key.match(/^(over|under)_(\d+)$/);
  const overSide = over?.[1];
  const overLine = over?.[2];
  if (overSide && overLine) return `${overSide === "over" ? "Over" : "Under"} ${tenthLabel(overLine)}`;
  const exact = key.match(/^exactly_(\d+)$/)?.[1];
  if (exact) return `Exato ${exact}`;
  const handicap = key.match(/^(home|away)_(m|p)?(\d+)$/);
  const side = handicap?.[1];
  const digits = handicap?.[3];
  if (side && digits) {
    const team = side === "home" ? "Casa" : "Fora";
    const value = lineNumber(digits);
    const signed = value == null ? null : handicap?.[2] === "m" ? -value : value;
    if (signed == null) return `${team} ${digits}`;
    const sign = signed > 0 ? "+" : "";
    return `${team} ${sign}${trimNumber(signed)}`;
  }
  return labelFromKey(key);
}

function tenthLabel(raw: string) {
  const value = tenthLine(raw);
  return value == null ? raw : trimNumber(value);
}

function tenthLine(raw: string) {
  if (raw.length >= 2) return Number(`${raw.slice(0, -1)}.${raw.slice(-1)}`);
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function lineNumber(raw: string) {
  if (raw.length >= 3) return Number(`${raw.slice(0, -2)}.${raw.slice(-2)}`);
  if (raw.length === 2) return Number(`${raw[0]}.${raw[1]}`);
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function trimNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function price(value: number | null) {
  return value == null ? "–" : value.toFixed(2);
}

function labelFromKey(key: string) {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
