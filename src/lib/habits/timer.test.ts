import { describe, expect, it } from "vitest";
import {
  DEFAULT_POMODORO,
  elapsedSeconds,
  formatClock,
  measuredSeconds,
  pomodoroPhase,
  viewOf,
} from "./timer";
import type { HabitTimer } from "./types";

const T0 = Date.parse("2026-11-12T10:00:00Z");
const timer = (over: Partial<HabitTimer> = {}): HabitTimer => ({
  id: "t",
  habitId: "h",
  mode: "stopwatch",
  state: "running",
  startedAt: "2026-11-12T10:00:00Z",
  accumulatedSeconds: 0,
  revision: 0,
  ...over,
});

describe("timer por timestamps", () => {
  it("o decorrido sai da diferença de horários — recarregar a página não perde nada", () => {
    expect(elapsedSeconds(timer(), T0 + 125_000)).toBe(125);
  });
  it("pausado congela; retomar soma ao acumulado", () => {
    expect(elapsedSeconds(timer({ state: "paused", accumulatedSeconds: 90 }), T0 + 999_000)).toBe(
      90,
    );
    // pausou com 90s, retomou às 10:10:00 → 30s depois = 120
    const resumed = timer({ accumulatedSeconds: 90, startedAt: "2026-11-12T10:10:00Z" });
    expect(elapsedSeconds(resumed, Date.parse("2026-11-12T10:10:30Z"))).toBe(120);
  });
  it("relógio que volta para trás não apaga o que já passou", () => {
    expect(elapsedSeconds(timer({ accumulatedSeconds: 40 }), T0 - 60_000)).toBe(40);
  });
  it("contagem regressiva passa do zero sem travar", () => {
    const t = timer({ mode: "countdown", targetSeconds: 60 });
    expect(viewOf(t, T0 + 30_000)).toMatchObject({ remaining: 30, done: false });
    expect(viewOf(t, T0 + 75_000)).toMatchObject({ remaining: -15, done: true });
  });
  it("Pomodoro: foco, pausa curta, … pausa longa no fim; só o foco conta", () => {
    const cfg = { focus: 10, short: 2, long: 4, cycles: 2 };
    expect(pomodoroPhase(cfg, 3)).toMatchObject({ phase: "focus", cycle: 1, phaseRemaining: 7 });
    expect(pomodoroPhase(cfg, 11)).toMatchObject({ phase: "short", phaseRemaining: 1 });
    expect(pomodoroPhase(cfg, 14)).toMatchObject({ phase: "focus", cycle: 2, phaseElapsed: 2 });
    expect(pomodoroPhase(cfg, 22)).toMatchObject({
      phase: "long",
      cycle: 2,
      finished: false,
      focusSeconds: 20,
    });
    expect(pomodoroPhase(cfg, 99)).toMatchObject({ finished: true, focusSeconds: 20 });
    const t = timer({ mode: "pomodoro", pomodoro: cfg });
    expect(measuredSeconds(t, T0 + 11_000)).toBe(10); // 10s de foco + 1s de pausa
  });
  it("padrão do Pomodoro é 25/5/15 em 4 ciclos", () => {
    expect(DEFAULT_POMODORO).toEqual({ focus: 1500, short: 300, long: 900, cycles: 4 });
  });
  it("formata o relógio", () => {
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-15)).toBe("00:15");
  });
});
