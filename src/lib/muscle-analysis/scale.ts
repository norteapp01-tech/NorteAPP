import { COMPLETION_STATUS_BANDS, EVOLUTION_LABELS, EVOLUTION_SCALE } from "./config";
import type { CompletionStatus } from "./types";

/** Uma casa decimal, sem "9,95 → 10" acidental: só é 10 quem cumpriu tudo. */
export function completionScore(fraction: number): number {
  const clamped = Math.max(0, Math.min(1, fraction));
  if (clamped >= 1) return 10;
  return Math.min(9.9, Math.floor(clamped * 100) / 10);
}

export function completionStatus(score: number, eligibleForProgression: boolean): CompletionStatus {
  if (score >= COMPLETION_STATUS_BANDS.meta.min)
    return eligibleForProgression ? "progredir" : "meta";
  if (score >= COMPLETION_STATUS_BANDS.quase.min) return "quase";
  if (score >= COMPLETION_STATUS_BANDS.proximo.min) return "proximo";
  if (score >= COMPLETION_STATUS_BANDS.abaixo.min) return "abaixo";
  return "atencao";
}

export const COMPLETION_STATUS_TEXT: Record<CompletionStatus, string> = {
  atencao: "Atenção",
  abaixo: "Abaixo do planejado",
  proximo: "Próximo da meta",
  quase: "Quase completo",
  meta: "Meta cumprida",
  progredir: "Pode progredir",
};

/** Evolução % → nota 0–10 por partes (EVOLUTION_SCALE). */
export function evolutionScore(percentage: number): number {
  const pts = EVOLUTION_SCALE;
  if (percentage <= pts[0][0]) return pts[0][1];
  if (percentage >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (percentage >= x0 && percentage <= x1) {
      const v = y0 + ((percentage - x0) / (x1 - x0)) * (y1 - y0);
      return Math.round(v * 10) / 10;
    }
  }
  return 5;
}

export function evolutionLabel(score: number): string {
  return EVOLUTION_LABELS.find((b) => score >= b.min)?.label ?? EVOLUTION_LABELS.at(-1)!.label;
}
