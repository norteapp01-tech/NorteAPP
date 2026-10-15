import type {
  Exercise,
  ExerciseLog,
  MuscleGroup,
  PlannedExercise,
  WorkoutPlan,
  WorkoutSession,
} from "../workout-store";
import { sessionPlanned, toPlannedExercise } from "../workout-store";
import type { BlockDay, CycleBlock } from "../workout-cycle-store";
import { muscleGroupLabel, type DateRange } from "../workout-evolution";
import {
  CHART_MUSCLES,
  DEFAULT_LOAD_INCREMENT,
  LOAD_INCREMENT,
  MUSCLE_SIZE,
  PLAN_SHARE_LOW,
  PROGRESSION_RULES,
} from "./config";
import { exerciseParticipation, primaryMuscle } from "./participation";
import { completionScore, completionStatus } from "./scale";
import type {
  CompletionResult,
  Confidence,
  IncompleteExercise,
  ProgressionSuggestion,
  Volume,
} from "./types";

// ---------------------------------------------------------------------------
// Cumprimento do treino por músculo.
//
// Referência = o treino PRESCRITO para a pessoa (por ela ou por um profissional),
// na versão que valia em cada sessão (retrato da sessão). 10 = 100% do planejado,
// não um "treino ideal" universal.
//
//   cumprimento da série    = min(repetições feitas ÷ repetições planejadas, 1)  (não feita = 0)
//   cumprimento do exercício = média das séries planejadas
//   cumprimento do músculo   = média ponderada dos exercícios (peso = séries planejadas × participação)
//   nota                     = cumprimento × 10 (limitada a 0–10)
//
// Treinos programados que não aconteceram entram com cumprimento 0, usando a
// prescrição mais recente daquele treino até a data.
// ---------------------------------------------------------------------------

export type ScheduleInput = {
  sessions: WorkoutSession[];
  exercises: Exercise[];
  plans: WorkoutPlan[];
  blocks: CycleBlock[];
  blockDays: BlockDay[];
  /** Atribuição semanal ATUAL (dia da semana → treino). Usada só onde não há ciclo com datas. */
  weeklyAssignment: Record<number, string | null>;
  range: DateRange;
  /** Hoje (AAAA-MM-DD): dias futuros não contam; hoje só conta se já treinou. */
  today: string;
};

