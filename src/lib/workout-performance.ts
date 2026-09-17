import { comparabilityKey, type ChartPoint, type ResolvedSet } from "./workout-evolution";

/** Epley estimate, restricted to recorded external-load sets of 1–10 reps.
 * This is a per-exercise estimate, never a measurement of an entire muscle. */
export function estimatedStrengthSeries(sets: ResolvedSet[], key: string): ChartPoint[] {
  const best = new Map<string, ChartPoint>();
  for (const s of sets) {
    if (
      comparabilityKey(s.lineageId, s.equipment) !== key ||
      !s.equipment ||
      ["peso_corporal", "assistido", "elastico", "outro"].includes(s.equipment) ||
      !Number.isFinite(s.weight) ||
      s.weight <= 0 ||
      s.reps < 1 ||
      s.reps > 10
    )
      continue;
    const value = Math.round((s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30)) * 10) / 10;
    if (!best.has(s.sessionId) || best.get(s.sessionId)!.value < value)
      best.set(s.sessionId, {
        sessionId: s.sessionId,
        date: s.date,
        value,
        planLabel: s.planLabel,
      });
  }
  return [...best.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId),
  );
}
