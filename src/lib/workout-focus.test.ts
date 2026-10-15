import { describe, expect, it } from "vitest";
import type { ResolvedSet } from "./workout-evolution";
import type { MuscleGroup } from "./workout-store";
import { BAND_END, BAND_START, focusPosition, focusSummary, muscleFocus } from "./workout-focus";

let n = 0;
const set = (muscle: MuscleGroup, secondary: MuscleGroup[] = [], extra: Partial<ResolvedSet> = {}): ResolvedSet => ({
  sessionId: "s" + (n % 4),
  date: "2026-10-01",
  planLabel: "A",
  exerciseId: "e" + n,
  lineageId: "l" + n++,
  name: "x",
  muscleGroup: muscle,
  secondaryMuscles: secondary,
  equipment: "barra",
  weight: 10,
  reps: 10,
  setIndex: 0,
  ...extra,
});
const many = (k: number, m: MuscleGroup, sec: MuscleGroup[] = []) => Array.from({ length: k }, () => set(m, sec));
const noProgress = new Map();

describe("foco por músculo", () => {
  it("pouco foco = treinado abaixo da faixa (o mais distante primeiro), separado de sem registro", () => {
    const rows = muscleFocus([...many(2, "peito"), ...many(6, "biceps"), ...many(12, "costas")], 7, noProgress);
    const s = focusSummary(rows);
    expect(s.lowFocus.map((r) => r.group)).toEqual(["peito"]);
    expect(s.mostFocus.map((r) => r.group)).toEqual(["costas", "biceps"]);
    expect(s.untrained.map((r) => r.group)).toContain("gluteos");
  });

  it("compara cada músculo com a própria faixa: 12 séries de costas e 8 de panturrilha estão ambas na faixa", () => {
    const rows = muscleFocus([...many(12, "costas"), ...many(8, "panturrilhas")], 7, noProgress);
    const costas = rows.find((r) => r.group === "costas")!;
    const pant = rows.find((r) => r.group === "panturrilhas")!;
    expect(costas.status).toBe("na_faixa");
    expect(pant.status).toBe("na_faixa");
  });

  it("a faixa fica na mesma posição da escala para todos os músculos", () => {
    expect(focusPosition(10, { min: 10, max: 20 })).toBeCloseTo(BAND_START);
    expect(focusPosition(6, { min: 6, max: 12 })).toBeCloseTo(BAND_START);
    expect(focusPosition(20, { min: 10, max: 20 })).toBeCloseTo(BAND_END);
    expect(focusPosition(12, { min: 6, max: 12 })).toBeCloseTo(BAND_END);
    expect(focusPosition(999, { min: 6, max: 12 })).toBe(1);
  });

  it("usa séries por semana: 30 dias com 20 séries de peito são ~4,7/semana (abaixo)", () => {
    const peito = muscleFocus(many(20, "peito"), 30, noProgress).find((r) => r.group === "peito")!;
    expect(peito.weekly).toBeCloseTo(4.7, 1);
    expect(peito.status).toBe("abaixo");
  });

  it("músculo secundário conta meia série e subgrupos somam no grupo pai", () => {
    const rows = muscleFocus([...many(4, "peito_superior" as MuscleGroup, ["triceps_longa" as MuscleGroup]), ...many(2, "triceps")], 7, noProgress);
    const triceps = rows.find((r) => r.group === "triceps")!;
    expect(triceps.directSets).toBe(2);
    expect(triceps.secondarySets).toBe(4);
    expect(triceps.weekly).toBe(4); // 2 + 4 × 0,5
  });

  it("drop set não infla o volume", () => {
    const rows = muscleFocus([set("biceps"), set("biceps", [], { isDrop: true })], 7, noProgress);
    expect(rows.find((r) => r.group === "biceps")!.directSets).toBe(1);
  });

  it("evolução e variação contra o período anterior", () => {
    const progress = new Map<MuscleGroup, { state: "melhora" | "estavel" }>([["costas", { state: "melhora" }], ["ombros", { state: "estavel" }]]);
    const rows = muscleFocus([...many(14, "costas"), ...many(9, "ombros")], 7, progress, { sets: many(10, "costas"), days: 7 });
    const costas = rows.find((r) => r.group === "costas")!;
    expect(costas.trend).toBe("evoluindo");
    expect(costas.weeklyDelta).toBe(4);
    const s = focusSummary(rows);
    expect(s.evolving.map((r) => r.group)).toContain("costas");
    expect(s.stalled.map((r) => r.group)).toContain("ombros");
    expect(s.untrained.map((r) => r.group)).toContain("panturrilhas");
    expect(s.lowFocus).toEqual([]);
  });
});
