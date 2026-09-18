import { comparabilityKey, type ChartPoint, type ResolvedSet } from "./workout-evolution";

// ---------------------------------------------------------------------------
// Força estimada — Epley, e só onde a fórmula tem sentido.
//
// É uma ESTIMATIVA por exercício, nunca a medida da força de um músculo. A
// interface sempre apresenta como estimativa; aqui a única responsabilidade é
// não produzir número onde não há base.
// ---------------------------------------------------------------------------

/** Equipamentos sem carga externa quantificada: a conta não se aplica.
 * Assistido inverte o sinal (menos ajuda = mais força) e elástico não tem
 * resistência registrada em kg. */
const EQUIPMENT_WITHOUT_ESTIMATE = ["peso_corporal", "assistido", "elastico", "outro"];

/** Faixa aceita da fórmula. Acima de 10 repetições o erro cresce a ponto de o
 * número dizer mais sobre resistência do que sobre força. */
export const ESTIMATE_MIN_REPS = 1;
export const ESTIMATE_MAX_REPS = 10;

/** A série sustenta uma estimativa de força? */
export function isEstimableSet(set: ResolvedSet): boolean {
  if (!set.equipment || EQUIPMENT_WITHOUT_ESTIMATE.includes(set.equipment)) return false;
  if (!Number.isFinite(set.weight) || set.weight <= 0) return false;
  return set.reps >= ESTIMATE_MIN_REPS && set.reps <= ESTIMATE_MAX_REPS;
}

/** Epley: 1RM ≈ carga × (1 + reps/30). Com 1 repetição, a própria carga.
 * Devolve null quando a série não é elegível — nunca um zero disfarçado. */
export function estimatedStrength(set: ResolvedSet): number | null {
  if (!isEstimableSet(set)) return null;
  const raw = set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
  return Math.round(raw * 10) / 10;
}

export function estimatedStrengthSeries(sets: ResolvedSet[], key: string): ChartPoint[] {
  const best = new Map<string, ChartPoint>();
  for (const s of sets) {
    if (comparabilityKey(s.lineageId, s.equipment) !== key) continue;
    const value = estimatedStrength(s);
    if (value === null) continue;
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
