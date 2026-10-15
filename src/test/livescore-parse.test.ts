import { describe, expect, it } from "vitest";

import {
  buildMomentum,
  eventKind,
  formatKickoff,
  minuteLabel,
  momentumFromEvents,
  parseEvent,
  statusLabel,
  validateLivescoreSearch,
} from "@/lib/livescore/parse";

describe("livescore parse", () => {
  it("traduz a fase do jogo", () => {
    expect(statusLabel("HT_1ST", "live")).toBe("1º tempo");
    expect(statusLabel("HT_2ND", "live")).toBe("2º tempo");
    expect(statusLabel("HT", "live")).toBe("Intervalo");
    expect(statusLabel("PAUSED", "live")).toBe("Parado");
    expect(statusLabel("FT", "ended")).toBe("Encerrado");
    expect(minuteLabel({ status: "HT_2ND", elapsed: 84, phase: "live", kickoff: null })).toBe("84'");
    expect(minuteLabel({ status: "HT", elapsed: 45, phase: "live", kickoff: null })).toBe("INT");
    expect(minuteLabel({ status: "FT", elapsed: null, phase: "ended", kickoff: null })).toBe("FT");
  });

  it("lê o lance e monta o fluxo quando a série vem vazia", () => {
    const text = "18' - 2nd Goal - Atalanta";
    const parsed = parseEvent(text);
    expect(parsed?.minute).toBe(18);
    expect(parsed?.kind).toBe("goal");
    expect(eventKind("Shot On Target")).toBe("shot_on");
    expect(parsed?.team).toBe("Atalanta");

    const points = momentumFromEvents(
      [
        { text: "11' - 1st Corner - Pafos FC" },
        { text: "18' - 2nd Goal - Atalanta" },
      ],
      "Atalanta",
      "Pafos FC",
    );
    expect(points.find((point) => point.minute === 18)?.value).toBe(4);
    expect(points.find((point) => point.minute === 11)?.value).toBe(-1.5);
    expect(
      buildMomentum(
        [{ text: "1' - 1st Goal - Casa" }],
        { goals: { home: [], away: [] } },
        "Casa",
        "Fora",
      ).some((point) => point.value !== 0),
    ).toBe(true);
  });

  it("não inventa horário quando o kickoff é meia-noite UTC", () => {
    expect(formatKickoff("2026-10-15T00:00:00.000Z").time).toBeNull();
    expect(formatKickoff("2026-10-15T00:00:00.000Z").label).toContain("15");
    expect(formatKickoff("2026-10-15T19:00:00+00:00").time).toBe("16:00");
  });

  it("abre o dia de hoje no filtro ao vivo", () => {
    const search = validateLivescoreSearch({});
    expect(search.filtro).toBe("live");
    expect(search.aba).toBe("todos");
    expect(search.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
