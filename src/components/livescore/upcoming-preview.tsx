import { StatBars } from "@/components/livescore/stat-bars";
import type { ChanceGroup, FactGroup, UpcomingPreview } from "@/lib/livescore/types";

const legLabel = {
  single: "Jogo único",
  first: "Ida",
  second: "Volta",
} as const;

export function legText(leg: UpcomingPreview["matchLeg"]) {
  return leg ? legLabel[leg] : null;
}

export function UpcomingPanels({ preview }: { preview: UpcomingPreview }) {
  const notes = competitionNotes(preview);
  return (
    <div className="space-y-4">
      {notes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {notes.map((note) => (
            <span key={note} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {note}
            </span>
          ))}
        </div>
      ) : null}
      {preview.probability ? <ProbabilityCard probability={preview.probability} /> : null}
      {preview.books.length > 1 ? <BooksCard books={preview.books} /> : null}
      {preview.standings ? <StandingsCard standings={preview.standings} /> : null}
      {preview.correctScores.length > 0 ? <ScoresCard scores={preview.correctScores} /> : null}
    </div>
  );
}

export function UpcomingProbability({ groups }: { groups: ChanceGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-muted-foreground">Projeção do jogo, calculada antes do apito.</p>
      {groups.map((group) => (
        <section key={group.title} className="ls-card p-4 md:p-5">
          <h3 className="mb-3 text-sm font-bold">{group.title}</h3>
          <div className="space-y-3">
            {group.lines.map((line) => (
              <div key={line.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="font-bold tabular-nums">{formatPercent(line.value)}</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, line.value))}%` }} />
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function UpcomingStats({ preview }: { preview: UpcomingPreview }) {
  const groups = preview.statGroups ?? [];
  const facts = preview.facts ?? [];
  if (groups.length === 0 && facts.length === 0 && preview.teamStats.length === 0 && preview.extraStats.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Estatísticas ainda não disponíveis.</p>;
  }
  if (groups.length > 0 || facts.length > 0) {
    return (
      <div className="space-y-6">
        {facts.length > 0 ? <FactList groups={facts} /> : null}
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
            <StatBars stats={group.stats} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {preview.teamStats.length > 0 ? (
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Médias dos últimos jogos
          </p>
          <StatBars stats={preview.teamStats} />
        </div>
      ) : null}
      {preview.extraStats.length > 0 ? (
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Estatísticas extras
          </p>
          <StatBars stats={preview.extraStats} />
        </div>
      ) : null}
    </div>
  );
}

function FactList({ groups }: { groups: FactGroup[] }) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.lines.map((line) => (
              <div key={line.key} className="rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{line.label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums">{formatFact(line.key, line.value)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProbabilityCard({ probability }: { probability: NonNullable<UpcomingPreview["probability"]> }) {
  const complete = (probability.groups?.length ?? 0) > 0;
  const extras = complete
    ? []
    : [
        probability.btts != null ? `Ambas marcam ${formatPercent(probability.btts)}` : null,
        probability.over25 != null ? `Over 2.5 ${formatPercent(probability.over25)}` : null,
        probability.under25 != null ? `Under 2.5 ${formatPercent(probability.under25)}` : null,
      ].filter((item): item is string => item != null);
  return (
    <section className="ls-card p-4 md:p-5">
      <h3 className="mb-4 text-sm font-bold">Probabilidades</h3>
      <div className="grid grid-cols-3 gap-2">
        <Chance label="Casa" value={probability.home} tone="home" />
        <Chance label="Empate" value={probability.draw} tone="draw" />
        <Chance label="Fora" value={probability.away} tone="away" />
      </div>
      {extras.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {extras.map((item) => (
            <span key={item} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Chance({ label, value, tone }: { label: string; value: number; tone: "home" | "draw" | "away" }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 px-2 py-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={
          tone === "home" ? "mt-1 text-xl font-bold tabular-nums text-home" : tone === "away" ? "mt-1 text-xl font-bold tabular-nums text-away" : "mt-1 text-xl font-bold tabular-nums"
        }
      >
        {formatPercent(value)}
      </p>
    </div>
  );
}

function BooksCard({ books }: { books: UpcomingPreview["books"] }) {
  return (
    <section className="ls-card p-4 md:p-5">
      <h3 className="mb-3 text-sm font-bold">Odds por casa</h3>
      <div className="space-y-1.5">
        {books.map((book) => (
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

function StandingsCard({ standings }: { standings: NonNullable<UpcomingPreview["standings"]> }) {
  return (
    <section className="ls-card p-4 md:p-5">
      <h3 className="mb-3 text-sm font-bold">Posição na tabela</h3>
      <div className="grid grid-cols-2 gap-2">
        <Place label="Casa" position={standings.homePosition} played={standings.homePlayed} />
        <Place label="Fora" position={standings.awayPosition} played={standings.awayPlayed} />
      </div>
    </section>
  );
}

function Place({ label, position, played }: { label: string; position: number | null; played: number | null }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{position != null ? `${position}º` : "–"}</p>
      {played != null ? <p className="text-[11px] text-muted-foreground">{played} jogos</p> : null}
    </div>
  );
}

function ScoresCard({ scores }: { scores: UpcomingPreview["correctScores"] }) {
  const top = scores[0]?.probability ?? 1;
  return (
    <section className="ls-card p-4 md:p-5">
      <h3 className="mb-3 text-sm font-bold">Placares mais prováveis</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {scores.map((item, index) => (
          <div
            key={item.score}
            className={
              index === 0
                ? "rounded-xl border border-primary/40 bg-primary/15 px-2 py-2.5 text-center"
                : "rounded-xl border border-border bg-surface-2/50 px-2 py-2.5 text-center"
            }
          >
            <p className="text-base font-bold tabular-nums">{item.score}</p>
            <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">{formatPercent(item.probability)}</p>
            <span className="mx-auto mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full bg-primary" style={{ width: `${Math.min(100, (item.probability / top) * 100)}%` }} />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function competitionNotes(preview: UpcomingPreview) {
  const competition = preview.competition;
  const notes: string[] = [];
  if (competition?.isFriendly) notes.push("Amistoso");
  else if (competition?.isCup || competition?.type === "cup") notes.push("Copa");
  else if (competition?.type === "league") notes.push("Liga");
  else if (competition?.type) notes.push(competition.type);
  if (competition?.seasonProgress != null) {
    const progress = competition.seasonProgress <= 1 ? competition.seasonProgress * 100 : competition.seasonProgress;
    notes.push(`Temporada ${Math.round(progress)}%`);
  }
  if (competition?.predictability) {
    const labels: Record<string, string> = { high: "Previsível", medium: "Equilíbrio médio", low: "Imprevisível" };
    notes.push(labels[competition.predictability] ?? competition.predictability);
  }
  if (preview.season) notes.push(`Temporada ${preview.season}`);
  if (preview.venue) notes.push(preview.venue);
  return notes;
}

function formatFact(key: string, value: number) {
  if (key.includes("percentage") || key.endsWith("_pct")) return formatPercent(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}
