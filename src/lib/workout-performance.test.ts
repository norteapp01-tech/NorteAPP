import { describe, it, expect } from "vitest";
import { estimatedStrengthSeries } from "./workout-performance";
import { comparabilityKey, type ResolvedSet } from "./workout-evolution";
const row: ResolvedSet = {
  sessionId: "s1",
  date: "2026-09-01",
  planLabel: "A",
  exerciseId: "e1",
  lineageId: "e1",
  name: "Supino",
  muscleGroup: "peito",
  secondaryMuscles: [],
  equipment: "barra",
  weight: 60,
  reps: 10,
  setIndex: 0,
};
describe("strength chart", () => {
  it("estimates a session best and keeps equipment separate", () => {
    const points = estimatedStrengthSeries(
      [row, { ...row, weight: 50 }, { ...row, equipment: "halteres", weight: 100 }],
      comparabilityKey("e1", "barra"),
    );
    expect(points).toHaveLength(1);
    expect(points[0].value).toBe(80);
  });
  it("excludes unsupported equipment, missing load and high rep sets", () => {
    for (const patch of [
      { equipment: "assistido" as const },
      { equipment: null },
      { weight: 0 },
      { reps: 15 },
    ]) {
      const s = { ...row, ...patch };
      expect(estimatedStrengthSeries([s], comparabilityKey(s.lineageId, s.equipment))).toEqual([]);
    }
  });
  it("retains recorded single reps and orders sessions", () => {
    expect(
      estimatedStrengthSeries(
        [{ ...row, sessionId: "s2", date: "2026-09-02", reps: 1, weight: 85 }, row],
        comparabilityKey("e1", "barra"),
      ).map((p) => p.value),
    ).toEqual([80, 85]);
  });
});
