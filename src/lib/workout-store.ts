import { useQuery } from "@tanstack/react-query";
import { todayISO, toISODate } from "./goals-store";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { nowDate, nowMs } from "./test-clock";

// ---------------------------------------------------------------------------
// Diário de treino da Academia — Treino (A/B/C...) -> Exercícios -> Sessões
// (série a série). Persistido no Supabase (mesmo padrão de goals-store.ts) —
// seletores puros abaixo continuam 100% inalterados.
// ---------------------------------------------------------------------------

export type WorkoutPlan = {
  id: string;
  letter: string;
  name: string;
  muscleGroups: string;
  order: number;
  /** Identidade que sobrevive à cópia entre blocos do ciclo — é por ela que
   * uma sessão acha "a anterior deste mesmo treino" depois de mudar de fase. */
  lineageId: string;
  /** Nulo = treino da biblioteca. Preenchido = cópia que vive dentro de um
   * bloco do ciclo e só é editada por lá. */
  blockId?: string;
  sourcePlanId?: string;
  archivedAt?: string;
};

export type Exercise = {
  id: string;
  planId: string;
  /** Mesmo exercício visto em blocos diferentes: a curva de evolução segue
   * esta identidade, não o id da cópia. */
  lineageId: string;
  name: string;
  setsTarget: number;
  repsTarget: number;
  loadTarget: number;
  restSeconds: number;
  setTargets?: SetTarget[];
  notes?: string;
  muscleGroup?: MuscleGroup;
  /** Participam do movimento, mas NÃO recebem a série: somar a série inteira
   * em cada um inflaria o total de séries registradas. */
  secondaryMuscles: MuscleGroup[];
  equipment?: ExerciseEquipment;
  order: number;
};

/** Catálogo determinístico — a granularidade em que dá para somar séries sem
 * inventar estímulo. Exercício sem classificação fica nulo, e a interface diz
 * "Não classificado" em vez de adivinhar. */
export type MuscleGroup =
  | "peito"
  | "costas"
  | "ombros"
  | "biceps"
  | "triceps"
  | "antebraco"
  | "quadriceps"
  | "posteriores"
  | "gluteos"
  | "panturrilhas"
  | "abdomen"
  | "corpo_inteiro"
  | "cardio";

/** Entra na chave de comparação, não é só rótulo: 40kg na barra e 40kg por
 * halter não são a mesma carga, e trocar de aparelho quebra a curva. */
export type ExerciseEquipment =
  | "barra"
  | "halteres"
  | "maquina"
  | "cabo"
  | "peso_corporal"
  | "assistido"
  | "kettlebell"
  | "elastico"
  | "outro";

export type SetTarget = { reps: number; weight: number; restSeconds: number };
export type SetLog = { setIndex: number; weight: number; reps: number };
/** `exerciseId` é nulo quando o exercício foi excluído do treino depois deste
 * registro — as séries continuam valendo e o nome vem do retrato da sessão. */
export type ExerciseLog = { exerciseId: string | null; sets: SetLog[]; done: boolean };
export type WorkoutSessionStatus = "em_andamento" | "concluido";

/** O que o treino planejava no instante em que a sessão começou. Sem isso, um
 * treino de três meses atrás passa a exibir a meta de hoje — a sessão lia o
 * exercício vivo, então editar a carga reescrevia o passado. */
export type PlannedExercise = {
  exerciseId: string;
  lineageId?: string;
  name: string;
  /** Guardados no retrato para que reclassificar a ficha hoje não reescreva a
   * distribuição muscular de meses atrás. */
  muscleGroup?: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  equipment?: ExerciseEquipment;
  order: number;
  setsTarget: number;
  repsTarget: number;
  loadTarget: number;
  restSeconds: number;
  setTargets: SetTarget[];
};

export type WorkoutSession = {
  id: string;
  planId: string;
  date: string; // YYYY-MM-DD
  startedAt: string;
  finishedAt?: string;
  exerciseLogs: ExerciseLog[];
  status: WorkoutSessionStatus;
  /** Desde quando o treino está pausado (null = correndo). */
  pausedAt?: string;
  /** Segundos já pausados antes da pausa atual. */
  pausedSeconds: number;
  restStartedAt?: string;
  restTotalSeconds?: number;
  restPausedAt?: string;
  restPausedSeconds: number;
  selectedExerciseId?: string;
  plannedSnapshot?: PlannedExercise[];
  /** Identidade e rótulo do treino gravados na sessão: sobrevivem à exclusão
   * do plano e às cópias entre blocos. */
  planLineageId?: string;
  planLabel?: string;
  /** Descanso escolhido na hora para um exercício, valendo só nesta sessão.
   * Não toca na ficha do treino. */
  restOverrides: Record<string, number>;
};

export type BodyWeightEntry = { id: string; date: string; weight: number };

/** Histórico ordenado por data (mais recente primeiro) — nunca presumir que a posição no
 * array reflete ordem temporal (ex.: registros editados ou o mesmo dia atualizado no lugar). */
export function bodyWeightsByDateDesc(entries: BodyWeightEntry[]): BodyWeightEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

/** Peso corporal atual = registro mais recente por DATA, nunca por posição no array. */
export function currentBodyWeight(entries: BodyWeightEntry[]): BodyWeightEntry | undefined {
  return bodyWeightsByDateDesc(entries)[0];
}

type State = {
  plans: WorkoutPlan[];
  exercises: Exercise[];
  sessions: WorkoutSession[];
  weeklyAssignment: Record<number, string | null>; // 0=domingo .. 6=sábado -> planId
  bodyWeights: BodyWeightEntry[];
};

const EMPTY_WEEKLY: Record<number, string | null> = {
  0: null,
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
};
const EMPTY_STATE: State = {
  plans: [],
  exercises: [],
  sessions: [],
  weeklyAssignment: EMPTY_WEEKLY,
  bodyWeights: [],
};

