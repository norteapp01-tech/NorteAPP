import type { MuscleGroup, PlannedExercise } from "../workout-store";
import { muscleParent } from "../workout-evolution";
import { PARTICIPATION } from "./config";

/** Quanto cada músculo (grupo pai) participa de um exercício: 1 para o principal,
 * 0,5 para cada secundário. Subgrupos somam no pai e o mesmo músculo nunca conta
 * duas vezes (ex.: principal "peito superior" e secundário "peito médio"). */
export function exerciseParticipation(
  exercise: Pick<PlannedExercise, "muscleGroup" | "secondaryMuscles">,
): Map<MuscleGroup, number> {
  const out = new Map<MuscleGroup, number>();
  if (!exercise.muscleGroup) return out;
  const primary = muscleParent[exercise.muscleGroup] ?? exercise.muscleGroup;
  out.set(primary, PARTICIPATION.primary);
  for (const sec of exercise.secondaryMuscles ?? []) {
    const parent = muscleParent[sec] ?? sec;
    if (!out.has(parent)) out.set(parent, PARTICIPATION.secondary);
  }
  return out;
}

export function primaryMuscle(exercise: Pick<PlannedExercise, "muscleGroup">): MuscleGroup | null {
  return exercise.muscleGroup ? (muscleParent[exercise.muscleGroup] ?? exercise.muscleGroup) : null;
}
