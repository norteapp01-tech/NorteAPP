import { describe, expect, it } from "vitest";
import { mirrorHabits } from "./mirror";
import type { Habit, HabitLog } from "./types";

const habit = (id: string, over: Partial<Habit> = {}): Habit => ({
  id,
  name: id,
  intent: "build",
  measure: "binary",
  startDate: "2026-11-01",
  position: 0,
  createdAt: "2026-11-01T00:00:00Z",
  versions: [
    {
      id: `v${id}`,
      habitId: id,
      effectiveFrom: "2026-11-01",
      goalValue: 1,
      goalPeriod: "day",
      schedule: { type: "daily" },
      flexible: false,
      timesOfDay: [],
      checklist: [],
    },
  ],
  ...over,
});
const log = (habitId: string, date: string, over: Partial<HabitLog> = {}): HabitLog => ({
  id: `${habitId}${date}`,
  habitId,
  localDate: date,
  occurredAt: `${date}T12:00:00Z`,
  status: "recorded",
  value: 1,
  note: "",
  checks: [],
  source: "manual",
  ...over,
});
const ctx = { today: "2026-11-10", weekStart: 1 as const, pauses: [] };

describe("espelho das rotinas", () => {
  it("poucos dados: sem padrão e sem destaque", () => {
    const m = mirrorHabits(ctx, [habit("a")], [log("a", "2026-11-01")], "2026-11-01", "2026-11-02");
    expect(m.sufficient).toBe(false);
    expect(m.steady).toEqual([]);
  });

  it("consistência separa cumprido, sem registro, pausa e pulado", () => {
    const logs = ["01", "02", "03", "04", "05"].map((d) => log("a", `2026-11-${d}`));
    logs.push(log("a", "2026-11-06", { status: "skipped", value: 0 }));
    const pauses = [
      {
        id: "p",
        scope: "habit" as const,
        habitId: "a",
        startDate: "2026-11-07",
        endDate: "2026-11-08",
      },
    ];
    const m = mirrorHabits({ ...ctx, pauses }, [habit("a")], logs, "2026-11-01", "2026-11-10");
    const r = m.rows[0];
    expect(r.completed).toBe(5);
    expect(r.skipped).toBe(1);
    expect(r.paused).toBe(2);
    expect(r.none).toBe(1); // dia 9 sem registro; o dia 10 é hoje e ainda está em andamento
    expect(m.pausedDays).toBe(2);
    expect(m.consistency).toBeCloseTo(5 / 6, 1);
    expect(m.sufficient).toBe(true);
  });

  it("agrupa por área e destaca regularidade só com base mínima", () => {
    const habits = [
      habit("a", { area: "Saúde" }),
      habit("b", { area: "Saúde" }),
      habit("c", { area: "Mente" }),
    ];
    const days = ["01", "02", "03", "04", "05"];
    const logs = [
      ...days.map((d) => log("a", `2026-11-${d}`)), // a: 5/5
      ...days.slice(0, 1).map((d) => log("b", `2026-11-${d}`)), // b: 1/5
      ...days.slice(0, 5).map((d) => log("c", `2026-11-${d}`)),
    ];
    const m = mirrorHabits(ctx, habits, logs, "2026-11-01", "2026-11-05");
    const saude = m.byArea.find((x) => x.area === "Saúde")!;
    expect(saude).toMatchObject({ habits: 2, judged: 10, completed: 6 });
    expect(m.steady[0].habit.id).toMatch(/a|c/);
    expect(m.needsAttention.map((r) => r.habit.id)).toEqual(["b"]);
  });

  it("rotina que começou no meio do período só conta a partir do início; arquivada antes não entra", () => {
    const late = habit("late", { startDate: "2026-11-08" });
    const old = habit("old", { archivedAt: "2026-10-20T00:00:00Z" });
    const m = mirrorHabits(ctx, [late, old], [], "2026-11-01", "2026-11-10");
    expect(m.rows.map((r) => r.habit.id)).toEqual(["late"]);
    expect(m.rows[0].summary.from).toBe("2026-11-08");
  });

  it("só entra a sensação que foi respondida", () => {
    const logs = [log("a", "2026-11-02", { feeling: "pesado" }), log("a", "2026-11-03")];
    expect(mirrorHabits(ctx, [habit("a")], logs, "2026-11-01", "2026-11-05").feelings).toEqual({
      leve: 0,
      neutro: 0,
      pesado: 1,
      answered: 1,
    });
  });
});
