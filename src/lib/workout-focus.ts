import type { MuscleGroup } from "./workout-store";
import { muscleGroupLabel, muscleParent, type ResolvedSet } from "./workout-evolution";
import type { ProgressState } from "./workout-map";

// ---------------------------------------------------------------------------
// Foco por músculo.
//
// Contar séries cruas não compara músculos: costas precisa de muito mais
// séries que panturrilha. Aqui cada músculo é comparado com a PRÓPRIA faixa de
// referência (séries semanais), então "abaixo / na faixa / acima" significa a
// mesma coisa para todos — é isso que mostra onde está o foco de verdade.
//
// Faixas gerais para hipertrofia (aprox. do volume mínimo eficaz ao máximo
// adaptativo usual na literatura de volume de treino). Servem para COMPARAR o
// foco entre músculos, não são prescrição individual.
// ---------------------------------------------------------------------------

export type FocusRange = { min: number; max: number };

export const FOCUS_RANGES: Partial<Record<MuscleGroup, FocusRange>> = {
  peito: { min: 10, max: 20 },
  costas: { min: 10, max: 20 },
  ombros: { min: 8, max: 16 },
  quadriceps: { min: 8, max: 18 },
  posteriores: { min: 6, max: 14 },
  gluteos: { min: 6, max: 14 },
  biceps: { min: 6, max: 14 },
  triceps: { min: 6, max: 14 },
  panturrilhas: { min: 6, max: 12 },
  abdomen: { min: 4, max: 12 },
  antebraco: { min: 2, max: 8 },
};

/** Série em que o músculo é secundário vale meia série para ele. */
export const SECONDARY_WEIGHT = 0.5;

export type FocusStatus = "sem_registro" | "abaixo" | "na_faixa" | "acima";
export type FocusTrend = "evoluindo" | "estagnado" | "caindo" | "misto" | "sem_dados";

export type MuscleFocus = {
  group: MuscleGroup;
  label: string;
  range: FocusRange;
  /** Séries efetivas por semana (diretas + secundárias × 0,5). */
  weekly: number;
  directSets: number;
  secondarySets: number;
  status: FocusStatus;
  /** 0..1 na escala comum: a faixa sempre ocupa a mesma posição (BAND_START..BAND_END). */
  position: number;
  trend: FocusTrend;
  /** Variação das séries semanais contra o período anterior de mesma duração. */
  weeklyDelta?: number;
};

export const BAND_START = 0.4;
export const BAND_END = 0.75;

/** Escala por partes: 0 → 0, min → 40%, max → 75%, 1,6× max → 100%. Assim a
 * faixa fica no mesmo lugar em todas as linhas e os músculos se comparam. */
export function focusPosition(weekly: number, range: FocusRange): number {
  if (weekly <= 0) return 0;
  if (weekly <= range.min) return (weekly / range.min) * BAND_START;
  if (weekly <= range.max)
    return BAND_START + ((weekly - range.min) / (range.max - range.min)) * (BAND_END - BAND_START);
  const top = range.max * 1.6;
  return Math.min(1, BAND_END + ((weekly - range.max) / (top - range.max)) * (1 - BAND_END));
}

const trendOf: Record<ProgressState, FocusTrend> = {
  melhora: "evoluindo",
  estavel: "estagnado",
  queda: "caindo",
  misto: "misto",
  insuficiente: "sem_dados",
};

function weeklySets(sets: ResolvedSet[], days: number): Map<MuscleGroup, { direct: number; secondary: number }> {
  const out = new Map<MuscleGroup, { direct: number; secondary: number }>();
  const add = (g: MuscleGroup, key: "direct" | "secondary") => {
    const parent = muscleParent[g] ?? g;
    const row = out.get(parent) ?? { direct: 0, secondary: 0 };
    row[key] += 1;
    out.set(parent, row);
  };
  for (const s of sets) {
    if (s.isDrop || !s.muscleGroup) continue;
    add(s.muscleGroup, "direct");
    const parentPrimary = muscleParent[s.muscleGroup] ?? s.muscleGroup;
    const seen = new Set<MuscleGroup>();
    for (const sec of s.secondaryMuscles) {
      const p = muscleParent[sec] ?? sec;
      if (p === parentPrimary || seen.has(p)) continue; // não conta duas vezes o mesmo músculo
      seen.add(p);
      add(sec, "secondary");
    }
  }
  return out;
}

export function muscleFocus(
  sets: ResolvedSet[],
  days: number,
  progress: Map<MuscleGroup, { state: ProgressState }>,
  previous?: { sets: ResolvedSet[]; days: number },
): MuscleFocus[] {
  const weeks = Math.max(1, days / 7);
  const now = weeklySets(sets, days);
  const before = previous ? weeklySets(previous.sets, previous.days) : undefined;
  const prevWeeks = previous ? Math.max(1, previous.days / 7) : 1;
  const effective = (row?: { direct: number; secondary: number }) =>
    row ? row.direct + row.secondary * SECONDARY_WEIGHT : 0;

  return (Object.keys(FOCUS_RANGES) as MuscleGroup[])
    .map((group) => {
      const range = FOCUS_RANGES[group]!;
      const row = now.get(group);
      const weekly = Math.round((effective(row) / weeks) * 10) / 10;
      const status: FocusStatus = !row
        ? "sem_registro"
        : weekly < range.min
          ? "abaixo"
          : weekly > range.max
            ? "acima"
            : "na_faixa";
      const prevWeekly = before ? effective(before.get(group)) / prevWeeks : undefined;
      return {
        group,
        label: muscleGroupLabel[group],
        range,
        weekly,
        directSets: row?.direct ?? 0,
        secondarySets: row?.secondary ?? 0,
        status,
        position: focusPosition(weekly, range),
        trend: trendOf[progress.get(group)?.state ?? "insuficiente"],
        weeklyDelta:
          prevWeekly !== undefined && (prevWeekly > 0 || weekly > 0)
            ? Math.round((weekly - prevWeekly) * 10) / 10
            : undefined,
      };
    })
    .sort((a, b) => b.position - a.position || a.label.localeCompare(b.label));
}

export type FocusSummary = {
  mostFocus: MuscleFocus[];
  lowFocus: MuscleFocus[];
  untrained: MuscleFocus[];
  evolving: MuscleFocus[];
  stalled: MuscleFocus[];
};

/** As leituras que a pessoa procura no gráfico, em palavras. */
export function focusSummary(rows: MuscleFocus[]): FocusSummary {
  const trained = rows.filter((r) => r.status !== "sem_registro");
  const above = trained.filter((r) => r.status === "acima");
  const below = trained.filter((r) => r.status === "abaixo");
  return {
    // acima da faixa; sem ninguém acima, os dois mais perto do topo da escala
    mostFocus: (above.length ? above : trained.filter((r) => r.status === "na_faixa")).slice(0, 3),
    // treinados mas abaixo da faixa, do mais distante ao mais perto
    lowFocus: [...below].sort((a, b) => a.position - b.position).slice(0, 3),
    untrained: rows.filter((r) => r.status === "sem_registro"),
    evolving: rows.filter((r) => r.trend === "evoluindo"),
    stalled: rows.filter((r) => r.trend === "estagnado" || r.trend === "caindo"),
  };
}
