import type { LineupPlayer } from "@/lib/livescore/types";

export function formationRows(formation: string | null, starters: LineupPlayer[]) {
  const goalkeeper =
    starters.find((player) => /goal/i.test(player.position ?? "")) ?? starters[0];
  const outfield = starters.filter((player) => player !== goalkeeper);
  const counts = (formation ?? "")
    .split("-")
    .map((part) => Number(part))
    .filter((count) => Number.isFinite(count) && count > 0);

  const lines: LineupPlayer[][] = [];
  let cursor = 0;
  if (counts.length > 0 && goalkeeper) {
    for (const count of counts) {
      lines.push(outfield.slice(cursor, cursor + count));
      cursor += count;
    }
    if (cursor < outfield.length) lines.push(outfield.slice(cursor));
    return [...lines].reverse().concat([[goalkeeper]]);
  }

  return [starters];
}

export function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}
