import type { MuscleGroup } from "./workout-store";
import {
  availableReferences,
  exerciseChartSeries,
  type ResolvedSet,
  type ChartMode,
} from "./workout-evolution";

export type ProgressState = "melhora" | "estavel" | "queda" | "misto" | "insuficiente";
export const progressLabel: Record<ProgressState, string> = {
  melhora: "Em progressão",
  estavel: "Referência mantida",
  queda: "Referência menor",
  misto: "Resultados mistos",
  insuficiente: "Dados insuficientes",
};

/** Use the reference with most comparable sessions, not whichever improved most.
 * Three sessions minimum; unknown, assisted and bodyweight loads are not kg comparisons.
 * No percentage averaged across unrelated equipment or muscle subdivisions. */
export function muscleProgress(
  sets: ResolvedSet[],
): Map<MuscleGroup, { state: ProgressState; comparable: number; total: number }> {
  const exercises = new Map<string, ResolvedSet[]>();
  for (const s of sets) {
    if (!s.muscleGroup) continue;
    const key = `${s.muscleGroup}|${s.lineageId}|${s.equipment}`;
    exercises.set(key, [...(exercises.get(key) ?? []), s]);
  }
  const results = new Map<MuscleGroup, ProgressState[]>();
  for (const rows of exercises.values()) {
    const head = rows[0];
    let state: ProgressState = "insuficiente";
    if (head.equipment && !["assistido", "peso_corporal", "elastico"].includes(head.equipment)) {
      const candidates = (["carga", "repeticoes"] as ChartMode[])
        .flatMap((mode) =>
          availableReferences(rows, head.lineageId, mode).map((ref) => ({ mode, ...ref })),
        )
        .filter((ref) => ref.sessions >= 3 && ref.value > 0)
        .sort(
          (a, b) => b.sessions - a.sessions || a.mode.localeCompare(b.mode) || a.value - b.value,
        );
      const ref = candidates[0];
      if (ref) {
        const points = exerciseChartSeries(rows, head.lineageId, ref.mode, ref.value);
        const delta = points.at(-1)!.value - points[0].value;
        state = delta > 0 ? "melhora" : delta < 0 ? "queda" : "estavel";
      }
    }
    const group = head.muscleGroup!;
    results.set(group, [...(results.get(group) ?? []), state]);
  }
  return new Map(
    [...results].map(([group, states]) => {
      const comparable = states.filter((s) => s !== "insuficiente");
      const unique = new Set(comparable);
      return [
        group,
        {
          state: unique.size > 1 ? "misto" : (comparable[0] ?? "insuficiente"),
          comparable: comparable.length,
          total: states.length,
        },
      ];
    }),
  );
}

export function repetitionProfile(sets: ResolvedSet[], muscle: MuscleGroup | null) {
  const valid = sets.filter(
    (s) => (!muscle || s.muscleGroup === muscle) && Number.isFinite(s.reps) && s.reps > 0,
  );
  return [
    { label: "1–5 repetições", min: 1, max: 5 },
    { label: "6–12 repetições", min: 6, max: 12 },
    { label: "13+ repetições", min: 13, max: Infinity },
  ].map((bin) => {
    const rows = valid.filter((s) => s.reps >= bin.min && s.reps <= bin.max);
    const exercises = new Map<string, { id: string; name: string; count: number }>();
    rows.forEach((s) => {
      const e = exercises.get(s.lineageId) ?? { id: s.lineageId, name: s.name, count: 0 };
      e.count++;
      exercises.set(s.lineageId, e);
    });
    return {
      ...bin,
      count: rows.length,
      percent: valid.length ? Math.round((rows.length / valid.length) * 100) : 0,
      exercises: [...exercises.values()],
    };
  });
}