// ---------------------------------------------------------------------------
// Seletores puros
// ---------------------------------------------------------------------------
export function exercisesForPlan(exercises: Exercise[], planId: string): Exercise[] {
  return exercises.filter((e) => e.planId === planId).sort((a, b) => a.order - b.order);
}

export function todaysPlanId(weeklyAssignment: Record<number, string | null>): string | null {
  return weeklyAssignment[nowDate().getDay()] ?? null;
}

export function sessionForToday(
  sessions: WorkoutSession[],
  planId: string,
): WorkoutSession | undefined {
  const iso = todayISO();
  return sessions.find((s) => s.date === iso && s.planId === planId);
}

/** A sessão em andamento, seja de que dia for. `sessionForToday` só enxergava
 * hoje: um treino aberto ontem e nunca finalizado desaparecia da interface e
 * ficava aberto pra sempre no banco, sem nenhuma forma de retomar ou encerrar. */
export function openSession(sessions: WorkoutSession[]): WorkoutSession | undefined {
  return sessions
    .filter((s) => s.status === "em_andamento")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

/** Duração do treino em segundos, por diferença de horários. Contar ticks de
 * timer perdia tempo toda vez que a aba ia pro fundo ou a tela bloqueava. */
export function sessionElapsedSeconds(session: WorkoutSession, now = nowMs()): number {
  const start = new Date(session.startedAt).getTime();
  const end = session.finishedAt ? new Date(session.finishedAt).getTime() : now;
  const activePause = session.pausedAt
    ? Math.max(0, (now - new Date(session.pausedAt).getTime()) / 1000)
    : 0;
  return Math.max(0, Math.round((end - start) / 1000 - session.pausedSeconds - activePause));
}

/** Segundos restantes de descanso, ou null quando não há descanso rodando.
 * Chega a 0 e fica — o descanso estourado continua visível até ser dispensado. */
export function restRemainingSeconds(session: WorkoutSession, now = nowMs()): number | null {
  if (!session.restStartedAt || !session.restTotalSeconds) return null;
  const activePause = session.restPausedAt
    ? Math.max(0, (now - new Date(session.restPausedAt).getTime()) / 1000)
    : 0;
  const elapsed =
    (now - new Date(session.restStartedAt).getTime()) / 1000 -
    session.restPausedSeconds -
    activePause;
  return Math.max(0, Math.round(session.restTotalSeconds - elapsed));
}

export function isRestRunning(session: WorkoutSession): boolean {
  return Boolean(session.restStartedAt && !session.restPausedAt);
}

/** Os quatro estados do descanso, explicitamente separados — duração-base,
 * tempo restante e estado de execução são três coisas distintas, e tratá-las
 * como uma só foi o que fazia o cronômetro "desaparecer" quando parava. */
export type RestStatus = "pronto" | "correndo" | "pausado" | "fim";

export type RestState = {
  status: RestStatus;
  /** Sempre presente: quando não há descanso rodando, é a duração-base. */
  remaining: number;
  /** Duração que um Play/Reiniciar vai carregar. */
  base: number;
};

/** Descanso cadastrado para a série atual, com a escolha temporária da sessão
 * tendo precedência. Nunca zero: um descanso de duração zero não é descanso. */
export function restBaseSeconds(
  session: WorkoutSession,
  exerciseId: string | undefined,
  configured: number | undefined,
): number {
  const override = exerciseId ? session.restOverrides[exerciseId] : undefined;
  const value = override ?? configured ?? DEFAULT_REST_SECONDS;
  return value > 0 ? value : DEFAULT_REST_SECONDS;
}

export const DEFAULT_REST_SECONDS = 60;
export const MAX_REST_SECONDS = 60 * 60;

export function restState(session: WorkoutSession, base: number, now = nowMs()): RestState {
  if (!session.restStartedAt || !session.restTotalSeconds) {
    return { status: "pronto", remaining: base, base };
  }
  const remaining = restRemainingSeconds(session, now) ?? 0;
  if (remaining <= 0) return { status: "fim", remaining: 0, base };
  return { status: session.restPausedAt ? "pausado" : "correndo", remaining, base };
}

/** Converte um exercício vivo no formato do retrato — usado tanto pra gravar o
 * retrato quanto pra completar sessões antigas, que não têm um. */
export function toPlannedExercise(exercise: Exercise): PlannedExercise {
  const fallback = {
    reps: exercise.repsTarget,
    weight: exercise.loadTarget,
    restSeconds: exercise.restSeconds,
  };
  const targets = exercise.setTargets?.length
    ? exercise.setTargets
    : Array.from({ length: exercise.setsTarget }, () => ({ ...fallback }));
  return {
    exerciseId: exercise.id,
    lineageId: exercise.lineageId,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    secondaryMuscles: exercise.secondaryMuscles,
    equipment: exercise.equipment,
    order: exercise.order,
    setsTarget: exercise.setsTarget,
    repsTarget: exercise.repsTarget,
    loadTarget: exercise.loadTarget,
    restSeconds: exercise.restSeconds,
    setTargets: targets,
  };
}

/** O que a sessão planejava, em ordem. Sessões gravadas antes do retrato
 * existir caem no treino vivo — é o melhor dado disponível pra elas, e a
 * ausência do retrato é justamente o que a migration passa a evitar daqui pra
 * frente. */
export function sessionPlanned(session: WorkoutSession, exercises: Exercise[]): PlannedExercise[] {
  if (session.plannedSnapshot?.length) {
    return [...session.plannedSnapshot].sort((a, b) => a.order - b.order);
  }
  return exercisesForPlan(exercises, session.planId).map(toPlannedExercise);
}

export type ExerciseCompletion = "concluido" | "parcial" | "nao_realizado";

/** Três estados, não dois: um exercício com 2 de 4 séries não é "feito" nem
 * "não feito". Finalizar o treino nunca promove um parcial a concluído. */
export function exerciseCompletionState(
  log: ExerciseLog | undefined,
  planned: PlannedExercise | undefined,
): ExerciseCompletion {
  const done = log?.sets.length ?? 0;
  if (log?.done) return "concluido";
  if (done === 0) return "nao_realizado";
  const target = planned?.setsTarget ?? 0;
  return target > 0 && done >= target ? "concluido" : "parcial";
}

/** Próximo exercício que ainda tem série pendente, dando a volta na lista.
 * É o caso real de academia: a máquina do próximo está ocupada, você pula pro
 * seguinte, e ao terminar ele o painel tem que voltar pro que ficou pra trás —
 * não parar no fim da lista. Retorna null quando não há mais nada pendente. */
export function nextPendingExerciseId(
  planned: PlannedExercise[],
  logs: ExerciseLog[],
  fromExerciseId: string,
): string | null {
  const from = planned.findIndex((p) => p.exerciseId === fromExerciseId);
  if (planned.length === 0) return null;
  const start = from < 0 ? 0 : from;
  for (let step = 1; step <= planned.length; step += 1) {
    const candidate = planned[(start + step) % planned.length];
    const log = logs.find((l) => l.exerciseId === candidate.exerciseId);
    if (exerciseCompletionState(log, candidate) !== "concluido") return candidate.exerciseId;
  }
  return null;
}

/** Carga máxima registrada por sessão finalizada daquele exercício, em ordem cronológica — alimenta o Sparkline. */
export function exerciseWeightSeries(
  sessions: WorkoutSession[],
  planId: string,
  exerciseId: string,
): { date: string; maxWeight: number }[] {
  return sessions
    .filter((s) => s.planId === planId && s.status === "concluido")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const log = s.exerciseLogs.find((l) => l.exerciseId === exerciseId);
      const maxWeight = log?.sets.length ? Math.max(...log.sets.map((set) => set.weight)) : 0;
      return { date: s.date, maxWeight };
    })
    .filter((p) => p.maxWeight > 0);
}

