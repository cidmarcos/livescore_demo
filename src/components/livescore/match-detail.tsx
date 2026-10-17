import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CircleDot,
  Clock,
  Crosshair,
  Flag,
  Maximize2,
  Radar,
  Share2,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Crest } from "@/components/livescore/crest";
import { Flag as CountryFlag } from "@/components/livescore/flag";
import { formationRows, lastName } from "@/components/livescore/formation";
import { MomentumChart } from "@/components/livescore/momentum-chart";
import {
  fetchDetail,
  fetchEvents,
  fetchLineups,
  fetchRadars,
  fetchTable,
  LivescoreError,
} from "@/lib/livescore/api";
import {
  buildMomentum,
  formatKickoff,
  goalsBySide,
  parseEvent,
  statusLabel,
  teamSide,
  type EventKind,
} from "@/lib/livescore/parse";
import type { LineupPlayer, LineupSide, MatchCard, Phase, StandingGroup, StatLine } from "@/lib/livescore/types";
import { cn } from "@/lib/utils";

const tabs = [
  ["detalhes", "Detalhes"],
  ["estatisticas", "Estatísticas"],
  ["comentario", "Lances"],
  ["formacoes", "Formações"],
  ["classificacao", "Classificação"],
] as const;

type TabId = (typeof tabs)[number][0];

