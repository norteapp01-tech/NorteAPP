import type { Exercise, MuscleGroup, WorkoutSession } from "../workout-store";
import { sessionPlanned } from "../workout-store";
import { muscleGroupLabel, type DateRange } from "../workout-evolution";
import { BODYWEIGHT_EQUIPMENT, CHART_MUSCLES, NON_LOAD_EQUIPMENT } from "./config";
import { exerciseParticipation } from "./participation";
import { evolutionLabel, evolutionScore } from "./scale";
import type { Confidence, EvolutionResult, ExerciseEvolution } from "./types";

// ---------------------------------------------------------------------------
// Evolução de desempenho por músculo: período atual contra o período anterior
// de mesma duração, só com o histórico da própria pessoa.
//
// Por exercício (mesma linhagem e mesmo equipamento):
//   força estimada da série = carga × (1 + repetições ÷ 30)   (Epley)
//   desempenho da sessão    = melhor série da sessão
//   desempenho do período   = mediana das sessões (uma sessão boa ou ruim não decide)
//   evolução %              = (atual − anterior) ÷ anterior × 100
// Peso corporal compara repetições; assistido e elástico ficam de fora.
// Por músculo: mediana ponderada (principal 1, secundário 0,5) — um exercício só
// não distorce o resultado. Sem dado nos dois períodos = "dados insuficientes".
// ---------------------------------------------------------------------------

export const epley = (weight: number, reps: number) => weight * (1 + reps / 30);

type Perf = {
  lineage: string;
  name: string;
  metric: "forca_estimada" | "repeticoes";
  participation: Map<MuscleGroup, number>;
  values: number[];
};

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function weightedMedian(items: { value: number; weight: number }[]): number {
  const s = [...items].filter((i) => i.weight > 0).sort((a, b) => a.value - b.value);
  const total = s.reduce((x, i) => x + i.weight, 0);
  let acc = 0;
  for (const i of s) {
    acc += i.weight;
    if (acc >= total / 2) return i.value;
  }
  return s.at(-1)?.value ?? 0;
}

function performances(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  range: DateRange,
): Map<string, Perf> {
  const out = new Map<string, Perf>();
  for (const s of sessions) {
    if (s.status !== "concluido" || s.date < range.from || s.date > range.to) continue;
    for (const p of sessionPlanned(s, exercises)) {
      const equipment = p.equipment;
      if (equipment && NON_LOAD_EQUIPMENT.includes(equipment)) continue;
      const log = s.exerciseLogs.find((l) => l.exerciseId === p.exerciseId);
      const sets = (log?.sets ?? []).filter((x) => !x.isDrop && x.reps > 0);
      if (!sets.length) continue;
      const bodyweight =
        (equipment && BODYWEIGHT_EQUIPMENT.includes(equipment)) ||
        sets.every((x) => !(x.weight > 0));
      const metric = bodyweight ? "repeticoes" : "forca_estimada";
      const best = bodyweight
        ? Math.max(...sets.map((x) => x.reps))
        : Math.max(...sets.filter((x) => x.weight > 0).map((x) => epley(x.weight, x.reps)));
      const key = `${p.lineageId ?? p.exerciseId}::${equipment ?? "indef"}::${metric}`;
      const row = out.get(key) ?? {
        lineage: p.lineageId ?? p.exerciseId,
        name: p.name,
        metric,
        participation: exerciseParticipation(p),
        values: [],
      };
      row.values.push(best);
      out.set(key, row);
    }
  }
  return out;
}

export function computeEvolution(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  current: DateRange,
  previous: DateRange,
): EvolutionResult[] {
  const now = performances(sessions, exercises, current);
  const before = performances(sessions, exercises, previous);
  const perMuscle = new Map<MuscleGroup, ExerciseEvolution[]>();
  const seen = new Set<MuscleGroup>();
  for (const [key, cur] of now) {
    for (const m of cur.participation.keys()) seen.add(m);
    const prev = before.get(key);
    if (!prev) continue;
    const a = median(prev.values);
    const b = median(cur.values);
    if (!(a > 0)) continue;
    const pct = ((b - a) / a) * 100;
    for (const [m, w] of cur.participation) {
      perMuscle.set(m, [
        ...(perMuscle.get(m) ?? []),
        {
          lineageId: cur.lineage,
          name: cur.name,
          metric: cur.metric,
          previous: Math.round(a * 10) / 10,
          current: Math.round(b * 10) / 10,
          percentage: Math.round(pct * 10) / 10,
          weight: w,
        },
      ]);
    }
  }
  return CHART_MUSCLES.filter((m) => seen.has(m) || perMuscle.has(m)).map((muscle) => {
    const list = perMuscle.get(muscle) ?? [];
    const name = muscleGroupLabel[muscle];
    if (!list.length) {
      return {
        muscleId: muscle,
        muscleName: name,
        score: null,
        evolutionPercentage: null,
        label: null,
        confidence: "baixa" as Confidence,
        exercises: [],
        insufficientData: true,
        explanation:
          "Dados insuficientes para calcular a evolução: é preciso ter o mesmo exercício registrado neste período e no anterior.",
      };
    }
    const pct =
      Math.round(
        weightedMedian(list.map((e) => ({ value: e.percentage, weight: e.weight }))) * 10,
      ) / 10;
    const score = evolutionScore(pct);
    const primaryCount = list.filter((e) => e.weight >= 1).length;
    const confidence: Confidence =
      primaryCount >= 2 ? "alta" : primaryCount === 1 ? "media" : "baixa";
    return {
      muscleId: muscle,
      muscleName: name,
      score,
      evolutionPercentage: pct,
      label: evolutionLabel(score),
      confidence,
      exercises: list.sort((x, y) => y.weight - x.weight || y.percentage - x.percentage),
      insufficientData: false,
      explanation: `${name}: evolução de ${pct.toLocaleString("pt-BR")}% contra o período anterior de mesma duração. Usa a força estimada (carga × (1 + repetições ÷ 30)) da melhor série de cada sessão e a mediana entre os exercícios, para nenhum exercício sozinho distorcer o resultado.`,
    };
  });
}