/** Treinos da biblioteca ("Treinos cadastrados") — sem os que pertencem a um
 * bloco do ciclo e sem os arquivados. Um treino de bloco é editado dentro do
 * bloco; deixá-lo solto na biblioteca faria a edição vazar entre fases. */
export function libraryPlans(plans: WorkoutPlan[]): WorkoutPlan[] {
  return plans.filter((p) => !p.blockId && !p.archivedAt).sort((a, b) => a.order - b.order);
}

/** Ids de exercício que pertencem a uma mesma linhagem, considerando tanto os
 * exercícios vivos quanto os retratos guardados nas sessões. Um id pertence a
 * exatamente uma linhagem, então juntar as duas fontes não mistura nada. */
function lineageExerciseIds(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  lineageId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const e of exercises) if (e.lineageId === lineageId) ids.add(e.id);
  for (const s of sessions) {
    for (const p of s.plannedSnapshot ?? []) {
      if (p.lineageId === lineageId) ids.add(p.exerciseId);
    }
  }
  return ids;
}

/** Carga máxima por sessão concluída seguindo a LINHAGEM do exercício — a
 * curva não recomeça do zero quando o ciclo copia o treino para outro bloco. */
export function exerciseSeriesByLineage(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  lineageId: string,
): { date: string; maxWeight: number }[] {
  const ids = lineageExerciseIds(sessions, exercises, lineageId);
  if (ids.size === 0) return [];
  const out: { date: string; maxWeight: number }[] = [];
  for (const s of sessions) {
    if (s.status !== "concluido") continue;
    let max = 0;
    for (const log of s.exerciseLogs) {
      if (!log.exerciseId || !ids.has(log.exerciseId)) continue;
      for (const set of log.sets) max = Math.max(max, set.weight);
    }
    if (max > 0) out.push({ date: s.date, maxWeight: max });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Maior carga levantada com PELO MENOS `minReps` repetições. 80kg×3 e 80kg×10
 * não são o mesmo resultado; comparar só o quilo mentiria sobre a evolução. */
export function maxWeightAtReps(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  lineageId: string,
  minReps: number,
  range?: { from: string; to: string },
): number {
  const ids = lineageExerciseIds(sessions, exercises, lineageId);
  let max = 0;
  for (const s of sessions) {
    if (s.status !== "concluido") continue;
    if (range && (s.date < range.from || s.date > range.to)) continue;
    for (const log of s.exerciseLogs) {
      if (!log.exerciseId || !ids.has(log.exerciseId)) continue;
      for (const set of log.sets) {
        if (set.reps >= minReps) max = Math.max(max, set.weight);
      }
    }
  }
  return max;
}

/** Maior carga sustentada por N séries com as repetições de referência, dentro
 * de UMA sessão. "3×10 com 30kg" não é a mesma conquista que uma única série
 * de 10 com 30kg, e tratar um pico isolado como prova de melhoria seria
 * exatamente o erro que a meta tenta evitar. */
export function maxWeightForSetsReps(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  lineageId: string,
  minReps: number,
  minSets: number,
  range?: { from: string; to: string },
): number {
  if (minSets <= 1) return maxWeightAtReps(sessions, exercises, lineageId, minReps, range);
  const ids = lineageExerciseIds(sessions, exercises, lineageId);
  let best = 0;
  for (const s of sessions) {
    if (s.status !== "concluido") continue;
    if (range && (s.date < range.from || s.date > range.to)) continue;
    const weights: number[] = [];
    for (const log of s.exerciseLogs) {
      if (!log.exerciseId || !ids.has(log.exerciseId)) continue;
      for (const set of log.sets) if (set.reps >= minReps) weights.push(set.weight);
    }
    if (weights.length < minSets) continue;
    // A N-ésima maior carga da sessão é a que foi sustentada por N séries.
    weights.sort((a, b) => b - a);
    best = Math.max(best, weights[minSets - 1]);
  }
  return best;
}

/** Séries e repetições acumuladas de uma linhagem — base das metas de volume. */
export function volumeForLineage(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  lineageId: string,
  range?: { from: string; to: string },
): { sets: number; reps: number } {
  const ids = lineageExerciseIds(sessions, exercises, lineageId);
  let sets = 0;
  let reps = 0;
  for (const s of sessions) {
    if (s.status !== "concluido") continue;
    if (range && (s.date < range.from || s.date > range.to)) continue;
    for (const log of s.exerciseLogs) {
      if (!log.exerciseId || !ids.has(log.exerciseId)) continue;
      sets += log.sets.length;
      for (const set of log.sets) reps += set.reps;
    }
  }
  return { sets, reps };
}

/** Sessões concluídas num intervalo — numerador de "treinos realizados". */
export function finishedSessionsInRange(
  sessions: WorkoutSession[],
  from: string,
  to: string,
): WorkoutSession[] {
  return sessions.filter((s) => s.status === "concluido" && s.date >= from && s.date <= to);
}

/** A sessão anterior DO MESMO TREINO. Compara por linhagem quando existe, e
 * não pelo id do plano: o ciclo copia o treino A a cada bloco, e comparar por
 * id faria a evolução recomeçar do zero em toda troca de fase. */
export function previousFinishedSession(
  sessions: WorkoutSession[],
  planId: string,
  beforeSessionId: string,
): WorkoutSession | undefined {
  const current = sessions.find((s) => s.id === beforeSessionId);
  if (!current) return undefined;
  const sameWorkout = (s: WorkoutSession) =>
    current.planLineageId && s.planLineageId
      ? s.planLineageId === current.planLineageId
      : s.planId === planId;
  return sessions
    .filter(
      (s) =>
        sameWorkout(s) &&
        s.status === "concluido" &&
        s.id !== beforeSessionId &&
        s.date < current.date,
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export type ExerciseSummary = {
  exerciseId: string;
  name: string;
  setsCount: number;
  maxWeight: number;
  repsAtMaxWeight: number;
  targetWeight: number;
  targetReps: number;
  volume: number;
  deltaWeightVsPrevious?: number;
  previousVolume?: number;
  isPersonalRecord: boolean;
};

/** Soma peso×reps de todas as séries do log — volume real do exercício na sessão. */
function logVolume(log: ExerciseLog): number {
  return log.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
}

/** Carga máxima já registrada pra esse exercício em QUALQUER sessão concluída
 * (não só a anterior imediata) — usada pra reconhecer recorde pessoal de verdade,
 * não só "melhor que da última vez". */
export function allTimeMaxWeight(
  sessions: WorkoutSession[],
  planId: string,
  exerciseId: string,
  excludeSessionId?: string,
): number {
  let max = 0;
  for (const s of sessions) {
    if (s.planId !== planId || s.status !== "concluido" || s.id === excludeSessionId) continue;
    const log = s.exerciseLogs.find((l) => l.exerciseId === exerciseId);
    if (!log?.sets.length) continue;
    max = Math.max(max, ...log.sets.map((set) => set.weight));
  }
  return max;
}

export function sessionSummary(
  session: WorkoutSession,
  previous: WorkoutSession | undefined,
  exercises: Exercise[],
  allSessions: WorkoutSession[] = [],
): {
  exercises: ExerciseSummary[];
  totalSets: number;
  completedExercises: number;
  totalVolume: number;
  previousTotalVolume?: number;
  durationMinutes?: number;
} {
  const rows: ExerciseSummary[] = [];
  let totalSets = 0;
  let completedExercises = 0;
  let totalVolume = 0;
  let previousTotalVolume: number | undefined = previous ? 0 : undefined;
  // O resumo descreve o treino COMO ELE FOI: nome e metas vêm do retrato
  // gravado no início da sessão, não do exercício de hoje. É também o que
  // mantém no histórico um exercício já excluído do treino.
  const planned = sessionPlanned(session, exercises);
  for (const log of session.exerciseLogs) {
    if (log.sets.length === 0) continue;
    const ex = planned.find((p) => p.exerciseId === log.exerciseId);
    if (!ex) continue;
    totalSets += log.sets.length;
    if (log.done) completedExercises += 1;
    const best = log.sets.reduce((a, b) => (b.weight > a.weight ? b : a), log.sets[0]);
    const volume = logVolume(log);
    totalVolume += volume;
    const prevLog = previous?.exerciseLogs.find((l) => l.exerciseId === log.exerciseId);
    const prevBest = prevLog?.sets.length
      ? Math.max(...prevLog.sets.map((s) => s.weight))
      : undefined;
    const previousVolume = prevLog ? logVolume(prevLog) : undefined;
    if (previousVolume !== undefined && previousTotalVolume !== undefined) {
      previousTotalVolume += previousVolume;
    }
    const priorMax = allSessions.length
      ? ex.lineageId
        ? Math.max(
            ...exerciseSeriesByLineage(
              allSessions.filter((s) => s.id !== session.id),
              exercises,
              ex.lineageId,
            ).map((p) => p.maxWeight),
            0,
          )
        : allTimeMaxWeight(allSessions, session.planId, ex.exerciseId, session.id)
      : (prevBest ?? 0);
    rows.push({
      exerciseId: ex.exerciseId,
      name: ex.name,
      setsCount: log.sets.length,
      maxWeight: best.weight,
      repsAtMaxWeight: best.reps,
      targetWeight: ex.loadTarget,
      targetReps: ex.repsTarget,
      volume,
      deltaWeightVsPrevious: prevBest !== undefined ? best.weight - prevBest : undefined,
      previousVolume,
      isPersonalRecord: best.weight > 0 && best.weight >= priorMax && priorMax > 0,
    });
  }
  const durationMinutes = session.finishedAt
    ? Math.round(
        (new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000,
      )
    : undefined;
  return {
    exercises: rows,
    totalSets,
    completedExercises,
    totalVolume,
    previousTotalVolume,
    durationMinutes,
  };
}

/** No máximo 2 frases curtas, honestas — nunca afirma causa que os dados não provam
 * (usa "pode ter contribuído"/"coincide com" ao combinar dois fatos). Sem sessão
 * anterior, diz isso claramente em vez de inventar uma comparação. */
export function workoutInsights(
  session: WorkoutSession,
  previous: WorkoutSession | undefined,
  allSessionsForPlan: WorkoutSession[],
  summary: ReturnType<typeof sessionSummary>,
): string[] {
  if (!previous) return ["Ainda não há treinos suficientes pra comparar."];

  const insights: string[] = [];
  const daysSince = Math.round(
    (new Date(session.date + "T00:00:00").getTime() -
      new Date(previous.date + "T00:00:00").getTime()) /
      86400000,
  );

  if (summary.previousTotalVolume !== undefined && summary.previousTotalVolume > 0) {
    const pct = Math.round(
      ((summary.totalVolume - summary.previousTotalVolume) / summary.previousTotalVolume) * 100,
    );
    if (pct <= -5 && daysSince > 7) {
      insights.push(
        `O volume caiu ${Math.abs(pct)}% após ${daysSince} dias sem esse treino. O intervalo maior pode ter contribuído.`,
      );
    } else if (pct <= -5) {
      insights.push(`O volume caiu ${Math.abs(pct)}% em relação ao treino anterior.`);
    } else if (pct >= 5) {
      insights.push(`Você aumentou o volume em ${pct}% em relação ao treino anterior.`);
    }
  }

  if (insights.length < 2) {
    const recentCount = allSessionsForPlan.filter(
      (s) =>
        s.status === "concluido" && s.date <= session.date && s.date >= toISODate14(session.date),
    ).length;
    if (daysSince > 10) {
      insights.push(`Fazia ${daysSince} dias desde o último registro deste treino.`);
    } else if (recentCount >= 4) {
      insights.push(`${recentCount} sessões deste treino nos últimos 14 dias — ritmo consistente.`);
    }
  }

  return insights.slice(0, 2);
}

function toISODate14(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  d.setDate(d.getDate() - 14);
  return toISODate(d);
}

// ---------------------------------------------------------------------------
// Mapeamento snake_case (Supabase) -> camelCase
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function groupBy<T extends Row>(rows: T[], key: string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const k = r[key] as string;
    (out[k] ??= []).push(r);
  }
  return out;
}

function mapPlan(r: Row): WorkoutPlan {
  return {
    id: r.id as string,
    letter: r.letter as string,
    name: r.name as string,
    muscleGroups: (r.muscle_groups as string) ?? "",
    order: (r.order_index as number) ?? 0,
    lineageId: (r.lineage_id as string) ?? (r.id as string),
    blockId: (r.block_id as string) ?? undefined,
    sourcePlanId: (r.source_plan_id as string) ?? undefined,
    archivedAt: (r.archived_at as string) ?? undefined,
  };
}

function mapExercise(r: Row): Exercise {
  const legacyTarget = {
    reps: (r.reps_target as number) ?? 0,
    weight: (r.load_target as number) ?? 0,
    restSeconds: (r.rest_seconds as number) ?? 60,
  };
  const storedTargets = Array.isArray(r.set_targets) ? (r.set_targets as SetTarget[]) : [];
  return {
    id: r.id as string,
    planId: r.plan_id as string,
    lineageId: (r.lineage_id as string) ?? (r.id as string),
    name: r.name as string,
    setsTarget: (r.sets_target as number) ?? 0,
    repsTarget: (r.reps_target as number) ?? 0,
    loadTarget: (r.load_target as number) ?? 0,
    restSeconds: (r.rest_seconds as number) ?? 60,
    notes: (r.notes as string) ?? undefined,
    muscleGroup: (r.muscle_group as MuscleGroup) ?? undefined,
    secondaryMuscles: (r.secondary_muscles as MuscleGroup[]) ?? [],
    equipment: (r.equipment as ExerciseEquipment) ?? undefined,
    setTargets:
      storedTargets.length > 0
        ? storedTargets
        : Array.from({ length: (r.sets_target as number) ?? 0 }, () => ({ ...legacyTarget })),
    order: (r.order_index as number) ?? 0,
  };
}

function mapSession(r: Row, exerciseLogs: ExerciseLog[]): WorkoutSession {
  return {
    id: r.id as string,
    planId: r.plan_id as string,
    date: r.date as string,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string) ?? undefined,
    exerciseLogs,
    status: r.status as WorkoutSessionStatus,
    pausedAt: (r.paused_at as string) ?? undefined,
    pausedSeconds: (r.paused_seconds as number) ?? 0,
    restStartedAt: (r.rest_started_at as string) ?? undefined,
    restTotalSeconds: (r.rest_total_seconds as number) ?? undefined,
    restPausedAt: (r.rest_paused_at as string) ?? undefined,
    restPausedSeconds: (r.rest_paused_seconds as number) ?? 0,
    selectedExerciseId: (r.selected_exercise_id as string) ?? undefined,
    plannedSnapshot: Array.isArray(r.planned_snapshot)
      ? (r.planned_snapshot as PlannedExercise[])
      : undefined,
    planLineageId: (r.plan_lineage_id as string) ?? undefined,
    planLabel: (r.plan_label as string) ?? undefined,
    restOverrides: (r.rest_overrides as Record<string, number>) ?? {},
  };
}

function mapBodyWeight(r: Row): BodyWeightEntry {
  return { id: r.id as string, date: r.date as string, weight: r.weight as number };
}

export async function fetchState(): Promise<State> {
  const [plansRes, exercisesRes, weeklyRes, sessionsRes, exLogsRes, setLogsRes, weightsRes] =
    await Promise.all([
      supabase.from("workout_plans").select("*").order("order_index"),
      supabase.from("workout_exercises").select("*").order("order_index"),
      supabase.from("workout_weekly_assignment").select("*"),
      supabase.from("workout_sessions").select("*").order("date", { ascending: false }),
      supabase.from("workout_exercise_logs").select("*"),
      supabase.from("workout_set_logs").select("*").order("set_index"),
      supabase.from("workout_body_weights").select("*").order("date", { ascending: false }),
    ]);
  const planRows = unwrap(plansRes);
  const exerciseRows = unwrap(exercisesRes);
  const weeklyRows = unwrap(weeklyRes);
  const sessionRows = unwrap(sessionsRes);
  const exLogRows = unwrap(exLogsRes) as Row[];
  const setLogRows = unwrap(setLogsRes) as Row[];
  const weightRows = unwrap(weightsRes);

  const setLogsByExLog = groupBy(setLogRows, "exercise_log_id");
  const exLogsBySession = groupBy(exLogRows, "session_id");

  const sessions = (sessionRows as Row[]).map((r) => {
    const exLogs = exLogsBySession[r.id as string] ?? [];
    const exerciseLogs: ExerciseLog[] = exLogs.map((el) => ({
      exerciseId: (el.exercise_id as string) ?? null,
      sets: (setLogsByExLog[el.id as string] ?? []).map((s) => ({
        setIndex: s.set_index as number,
        weight: s.weight as number,
        reps: s.reps as number,
      })),
      done: el.done as boolean,
    }));
    return mapSession(r, exerciseLogs);
  });

  const weeklyAssignment: Record<number, string | null> = { ...EMPTY_WEEKLY };
  for (const r of weeklyRows as Row[]) {
    weeklyAssignment[r.weekday as number] = (r.plan_id as string) ?? null;
  }

  return {
    plans: (planRows as Row[]).map(mapPlan),
    exercises: (exerciseRows as Row[]).map(mapExercise),
    sessions,
    weeklyAssignment,
    bodyWeights: (weightRows as Row[]).map(mapBodyWeight),
  };
}

const QUERY_KEY = ["workout-domain"] as const;
function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

/** Carregamento REAL da consulta. Inferir "carregando" de arrays vazios
 * deixaria quem nunca registrou nada preso num esqueleto para sempre. */
export function useWorkoutLoading(): boolean {
  const userId = useSupabaseUserId();
  const { isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return !userId || isLoading;
}

export function useWorkoutStore<T>(selector: (s: State) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return selector(data ?? EMPTY_STATE);
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
export async function createPlan(input: {
  letter: string;
  name: string;
  muscleGroups: string;
}): Promise<string> {
  const userId = await ensureSession();
  const { count } = await supabase
    .from("workout_plans")
    .select("id", { count: "exact", head: true });
  const row = unwrap<{ id: string }>(
    await supabase
      .from("workout_plans")
      .insert({
        user_id: userId,
        letter: input.letter,
        name: input.name,
        muscle_groups: input.muscleGroups,
        order_index: count ?? 0,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

/** Exercícios e a atribuição semanal são apagados em cascata pelo banco. Sessões
 * já registradas são preservadas (não apagadas) — ficam "órfãs" de plano, mas o
 * histórico de treino real não some quando você reorganiza seus treinos. */
export async function removePlan(planId: string) {
  await supabase.from("workout_plans").delete().eq("id", planId);
  await invalidate();
}

export async function addExercise(
  planId: string,
  input: {
    name: string;
    setsTarget: number;
    repsTarget: number;
    loadTarget: number;
    restSeconds: number;
    setTargets?: SetTarget[];
    notes?: string;
    muscleGroup?: MuscleGroup;
    secondaryMuscles?: MuscleGroup[];
    equipment?: ExerciseEquipment;
  },
): Promise<string> {
  const userId = await ensureSession();
  const { count } = await supabase
    .from("workout_exercises")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId);
  const row = unwrap<{ id: string }>(
    await supabase
      .from("workout_exercises")
      .insert({
        user_id: userId,
        plan_id: planId,
        name: input.name,
        sets_target: input.setsTarget,
        reps_target: input.repsTarget,
        load_target: input.loadTarget,
        rest_seconds: input.restSeconds,
        set_targets: input.setTargets ?? null,
        notes: input.notes ?? null,
        muscle_group: input.muscleGroup ?? null,
        secondary_muscles: input.secondaryMuscles ?? [],
        equipment: input.equipment ?? null,
        order_index: count ?? 0,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function updateExercise(
  id: string,
  patch: Partial<
    Pick<
      Exercise,
      | "name"
      | "setsTarget"
      | "repsTarget"
      | "loadTarget"
      | "restSeconds"
      | "setTargets"
      | "notes"
      | "muscleGroup"
      | "secondaryMuscles"
      | "equipment"
    >
  >,
) {
  const dbPatch: Row = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.setsTarget !== undefined) dbPatch.sets_target = patch.setsTarget;
  if (patch.repsTarget !== undefined) dbPatch.reps_target = patch.repsTarget;
  if (patch.loadTarget !== undefined) dbPatch.load_target = patch.loadTarget;
  if (patch.restSeconds !== undefined) dbPatch.rest_seconds = patch.restSeconds;
  if (patch.setTargets !== undefined) dbPatch.set_targets = patch.setTargets;
  if (patch.notes !== undefined) dbPatch.notes = patch.notes;
  if (patch.muscleGroup !== undefined) dbPatch.muscle_group = patch.muscleGroup;
  if (patch.secondaryMuscles !== undefined) dbPatch.secondary_muscles = patch.secondaryMuscles;
  if (patch.equipment !== undefined) dbPatch.equipment = patch.equipment;
  unwrap(await supabase.from("workout_exercises").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

export async function removeExercise(id: string) {
  await supabase.from("workout_exercises").delete().eq("id", id);
  await invalidate();
}

/** Recebe os exercícios do plano (já ordenados) porque não há mais leitura síncrona
 * de estado — mesmo padrão de `redistributeExecution(id, allExecutions)` no core. */
export async function reorderExercise(id: string, direction: "up" | "down", siblings: Exercise[]) {
  const idx = siblings.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= siblings.length) return;
  const a = siblings[idx];
  const b = siblings[swapIdx];
  await Promise.all([
    supabase.from("workout_exercises").update({ order_index: b.order }).eq("id", a.id),
    supabase.from("workout_exercises").update({ order_index: a.order }).eq("id", b.id),
  ]);
  await invalidate();
}

export async function setWeeklyAssignment(weekday: number, planId: string | null) {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("workout_weekly_assignment")
      .upsert({ user_id: userId, weekday, plan_id: planId }, { onConflict: "user_id,weekday" })
      .select()
      .single(),
  );
  await invalidate();
}

/** Começa a sessão de hoje pro treino — se já existir uma sessão hoje pra esse treino,
 * reaproveita (idempotente), mesmo comportamento de antes. */
export async function startSession(planId: string): Promise<string> {
  const userId = await ensureSession();
  const today = todayISO();
  const { data: existing } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("plan_id", planId)
    .eq("date", today)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: planExercises } = await supabase
    .from("workout_exercises")
    .select("*")
    .eq("plan_id", planId)
    .order("order_index");
  const planned = ((planExercises as Row[]) ?? []).map((r) => toPlannedExercise(mapExercise(r)));
  const { data: planRow } = await supabase
    .from("workout_plans")
    .select("lineage_id, letter, name")
    .eq("id", planId)
    .maybeSingle();

  const row = unwrap<{ id: string }>(
    await supabase
      .from("workout_sessions")
      .insert({
        user_id: userId,
        plan_id: planId,
        date: today,
        status: "em_andamento",
        started_at: nowDate().toISOString(),
        planned_snapshot: planned,
        selected_exercise_id: planned[0]?.exerciseId ?? null,
        plan_lineage_id: (planRow?.lineage_id as string) ?? null,
        plan_label: planRow ? `${planRow.letter} · ${planRow.name}` : null,
      })
      .select()
      .single(),
  );
  if (planned.length > 0) {
    unwrap(
      await supabase.from("workout_exercise_logs").insert(
        planned.map((p) => ({
          user_id: userId,
          session_id: row.id,
          exercise_id: p.exerciseId,
          done: false,
        })),
      ),
    );
  }
  await invalidate();
  return row.id;
}

async function patchSession(sessionId: string, patch: Row) {
  unwrap(
    await supabase.from("workout_sessions").update(patch).eq("id", sessionId).select().single(),
  );
  await invalidate();
}

/** Segundos de pausa a acumular ao retomar — o tempo desde que pausou. */
function pausedSince(iso: string): number {
  return Math.max(0, Math.round((nowMs() - new Date(iso).getTime()) / 1000));
}

export async function pauseSession(session: WorkoutSession) {
  if (session.pausedAt) return;
  await patchSession(session.id, { paused_at: nowDate().toISOString() });
}

export async function resumeSession(session: WorkoutSession) {
  if (!session.pausedAt) return;
  await patchSession(session.id, {
    paused_at: null,
    paused_seconds: session.pausedSeconds + pausedSince(session.pausedAt),
  });
}

/** Sem `invalidate()` de propósito: qual exercício o painel mostra é estado de
 * interface, e refazer todas as queries do domínio a cada seta pressionada
 * faria a tela inteira piscar. A gravação serve só pra reabrir o app no mesmo
 * exercício depois de um reload. */
export async function selectExercise(sessionId: string, exerciseId: string) {
  await supabase
    .from("workout_sessions")
    .update({ selected_exercise_id: exerciseId })
    .eq("id", sessionId);
}

/** Começa (ou reinicia) o descanso com a duração daquela série. */
export async function startRest(sessionId: string, seconds: number) {
  if (seconds <= 0) return;
  await patchSession(sessionId, {
    rest_started_at: nowDate().toISOString(),
    rest_total_seconds: Math.min(MAX_REST_SECONDS, Math.round(seconds)),
    rest_paused_at: null,
    rest_paused_seconds: 0,
  });
}

export async function pauseRest(session: WorkoutSession) {
  if (!session.restStartedAt || session.restPausedAt) return;
  await patchSession(session.id, { rest_paused_at: nowDate().toISOString() });
}

export async function resumeRest(session: WorkoutSession) {
  if (!session.restPausedAt) return;
  await patchSession(session.id, {
    rest_paused_at: null,
    rest_paused_seconds: session.restPausedSeconds + pausedSince(session.restPausedAt),
  });
}

/** Encerra o descanso. Mexe só no descanso — nenhuma série registrada é tocada. */
export async function clearRest(sessionId: string) {
  await patchSession(sessionId, {
    rest_started_at: null,
    rest_total_seconds: null,
    rest_paused_at: null,
    rest_paused_seconds: 0,
  });
}

/** Volta o descanso para a duração-base e o deixa PARADO, pronto para o Play.
 * Marcar o início e a pausa no mesmo instante congela o relógio no cheio — é o
 * mesmo cálculo de sempre, sem um estado paralelo só para "reiniciado". */
export async function resetRest(sessionId: string, base: number) {
  const iso = nowDate().toISOString();
  await patchSession(sessionId, {
    rest_started_at: iso,
    rest_total_seconds: Math.max(1, Math.round(base)),
    rest_paused_at: iso,
    rest_paused_seconds: 0,
  });
}

/** Grava a escolha de descanso feita na hora para um exercício. Vale só nesta
 * sessão: a ficha permanente do treino não é tocada. */
export async function setRestOverride(
  session: WorkoutSession,
  exerciseId: string,
  seconds: number,
) {
  const safe = Math.max(1, Math.min(MAX_REST_SECONDS, Math.round(seconds)));
  await patchSession(session.id, {
    rest_overrides: { ...session.restOverrides, [exerciseId]: safe },
  });
}

/** Autocura: se por algum motivo a sessão não tiver o log deste exercício (ex.: exercício
 * adicionado ao treino depois da sessão já ter começado), cria na hora em vez de travar
 * "Finalizar treino" pra sempre num loading que nunca resolve. */
async function findExerciseLogId(sessionId: string, exerciseId: string): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("workout_exercise_logs")
      .upsert(
        { user_id: userId, session_id: sessionId, exercise_id: exerciseId },
        { onConflict: "session_id,exercise_id", ignoreDuplicates: false },
      )
      .select("id")
      .single(),
  );
  return row.id;
}

export async function logSet(sessionId: string, exerciseId: string, weight: number, reps: number) {
  const userId = await ensureSession();
  const exerciseLogId = await findExerciseLogId(sessionId, exerciseId);
  const { count } = await supabase
    .from("workout_set_logs")
    .select("id", { count: "exact", head: true })
    .eq("exercise_log_id", exerciseLogId);
  unwrap(
    await supabase
      .from("workout_set_logs")
      .insert({
        user_id: userId,
        exercise_log_id: exerciseLogId,
        set_index: count ?? 0,
        weight,
        reps,
      })
      .select()
      .single(),
  );
  await invalidate();
}

export async function updateSet(
  sessionId: string,
  exerciseId: string,
  setIndex: number,
  patch: { weight?: number; reps?: number },
) {
  const exerciseLogId = await findExerciseLogId(sessionId, exerciseId);
  const dbPatch: Row = {};
  if (patch.weight !== undefined) dbPatch.weight = patch.weight;
  if (patch.reps !== undefined) dbPatch.reps = patch.reps;
  unwrap(
    await supabase
      .from("workout_set_logs")
      .update(dbPatch)
      .eq("exercise_log_id", exerciseLogId)
      .eq("set_index", setIndex)
      .select()
      .single(),
  );
  await invalidate();
}

export async function removeLastSet(sessionId: string, exerciseId: string) {
  const exerciseLogId = await findExerciseLogId(sessionId, exerciseId);
  const { data: sets } = await supabase
    .from("workout_set_logs")
    .select("id, set_index")
    .eq("exercise_log_id", exerciseLogId)
    .order("set_index", { ascending: false })
    .limit(1);
  if (sets && sets.length > 0) {
    await supabase
      .from("workout_set_logs")
      .delete()
      .eq("id", sets[0].id as string);
    await invalidate();
  }
}

export async function completeExerciseLog(sessionId: string, exerciseId: string) {
  const exerciseLogId = await findExerciseLogId(sessionId, exerciseId);
  unwrap(
    await supabase
      .from("workout_exercise_logs")
      .update({ done: true })
      .eq("id", exerciseLogId)
      .select()
      .single(),
  );
  await invalidate();
}

/** Finaliza sem promover nada: um exercício com 2 de 4 séries continua parcial,
 * e um sem série nenhuma continua não realizado. */
export async function finishSession(sessionId: string) {
  // Resolve a pausa aberta antes de fechar. Se `paused_at` ficasse preenchido,
  // a duração da sessão encolheria a cada vez que o resumo fosse aberto — o
  // cálculo mede a pausa ativa contra o relógio de agora.
  const { data: current } = await supabase
    .from("workout_sessions")
    .select("paused_at, paused_seconds")
    .eq("id", sessionId)
    .maybeSingle();
  const pausedAt = (current?.paused_at as string) ?? null;
  unwrap(
    await supabase
      .from("workout_sessions")
      .update({
        status: "concluido",
        finished_at: nowDate().toISOString(),
        paused_at: null,
        paused_seconds:
          ((current?.paused_seconds as number) ?? 0) + (pausedAt ? pausedSince(pausedAt) : 0),
        rest_started_at: null,
        rest_total_seconds: null,
        rest_paused_at: null,
        rest_paused_seconds: 0,
      })
      .eq("id", sessionId)
      .select()
      .single(),
  );
  await invalidate();
}

/** Um registro por dia — se já existir um pra hoje, atualiza em vez de duplicar
 * (tabela não tem unique constraint em (user_id,date), então o dedup é feito aqui). */
export async function addBodyWeight(weight: number) {
  const userId = await ensureSession();
  const iso = todayISO();
  const { data: existing } = await supabase
    .from("workout_body_weights")
    .select("id")
    .eq("date", iso)
    .maybeSingle();
  if (existing) {
    unwrap(
      await supabase
        .from("workout_body_weights")
        .update({ weight })
        .eq("id", existing.id as string)
        .select()
        .single(),
    );
  } else {
    unwrap(
      await supabase
        .from("workout_body_weights")
        .insert({ user_id: userId, date: iso, weight })
        .select()
        .single(),
    );
  }
  await invalidate();
}
