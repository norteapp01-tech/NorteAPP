import { describe, expect, it, vi } from "vitest";
vi.mock("./supabase/client", () => ({
  supabase: {},
  ensureSession: async () => "test",
  useSupabaseUserId: () => "test",
}));
import { muscleProgress, repetitionProfile } from "./workout-map";
import type { ResolvedSet } from "./workout-evolution";
const row = (i: number, overrides: Partial<ResolvedSet> = {}): ResolvedSet => ({
  sessionId: `s${i}`,
  date: `2026-09-${10 + i}`,
  planLabel: "A",
  exerciseId: "e",
  lineageId: "e",
  name: "Supino",
  muscleGroup: "peito",
  secondaryMuscles: [],
  equipment: "barra",
  weight: 30 + i,
  reps: 8,
  setIndex: 0,
  ...overrides,
});
describe("muscle progress", () => {
  it("requires three comparable sessions", () => {
    expect(muscleProgress([row(0), row(1)]).get("peito")?.state).toBe("insuficiente");
  });
  it("detects progress at fixed reps", () => {
    expect(muscleProgress([row(0), row(1), row(2)]).get("peito")?.state).toBe("melhora");
  });
  it("does not equate repetitions lost with progress", () => {
    expect(
      muscleProgress([row(0, { reps: 12 }), row(1, { reps: 10 }), row(2, { reps: 8 })]).get("peito")
        ?.state,
    ).toBe("insuficiente");
  });
  it("does not mix equipment", () => {
    expect(
      muscleProgress([row(0), row(1), row(2, { equipment: "halteres" })]).get("peito")?.comparable,
    ).toBe(0);
  });
  it("excludes unsupported load comparisons", () => {
    expect(
      muscleProgress([0, 1, 2].map((i) => row(i, { equipment: "assistido" }))).get("peito")?.state,
    ).toBe("insuficiente");
  });
  it("reports mixed exercise trends without averaging their loads", () => {
    const sets = [0, 1, 2].flatMap((i) => [row(i), row(i, { lineageId: "b", weight: 40 - i })]);
    expect(muscleProgress(sets).get("peito")?.state).toBe("misto");
  });
});
describe("repetition profile", () => {
  it("filters muscles and places boundary repetitions once", () => {
    const sets = [1, 5, 6, 12, 13, 20].map((reps, i) => row(i, { reps }));
    sets.push(row(7, { reps: 8, muscleGroup: "costas" }));
    expect(repetitionProfile(sets, "peito").map((b) => b.count)).toEqual([2, 2, 2]);
  });
  it("handles missing data without fabricated percentages", () => {
    expect(repetitionProfile([], null).map((b) => b.percent)).toEqual([0, 0, 0]);
  });
});