/** Uma ocorrência do treino no período: feita (com registros) ou programada e não feita. */
export type SessionInstance = {
  date: string;
  planLineageId: string;
  planLabel: string;
  planned: PlannedExercise[];
  logs: ExerciseLog[] | null;
  performed: boolean;
  effort?: string;
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(s + "T00:00:00");
/** Segunda-feira da semana (chave para casar treinos programados e feitos). */
function weekKey(date: string): string {
  const d = parse(date);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return iso(d);
}

/** Agenda programada no período: ciclo com datas (histórico) tem prioridade; sem
 * ciclo, aplica a atribuição semanal atual (confiança menor). */
export function scheduledDays(
  input: ScheduleInput,
): { date: string; planId: string; source: "ciclo" | "semana" }[] {
  const out: { date: string; planId: string; source: "ciclo" | "semana" }[] = [];
  const { range, today } = input;
  const last = range.to < today ? range.to : today;
  for (let d = parse(range.from); iso(d) <= last; d.setDate(d.getDate() + 1)) {
    const date = iso(d);
    const block = input.blocks.find((b) => b.startDate <= date && b.endDate >= date);
    if (block) {
      const day = input.blockDays.find((x) => x.blockId === block.id && x.weekday === d.getDay());
      if (day?.planId) out.push({ date, planId: day.planId, source: "ciclo" });
      continue;
    }
    const planId = input.weeklyAssignment[d.getDay()];
    if (planId) out.push({ date, planId, source: "semana" });
  }
  return out;
}

/** Prescrição que valia para o treino numa data: o retrato da última sessão desse
 * treino até a data; sem nenhuma, a ficha atual. */
function prescriptionAt(lineageId: string, date: string, input: ScheduleInput): PlannedExercise[] {
  const past = input.sessions
    .filter((s) => s.planLineageId === lineageId && s.date <= date && s.plannedSnapshot?.length)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (past) return sessionPlanned(past, input.exercises);
  const plan =
    input.plans.find((p) => p.lineageId === lineageId && !p.archivedAt) ??
    input.plans.find((p) => p.lineageId === lineageId);
  return plan
    ? input.exercises
        .filter((e) => e.planId === plan.id)
        .sort((a, b) => a.order - b.order)
        .map(toPlannedExercise)
    : [];
}

export function buildInstances(input: ScheduleInput): {
  instances: SessionInstance[];
  scheduleSource: "ciclo" | "semana" | "nenhuma" | "misto";
} {
  const { range } = input;
  const lineageOfPlan = (planId: string) =>
    input.plans.find((p) => p.id === planId)?.lineageId ?? planId;
  const labelOfLineage = (lineage: string) => {
    const p = input.plans.find((x) => x.lineageId === lineage);
    return p ? `${p.letter} · ${p.name}` : "Treino";
  };

  const performed: SessionInstance[] = input.sessions
    .filter((s) => s.status === "concluido" && s.date >= range.from && s.date <= range.to)
    .map((s) => {
      const lineage = s.planLineageId ?? lineageOfPlan(s.planId);
      return {
        date: s.date,
        planLineageId: lineage,
        planLabel: s.planLabel ?? labelOfLineage(lineage),
        planned: sessionPlanned(s, input.exercises),
        logs: s.exerciseLogs,
        performed: true,
        effort: s.perceivedEffort,
      };
    });

  const scheduled = scheduledDays(input);
  const sources = new Set(scheduled.map((s) => s.source));
  const scheduleSource =
    sources.size === 0
      ? "nenhuma"
      : sources.size > 1
        ? "misto"
        : ([...sources][0] as "ciclo" | "semana");

  // Casa por semana e treino: mudar o dia do treino dentro da semana não é falta.
  // Primeiro casa os treinos feitos no próprio dia programado; os feitos em outro dia
  // cobrem os programados que sobraram. Só o que ficou sem par é falta — na data certa.
  const byWeek = new Map<string, { planned: string[]; doneDates: string[] }>();
  for (const s of scheduled) {
    const key = `${weekKey(s.date)}|${lineageOfPlan(s.planId)}`;
    const row = byWeek.get(key) ?? { planned: [], doneDates: [] };
    row.planned.push(s.date);
    byWeek.set(key, row);
  }
  for (const p of performed) {
    const row = byWeek.get(`${weekKey(p.date)}|${p.planLineageId}`);
    if (row) row.doneDates.push(p.date);
  }
  const missed: SessionInstance[] = [];
  for (const [key, row] of byWeek) {
    const lineage = key.split("|")[1];
    const open = [...row.planned].sort();
    const elsewhere: string[] = [];
    for (const d of row.doneDates) {
      const i = open.indexOf(d);
      if (i >= 0) open.splice(i, 1);
      else elsewhere.push(d);
    }
    // treino feito fora do dia cobre o programado mais próximo antes dele (ou o primeiro)
    for (const d of elsewhere.sort()) {
      if (!open.length) break;
      const before = open.filter((x) => x <= d);
      const pick = before.length ? before[before.length - 1] : open[0];
      open.splice(open.indexOf(pick), 1);
    }
    for (const date of open) {
      if (date >= input.today) continue; // o dia ainda não acabou
      missed.push({
        date,
        planLineageId: lineage,
        planLabel: labelOfLineage(lineage),
        planned: prescriptionAt(lineage, date, input),
        logs: null,
        performed: false,
      });
    }
  }
  return {
    instances: [...performed, ...missed].sort((a, b) => a.date.localeCompare(b.date)),
    scheduleSource,
  };
}

type SetEval = {
  plannedReps: number;
  doneReps: number;
  done: boolean;
  atTop: boolean;
  loadOk: boolean;
};

/** Avalia as séries planejadas de um exercício numa ocorrência. Séries extras e
 * drops não entram (não sobem a nota acima de 100%). */
export function evaluateExercise(
  planned: PlannedExercise,
  log: ExerciseLog | undefined,
): { sets: SetEval[]; completion: number; skipped: boolean } {
  const targets = planned.setTargets?.length
    ? planned.setTargets
    : Array.from({ length: planned.setsTarget }, () => ({
        reps: planned.repsTarget,
        weight: planned.loadTarget,
        restSeconds: 0,
      }));
  const done = (log?.sets ?? []).filter((s) => !s.isDrop).sort((a, b) => a.setIndex - b.setIndex);
  const sets: SetEval[] = targets.map((t, i) => {
    const s = done[i];
    if (!s) return { plannedReps: t.reps, doneReps: 0, done: false, atTop: false, loadOk: false };
    return {
      plannedReps: t.reps,
      doneReps: s.reps,
      done: true,
      atTop: t.reps > 0 ? s.reps >= t.reps : true,
      loadOk: !(t.weight > 0) || s.weight >= t.weight,
    };
  });
  const completion = sets.length
    ? sets.reduce(
        (acc, s) =>
          acc + (!s.done ? 0 : s.plannedReps > 0 ? Math.min(s.doneReps / s.plannedReps, 1) : 1),
        0,
      ) / sets.length
    : 0;
  return { sets, completion, skipped: Boolean(log?.skipped) };
}

const emptyVolume = (): Volume => ({ sessions: 0, exercises: 0, sets: 0, reps: 0 });

type MuscleAcc = {
  weightSum: number;
  weighted: number;
  planned: Volume;
  done: Volume;
  sessionsPlanned: Set<string>;
  sessionsDone: Set<string>;
  incomplete: IncompleteExercise[];
  plannedWeeklySets: number;
};

function accumulate(instances: SessionInstance[]) {
  const acc = new Map<MuscleGroup, MuscleAcc>();
  const get = (m: MuscleGroup) => {
    let a = acc.get(m);
    if (!a) {
      a = {
        weightSum: 0,
        weighted: 0,
        planned: emptyVolume(),
        done: emptyVolume(),
        sessionsPlanned: new Set(),
        sessionsDone: new Set(),
        incomplete: [],
        plannedWeeklySets: 0,
      };
      acc.set(m, a);
    }
    return a;
  };
  for (const inst of instances) {
    const instKey = `${inst.date}|${inst.planLineageId}`;
    for (const p of inst.planned) {
      const part = exerciseParticipation(p);
      if (part.size === 0) continue;
      const log = inst.logs?.find((l) => l.exerciseId === p.exerciseId);
      const ev = evaluateExercise(p, log);
      const plannedSets = ev.sets.length;
      for (const [muscle, w] of part) {
        const a = get(muscle);
        a.weightSum += plannedSets * w;
        a.weighted += plannedSets * w * ev.completion;
        a.plannedWeeklySets += plannedSets * w;
      }
      // Contagens descritivas: só pelo músculo principal (sem dupla contagem).
      const primary = primaryMuscle(p)!;
      const a = get(primary);
      a.sessionsPlanned.add(instKey);
      if (inst.performed && ev.sets.some((s) => s.done)) a.sessionsDone.add(instKey);
      a.planned.exercises += 1;
      a.planned.sets += plannedSets;
      a.planned.reps += ev.sets.reduce((x, s) => x + s.plannedReps, 0);
      a.done.sets += ev.sets.filter((s) => s.done).length;
      a.done.reps += ev.sets.reduce(
        (x, s) => x + (s.done ? Math.min(s.doneReps, s.plannedReps || s.doneReps) : 0),
        0,
      );
      if (ev.completion >= 0.999) a.done.exercises += 1;
      else
        a.incomplete.push({
          name: p.name,
          date: inst.date,
          kind: !inst.performed
            ? "nao_realizado"
            : ev.skipped || ev.sets.every((s) => !s.done)
              ? "pulado"
              : "parcial",
          setsDone: ev.sets.filter((s) => s.done).length,
          setsPlanned: plannedSets,
          repsDone: ev.sets.reduce((x, s) => x + (s.done ? s.doneReps : 0), 0),
          repsPlanned: ev.sets.reduce((x, s) => x + s.plannedReps, 0),
          completion: ev.completion,
        });
    }
  }
  for (const a of acc.values()) {
    a.planned.sessions = a.sessionsPlanned.size;
    a.done.sessions = a.sessionsDone.size;
  }
  return acc;
}

/** Estado dourado: o exercício bateu o topo da meta (todas as séries feitas, ≥80%
 * delas no topo das repetições e a carga-alvo) nas últimas N sessões seguidas, sem
 * sessão marcada como pesada. Nunca muda o treino sozinho. */
export function progressionFor(
  instances: SessionInstance[],
  exercises: Exercise[],
): Map<MuscleGroup, ProgressionSuggestion[]> {
  const byLineage = new Map<string, { p: PlannedExercise; inst: SessionInstance }[]>();
  for (const inst of instances.filter((i) => i.performed)) {
    for (const p of inst.planned) {
      const key = p.lineageId ?? p.exerciseId;
      byLineage.set(key, [...(byLineage.get(key) ?? []), { p, inst }]);
    }
  }
  const out = new Map<MuscleGroup, ProgressionSuggestion[]>();
  for (const [lineageId, rows] of byLineage) {
    const recent = rows
      .sort((a, b) => a.inst.date.localeCompare(b.inst.date))
      .slice(-PROGRESSION_RULES.consecutiveSessions);
    if (recent.length < PROGRESSION_RULES.consecutiveSessions) continue;
    const ok = recent.every(({ p, inst }) => {
      if (inst.effort === PROGRESSION_RULES.blockingEffort) return false;
      const ev = evaluateExercise(
        p,
        inst.logs?.find((l) => l.exerciseId === p.exerciseId),
      );
      if (!ev.sets.length || ev.sets.some((s) => !s.done)) return false;
      const atTop = ev.sets.filter((s) => s.atTop && s.loadOk).length / ev.sets.length;
      return atTop >= PROGRESSION_RULES.minShareOfSetsAtTop;
    });
    if (!ok) continue;
    const last = recent.at(-1)!.p;
    const muscle = primaryMuscle(last);
    if (!muscle) continue;
    const live =
      exercises.find((e) => e.lineageId === lineageId) ??
      exercises.find((e) => e.id === last.exerciseId);
    const currentLoad = live?.loadTarget ?? last.loadTarget;
    const step = (live?.equipment && LOAD_INCREMENT[live.equipment]) ?? DEFAULT_LOAD_INCREMENT;
    out.set(muscle, [
      ...(out.get(muscle) ?? []),
      {
        lineageId,
        exerciseId: live?.id,
        name: last.name,
        currentLoad,
        suggestedLoad: currentLoad > 0 ? currentLoad + step : undefined,
        repsTarget: live?.repsTarget ?? last.repsTarget,
      },
    ]);
  }
  return out;
}

function confidenceOf(scheduleSource: string, plannedSessions: number): Confidence {
  if (plannedSessions < 2 || scheduleSource === "nenhuma") return "baixa";
  if (scheduleSource === "ciclo") return "alta";
  return "media";
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function computeCompletion(
  input: ScheduleInput,
  previous?: ScheduleInput,
): CompletionResult[] {
  const { instances, scheduleSource } = buildInstances(input);
  const acc = accumulate(instances);
  const prevAcc = previous ? accumulate(buildInstances(previous).instances) : undefined;
  const progression = progressionFor(instances, input.exercises);

  // Aviso de plano leve (relativo ao próprio plano, ponderado pelo tamanho do músculo).
  const normalized = [...acc.entries()]
    .filter(([m]) => CHART_MUSCLES.includes(m))
    .map(([m, a]) => a.plannedWeeklySets / (MUSCLE_SIZE[m] ?? 0.75));
  const sorted = [...normalized].sort((x, y) => x - y);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

  return CHART_MUSCLES.filter((m) => acc.has(m)).map((muscle) => {
    const a = acc.get(muscle)!;
    const name = muscleGroupLabel[muscle];
    const fraction = a.weightSum > 0 ? a.weighted / a.weightSum : null;
    const score = fraction === null ? null : completionScore(fraction);
    const prog = score === 10 ? (progression.get(muscle) ?? []) : [];
    const eligible = prog.length > 0;
    const prev = prevAcc?.get(muscle);
    const previousScore =
      prev && prev.weightSum > 0 ? completionScore(prev.weighted / prev.weightSum) : null;
    const share = a.plannedWeeklySets / (MUSCLE_SIZE[muscle] ?? 0.75);
    const planShareNote =
      sorted.length >= 3 && median > 0 && share < median * PLAN_SHARE_LOW
        ? `${name} tem uma das menores fatias do seu plano neste período. Se quiser mais foco nele, considere incluir exercícios ou séries na ficha — isso não altera a nota.`
        : undefined;
    const pct = fraction === null ? null : round1(fraction * 100);
    const explanation =
      fraction === null
        ? "Nada planejado para este músculo no período."
        : `${pct}% do treino planejado para ${name.toLowerCase()} foi feito: ${a.done.sets} de ${a.planned.sets} séries, em ${a.done.sessions} de ${a.planned.sessions} treinos. Cada série vale as repetições feitas sobre as planejadas (no máximo 100%); série não feita vale zero.${a.planned.sessions > a.done.sessions ? " Treinos programados que não aconteceram contam como zero." : ""}${scheduleSource === "nenhuma" ? " Sem dias de treino definidos, só os treinos feitos entram na conta — faltas não aparecem." : scheduleSource !== "ciclo" ? " Faltas calculadas pelos dias da semana definidos hoje na ficha." : ""}`;
    return {
      muscleId: muscle,
      muscleName: name,
      score,
      completionPercentage: pct,
      status: score === null ? null : completionStatus(score, eligible),
      confidence: confidenceOf(scheduleSource, a.planned.sessions),
      plannedVolume: a.planned,
      completedVolume: a.done,
      eligibleForProgression: eligible,
      progression: prog,
      incomplete: [...a.incomplete].sort(
        (x, y) => x.completion - y.completion || y.date.localeCompare(x.date),
      ),
      insufficientData: fraction === null,
      previousScore,
      planShareNote,
      explanation,
    };
  });
}