export function MatchDetail({
  fixtureId,
  known,
  onClose,
}: {
  fixtureId: string;
  known: MatchCard | null;
  onClose: () => void;
}) {
  const phase: Phase | "auto" = known?.phase ?? "auto";
  const isLive = phase === "live";
  const [tab, setTab] = useState<TabId>("detalhes");
  const [radarOpen, setRadarOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["livescore", "detail", fixtureId, phase],
    queryFn: () => fetchDetail(fixtureId, phase),
    retry: retryLivescore,
    refetchInterval: isLive ? 60_000 : false,
  });
  const events = useQuery({
    queryKey: ["livescore", "events", fixtureId, phase],
    queryFn: () => fetchEvents(fixtureId, phase),
    retry: retryLivescore,
    refetchInterval: isLive ? 60_000 : false,
  });
  const radars = useQuery({
    queryKey: ["livescore", "radar"],
    queryFn: fetchRadars,
    staleTime: 60_000,
  });
  const lineups = useQuery({
    queryKey: ["livescore", "lineups", fixtureId],
    queryFn: () => fetchLineups(fixtureId),
    enabled: tab === "formacoes",
    staleTime: 10 * 60_000,
    retry: retryLivescore,
  });
  const match = detail.data?.match ?? known;
  const table = useQuery({
    queryKey: ["livescore", "table", match?.leagueId],
    queryFn: () => fetchTable(match?.leagueId ?? ""),
    enabled: tab === "classificacao" && Boolean(match?.leagueId),
    retry: retryLivescore,
  });

  const radarUrl = radars.data?.radars.find((item) => item.fixtureId === fixtureId)?.url ?? null;
  const eventList = events.data?.events ?? [];
  const goalList = goalsBySide(eventList, match?.homeName ?? "", match?.awayName ?? "");
  const momentum = buildMomentum(
    eventList,
    events.data?.timeline ?? null,
    match?.homeName ?? "",
    match?.awayName ?? "",
  );

  if (!match && detail.isPending) {
    return (
      <div className="space-y-4">
        <div className="ls-card h-64 animate-pulse" />
        <div className="ls-card h-40 animate-pulse" />
      </div>
    );
  }
  if (!match) {
    return (
      <DetailMessage
        onClose={onClose}
        message={messageFrom(detail.error, "Não foi possível abrir este jogo.")}
      />
    );
  }

  const kickoff = formatKickoff(match.kickoff);
  const odds = detail.data?.odds ?? null;
  const showHt =
    match.score?.htHome != null && match.score?.htAway != null && match.status !== "HT_1ST";

  return (
    <section className="ls-enter min-w-0 space-y-4">
      <div className="ls-card relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_16rem_at_50%_-30%,oklch(0.5_0.2_290/35%),transparent_70%)]" />
        <div className="relative p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-2/80 md:hidden"
                aria-label="Voltar para a lista"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-primary">
                  <CountryFlag code={match.country} fallback={<Trophy className="size-3.5 shrink-0" />} />
                  <span className="truncate">{match.leagueName}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3" />
                    {kickoff.label.split(" · ")[0] || "Data a confirmar"}
                  </span>
                  {kickoff.time ? (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {kickoff.time}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Compartilhar jogo"
              onClick={() => shareMatch(match)}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-2/80 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Share2 className="size-4" />
            </button>
          </div>

          <div className="mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-6">
            <TeamBlock name={match.homeName} imageId={match.homeImageId} goals={goalList.home} />
            <div className="flex flex-col items-center pt-2">
              <StatusPill match={match} />
              <p className="mt-3 flex items-center gap-2 text-4xl font-extrabold tabular-nums tracking-tight md:text-5xl">
                <span>{match.score?.home ?? "–"}</span>
                <span className="text-2xl text-muted-foreground/60">-</span>
                <span>{match.score?.away ?? "–"}</span>
              </p>
              {showHt ? (
                <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                  HT {match.score?.htHome}-{match.score?.htAway}
                </p>
              ) : null}
            </div>
            <TeamBlock name={match.awayName} imageId={match.awayImageId} goals={goalList.away} />
          </div>

          {odds || radarUrl ? (
            <div className="mt-6 flex flex-col items-center gap-4">
              {odds ? (
                <div className="grid w-full max-w-md grid-cols-3 gap-2">
                  <OddsTile label="Casa" price={odds.home} tone="home" />
                  <OddsTile label="Empate" price={odds.draw} tone="draw" />
                  <OddsTile label="Fora" price={odds.away} tone="away" />
                </div>
              ) : null}
              {radarUrl ? (
                <button
                  type="button"
                  onClick={() => setRadarOpen(true)}
                  className="ls-brand inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_var(--color-glow)] transition-transform hover:-translate-y-0.5"
                >
                  <Radar className="size-4" />
                  Radar ao vivo
                  <Maximize2 className="size-3.5 opacity-80" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="sticky top-[116px] z-20 md:top-0">
        <div className="ls-card ls-no-scrollbar flex gap-1 overflow-x-auto p-1.5 backdrop-blur-xl">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold uppercase tracking-wide transition-all",
                tab === id
                  ? "ls-brand text-white shadow-[0_8px_20px_-8px_var(--color-glow)]"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="ls-enter">
        {tab === "detalhes" ? (
          <div className="space-y-4">
            <MomentumChart points={momentum} match={match} />
            {(detail.data?.stats ?? []).length > 0 ? (
              <Panel title="Resumo">
                <StatBars stats={(detail.data?.stats ?? []).slice(0, 4)} />
              </Panel>
            ) : null}
            {eventList.length > 0 ? (
              <Panel title="Últimos lances">
                <Timeline events={eventList.slice(-5)} home={match.homeName} away={match.awayName} />
              </Panel>
            ) : null}
          </div>
        ) : null}
        {tab === "estatisticas" ? (
          <Panel title="Estatísticas da partida">
            {detail.isPending && !detail.data ? (
              <PanelSkeleton />
            ) : (detail.data?.stats ?? []).length === 0 ? (
              <Muted>Estatísticas ainda não disponíveis.</Muted>
            ) : (
              <StatBars stats={detail.data?.stats ?? []} />
            )}
          </Panel>
        ) : null}
        {tab === "comentario" ? (
          <Panel title="Lance a lance">
            {events.isPending ? (
              <PanelSkeleton />
            ) : eventList.length === 0 ? (
              <Muted>Sem lances publicados.</Muted>
            ) : (
              <Timeline events={eventList} home={match.homeName} away={match.awayName} />
            )}
          </Panel>
        ) : null}
        {tab === "formacoes" ? (
          <LineupPanel
            loading={lineups.isPending}
            error={lineups.error}
            home={lineups.data?.home ?? null}
            away={lineups.data?.away ?? null}
          />
        ) : null}
        {tab === "classificacao" ? (
          <StandingsPanel
            loading={table.isPending}
            error={table.error}
            season={table.data?.seasonName ?? null}
            tables={table.data?.tables ?? null}
            home={match.homeName}
            away={match.awayName}
          />
        ) : null}
      </div>

      {radarOpen && radarUrl ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <span className="ls-live-dot" />
              <span className="truncate">
                {match.homeName} x {match.awayName}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setRadarOpen(false)}
              className="grid size-9 place-items-center rounded-xl border border-border bg-surface-2"
              aria-label="Fechar radar"
            >
              <X className="size-4" />
            </button>
          </div>
          <iframe title="Radar da partida" src={radarUrl} className="min-h-0 w-full flex-1 border-0" />
        </div>
      ) : null}
    </section>
  );
}

function StatusPill({ match }: { match: MatchCard }) {
  const playing = match.status === "HT_1ST" || match.status === "HT_2ND";
  if (playing) {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-live/30 bg-live/15 px-3 py-1 text-[11px] font-bold text-live">
        <span className="ls-live-dot !size-1.5" />
        Ao vivo{match.elapsed != null ? ` · ${match.elapsed}'` : ""}
      </span>
    );
  }
  const label = match.phase === "ended" ? "Finalizado" : statusLabel(match.status, match.phase);
  return (
    <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold text-muted-foreground">
      {label}
    </span>
  );
}

function TeamBlock({ name, imageId, goals }: { name: string; imageId: string | null; goals: string[] }) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <span className="grid size-16 place-items-center rounded-2xl border border-border bg-surface-2/70 md:size-20">
        <Crest imageId={imageId} name={name} className="size-11 md:size-14" />
      </span>
      <p className="mt-3 line-clamp-2 text-sm font-bold md:text-base">{name}</p>
      {goals.length > 0 ? (
        <p className="mt-1 flex flex-wrap justify-center gap-x-1.5 text-[11px] text-muted-foreground">
          {goals.map((minute, index) => (
            <span key={`${minute}-${index}`} className="flex items-center gap-0.5">
              <CircleDot className="size-3 text-win" />
              {minute}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function OddsTile({ label, price, tone }: { label: string; price: number; tone: "home" | "draw" | "away" }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-center",
        tone === "home" && "border-home/25 bg-home/10",
        tone === "draw" && "border-border bg-surface-2/80",
        tone === "away" && "border-away/25 bg-away/10",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums">{price.toFixed(2)}</p>
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="ls-card p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="h-6 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

function StatBars({ stats }: { stats: StatLine[] }) {
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

const kindStyle: Record<
  EventKind,
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  goal: { icon: CircleDot, className: "bg-win/20 text-win" },
  shot_on: { icon: Target, className: "bg-primary/20 text-primary" },
  shot_off: { icon: Crosshair, className: "bg-surface-2 text-muted-foreground" },
  corner: { icon: Flag, className: "bg-[oklch(0.78_0.14_230/18%)] text-[oklch(0.8_0.12_230)]" },
  yellow: { icon: CardIcon, className: "bg-[oklch(0.85_0.16_90/18%)] text-[oklch(0.88_0.16_90)]" },
  red: { icon: CardIcon, className: "bg-loss/20 text-loss" },
  other: { icon: Clock, className: "bg-surface-2 text-muted-foreground" },
};

function CardIcon({ className }: { className?: string }) {
  return <span className={cn("block h-3.5 w-2.5 rounded-[2px] bg-current", className)} />;
}

function Timeline({ events, home, away }: { events: { text: string }[]; home: string; away: string }) {
  const ordered = [...events].reverse();
  return (
    <ol className="relative space-y-1 before:absolute before:bottom-3 before:left-[51px] before:top-3 before:w-px before:bg-border">
      {ordered.map((event, index) => {
        const parsed = parseEvent(event.text);
        const side = parsed ? teamSide(parsed.team, home, away) : null;
        const style = kindStyle[parsed?.kind ?? "other"];
        const Icon = style.icon;
        const isGoal = parsed?.kind === "goal";
        return (
          <li
            key={`${event.text}-${index}`}
            className={cn(
              "relative grid grid-cols-[36px_32px_1fr] items-center gap-2 rounded-xl px-1 py-2",
              isGoal && "bg-win/8",
            )}
          >
            <span className="text-right text-xs font-bold tabular-nums text-muted-foreground">
              {parsed ? `${parsed.minute}'` : ""}
            </span>
            <span className={cn("relative z-10 grid size-8 place-items-center rounded-full ring-4 ring-card", style.className)}>
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className={cn("block text-sm", isGoal ? "font-bold" : "font-medium")}>
                {parsed?.kindLabel ?? event.text}
              </span>
              {parsed ? (
                <span
                  className={cn(
                    "block truncate text-xs",
                    side === "home" ? "text-home" : side === "away" ? "text-away" : "text-muted-foreground",
                  )}
                >
                  {parsed.team}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function LineupPanel({
  loading,
  error,
  home,
  away,
}: {
  loading: boolean;
  error: unknown;
  home: LineupSide | null;
  away: LineupSide | null;
}) {
  if (loading) {
    return (
      <Panel title="Formações">
        <div className="aspect-[3/4] animate-pulse rounded-2xl bg-surface-2" />
      </Panel>
    );
  }
  if (error || !home || !away) {
    return (
      <Panel title="Formações">
        <Muted>{messageFrom(error, "Escalações ainda não disponíveis.")}</Muted>
      </Panel>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Pitch side={home} tone="home" />
      <Pitch side={away} tone="away" />
    </div>
  );
}

function Pitch({ side, tone }: { side: LineupSide; tone: "home" | "away" }) {
  const rows = formationRows(side.formation, side.starters);
  const confirmed = side.lineupStatus === "confirmed";
  return (
    <Panel
      title={side.name}
      action={
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold">
            {side.formation ?? "—"}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              confirmed ? "bg-win/15 text-win" : "bg-[oklch(0.85_0.16_90/15%)] text-[oklch(0.88_0.16_90)]",
            )}
          >
            {confirmed ? "Confirmado" : "Provável"}
          </span>
        </span>
      }
    >
      <div className="ls-pitch flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-2xl px-2 py-5">
        {rows.map((row, index) => (
          <div key={index} className="relative z-10 flex flex-1 items-center justify-around">
            {row.map((player) => (
              <PlayerDot key={`${player.name}-${player.shirtNumber ?? ""}`} player={player} tone={tone} />
            ))}
          </div>
        ))}
      </div>
      {side.coach ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Técnico <span className="font-semibold text-foreground">{side.coach}</span>
        </p>
      ) : null}
      <PlayerChips title="Reservas" players={side.substitutes} />
      <PlayerChips title="Não confirmados" players={side.unconfirmed} />
      <PlayerChips title="Artilheiros" players={side.topPlayers} />
      {side.missing.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Desfalques</p>
          <div className="flex flex-wrap gap-1.5">
            {side.missing.map((player) => (
              <span key={player.name} className="rounded-lg border border-loss/25 bg-loss/10 px-2 py-1 text-xs">
                {player.name}
                {player.reason ? <span className="text-muted-foreground"> · {player.reason}</span> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function PlayerDot({ player, tone }: { player: LineupPlayer; tone: "home" | "away" }) {
  return (
    <div className="flex w-16 flex-col items-center">
      <span
        className={cn(
          "grid size-8 place-items-center rounded-full text-xs font-bold shadow-lg ring-2 ring-white/70",
          tone === "home" ? "bg-home text-[oklch(0.2_0.05_155)]" : "bg-away text-white",
        )}
      >
        {player.shirtNumber ?? "•"}
      </span>
      <span className="mt-1 w-full truncate rounded bg-black/35 px-1 text-center text-[10px] font-medium text-white">
        {lastName(player.name)}
      </span>
    </div>
  );
}

function PlayerChips({ title, players }: { title: string; players: LineupPlayer[] }) {
  if (players.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {players.map((player) => (
          <span
            key={`${player.name}-${player.shirtNumber ?? ""}`}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/70 px-2 py-1 text-xs"
          >
            {player.shirtNumber != null ? (
              <span className="font-bold text-muted-foreground">{player.shirtNumber}</span>
            ) : null}
            {player.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function StandingsPanel({
  loading,
  error,
  season,
  tables,
  home,
  away,
}: {
  loading: boolean;
  error: unknown;
  season: string | null;
  tables: { overall: StandingGroup[]; home: StandingGroup[]; away: StandingGroup[] } | null;
  home: string;
  away: string;
}) {
  const [scope, setScope] = useState<"overall" | "home" | "away">("overall");
  if (loading) {
    return (
      <Panel title="Classificação">
        <PanelSkeleton />
      </Panel>
    );
  }
  if (error || !tables) {
    return (
      <Panel title="Classificação">
        <Muted>{messageFrom(error, "Classificação indisponível para esta competição.")}</Muted>
      </Panel>
    );
  }
  const groups = tables[scope];
  return (
    <Panel
      title={season ?? "Classificação"}
      action={
        <div className="flex rounded-xl border border-border bg-surface-2/70 p-1 text-xs">
          {(
            [
              ["overall", "Geral"],
              ["home", "Casa"],
              ["away", "Fora"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={cn(
                "rounded-lg px-2.5 py-1 font-semibold",
                scope === id ? "ls-brand text-white" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {groups.length === 0 ? <Muted>Sem tabela neste recorte.</Muted> : null}
      {groups.map((group) => (
        <div key={group.groupName || "geral"} className="ls-scroll mb-4 overflow-x-auto last:mb-0">
          {group.groupName ? <p className="mb-2 text-xs font-bold text-primary">{group.groupName}</p> : null}
          <table className="w-full min-w-[540px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pl-1 pr-2">#</th>
                <th>Time</th>
                <th className="text-center">J</th>
                <th className="text-center">V</th>
                <th className="text-center">E</th>
                <th className="text-center">D</th>
                <th className="text-center">GP</th>
                <th className="text-center">GC</th>
                <th className="text-center">SG</th>
                <th className="pr-1 text-center">Pts</th>
              </tr>
            </thead>
            <tbody>
              {group.standings.map((row) => {
                const name = row.teamName.toLowerCase();
                const involved = name === home.toLowerCase() || name === away.toLowerCase();
                return (
                  <tr
                    key={`${row.pos}-${row.teamName}`}
                    className={cn("border-t border-border", involved && "bg-primary/12")}
                  >
                    <td className="py-2 pl-1 pr-2">
                      <span
                        className={cn(
                          "grid size-6 place-items-center rounded-md text-[11px] font-bold",
                          involved ? "ls-brand text-white" : "bg-surface-2",
                        )}
                      >
                        {row.pos}
                      </span>
                    </td>
                    <td className="pr-2">
                      <span className="flex max-w-52 items-center gap-2">
                        <Crest imageId={row.teamImageId} name={row.teamName} className="size-5" />
                        <span className={cn("truncate", involved && "font-bold")}>{row.teamName}</span>
                      </span>
                    </td>
                    <td className="text-center tabular-nums">{row.played}</td>
                    <td className="text-center tabular-nums">{row.win}</td>
                    <td className="text-center tabular-nums">{row.draw}</td>
                    <td className="text-center tabular-nums">{row.loss}</td>
                    <td className="text-center tabular-nums">{row.goalsFor}</td>
                    <td className="text-center tabular-nums">{row.goalsAgainst}</td>
                    <td
                      className={cn(
                        "text-center tabular-nums",
                        row.goalDiff > 0 && "text-win",
                        row.goalDiff < 0 && "text-loss",
                      )}
                    >
                      {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                    </td>
                    <td className="pr-1 text-center text-sm font-bold tabular-nums">{row.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </Panel>
  );
}

function DetailMessage({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="ls-card p-6">
      <button
        type="button"
        onClick={onClose}
        className="mb-4 flex items-center gap-2 text-sm text-muted-foreground md:hidden"
      >
        <ArrowLeft className="size-4" />
        Voltar
      </button>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function shareMatch(match: MatchCard) {
  const url = window.location.href;
  const title = `${match.homeName} x ${match.awayName}`;
  if (navigator.share) {
    void navigator.share({ title, url }).catch(() => undefined);
    return;
  }
  void navigator.clipboard
    .writeText(url)
    .then(() => toast("Link copiado", { description: title }))
    .catch(() => toast("Não foi possível copiar o link"));
}

function retryLivescore(failureCount: number, error: unknown) {
  if (error instanceof LivescoreError && (error.status === 404 || error.status === 400)) return false;
  return failureCount < 1;
}

function messageFrom(error: unknown, fallback: string) {
  if (error instanceof LivescoreError && error.status === 404) return fallback;
  if (error instanceof LivescoreError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatStat(value: number, key: string) {
  if (key.startsWith("possession")) return `${value}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
