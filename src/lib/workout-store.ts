import { useSyncExternalStore } from "react";
import { toISODate, todayISO, addDays } from "./goals-store";

// ---------------------------------------------------------------------------
// Diário de treino da Academia — domínio auto-contido, mesmo padrão reativo
// do goals-store.ts. Treino (A/B/C...) -> Exercícios -> Sessões (série a série).
// ---------------------------------------------------------------------------

export type WorkoutPlan = {
  id: string;
  letter: string;
  name: string;
  muscleGroups: string;
  order: number;
};

export type Exercise = {
  id: string;
  planId: string;
  name: string;
  setsTarget: number;
  repsTarget: number;
  loadTarget: number;
  restSeconds: number;
  order: number;
};

export type SetLog = { setIndex: number; weight: number; reps: number };
export type ExerciseLog = { exerciseId: string; sets: SetLog[]; done: boolean };
export type WorkoutSessionStatus = "em_andamento" | "concluido";
export type WorkoutSession = {
  id: string;
  planId: string;
  date: string; // YYYY-MM-DD
  startedAt: string;
  finishedAt?: string;
  exerciseLogs: ExerciseLog[];
  status: WorkoutSessionStatus;
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

let seq = 0;
function genId(prefix: string) {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

// ---------------------------------------------------------------------------
// Seletores puros
// ---------------------------------------------------------------------------
export function exercisesForPlan(exercises: Exercise[], planId: string): Exercise[] {
  return exercises.filter((e) => e.planId === planId).sort((a, b) => a.order - b.order);
}

export function todaysPlanId(weeklyAssignment: Record<number, string | null>): string | null {
  return weeklyAssignment[new Date().getDay()] ?? null;
}

export function sessionForToday(
  sessions: WorkoutSession[],
  planId: string,
): WorkoutSession | undefined {
  const iso = todayISO();
  return sessions.find((s) => s.date === iso && s.planId === planId);
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

export function previousFinishedSession(
  sessions: WorkoutSession[],
  planId: string,
  beforeSessionId: string,
): WorkoutSession | undefined {
  const current = sessions.find((s) => s.id === beforeSessionId);
  if (!current) return undefined;
  return sessions
    .filter(
      (s) =>
        s.planId === planId &&
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
  deltaWeightVsPrevious?: number;
};

export function sessionSummary(
  session: WorkoutSession,
  previous: WorkoutSession | undefined,
  exercises: Exercise[],
): { exercises: ExerciseSummary[]; totalSets: number; completedExercises: number } {
  const rows: ExerciseSummary[] = [];
  let totalSets = 0;
  let completedExercises = 0;
  for (const log of session.exerciseLogs) {
    if (log.sets.length === 0) continue;
    const ex = exercises.find((e) => e.id === log.exerciseId);
    if (!ex) continue;
    totalSets += log.sets.length;
    if (log.done) completedExercises += 1;
    const best = log.sets.reduce((a, b) => (b.weight > a.weight ? b : a), log.sets[0]);
    const prevLog = previous?.exerciseLogs.find((l) => l.exerciseId === log.exerciseId);
    const prevBest = prevLog?.sets.length
      ? Math.max(...prevLog.sets.map((s) => s.weight))
      : undefined;
    rows.push({
      exerciseId: ex.id,
      name: ex.name,
      setsCount: log.sets.length,
      maxWeight: best.weight,
      repsAtMaxWeight: best.reps,
      targetWeight: ex.loadTarget,
      targetReps: ex.repsTarget,
      deltaWeightVsPrevious: prevBest !== undefined ? best.weight - prevBest : undefined,
    });
  }
  return { exercises: rows, totalSets, completedExercises };
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
function buildSeedState(): State {
  const now = new Date();
  let order = 0;
  const plans: WorkoutPlan[] = [
    {
      id: "wpA",
      letter: "A",
      name: "Peito + Tríceps",
      muscleGroups: "Peito, tríceps, ombro",
      order: order++,
    },
    {
      id: "wpB",
      letter: "B",
      name: "Costas + Bíceps",
      muscleGroups: "Costas, bíceps",
      order: order++,
    },
    {
      id: "wpC",
      letter: "C",
      name: "Pernas",
      muscleGroups: "Quadríceps, posterior, glúteo",
      order: order++,
    },
  ];

  const exOrder: Record<string, number> = {};
  const nextOrder = (planId: string) => (exOrder[planId] = (exOrder[planId] ?? -1) + 1);
  const exercise = (
    planId: string,
    name: string,
    setsTarget: number,
    repsTarget: number,
    loadTarget: number,
    restSeconds = 90,
  ): Exercise => ({
    id: genId("wex"),
    planId,
    name,
    setsTarget,
    repsTarget,
    loadTarget,
    restSeconds,
    order: nextOrder(planId),
  });

  const exercises: Exercise[] = [
    exercise("wpA", "Supino reto", 4, 10, 70, 90),
    exercise("wpA", "Supino inclinado", 4, 10, 60, 90),
    exercise("wpA", "Tríceps corda", 3, 15, 25, 60),
    exercise("wpB", "Puxada alta", 4, 10, 55, 90),
    exercise("wpB", "Remada baixa", 4, 10, 50, 90),
    exercise("wpB", "Rosca direta", 3, 12, 16, 60),
    exercise("wpB", "Rosca martelo", 3, 12, 14, 60),
    exercise("wpC", "Agachamento", 4, 10, 80, 120),
    exercise("wpC", "Leg press", 4, 12, 120, 90),
    exercise("wpC", "Cadeira extensora", 3, 15, 40, 60),
  ];

  const weeklyAssignment: Record<number, string | null> = {
    0: null, // domingo
    1: "wpA",
    2: "wpB",
    3: null,
    4: "wpA",
    5: "wpB",
    6: "wpC",
  };

  // Histórico das últimas semanas, com progressão real de carga (pra Sparkline/resumo não nascerem vazios).
  const sessions: WorkoutSession[] = [];
  const seedSession = (
    planId: string,
    dayOffset: number,
    weights: Record<string, { weight: number; reps: number }[]>,
  ) => {
    const date = toISODate(addDays(now, -dayOffset));
    const exerciseLogs: ExerciseLog[] = Object.entries(weights).map(([exerciseId, sets]) => ({
      exerciseId,
      sets: sets.map((s, i) => ({ setIndex: i, weight: s.weight, reps: s.reps })),
      done: true,
    }));
    sessions.push({
      id: genId("wsess"),
      planId,
      date,
      startedAt: new Date(addDays(now, -dayOffset)).toISOString(),
      finishedAt: new Date(addDays(now, -dayOffset)).toISOString(),
      exerciseLogs,
      status: "concluido",
    });
  };
  const [supinoReto, supinoInclinado, tricepsCorda] = exercises
    .filter((e) => e.planId === "wpA")
    .map((e) => e.id);
  const [puxadaAlta, remadaBaixa, roscaDireta, roscaMartelo] = exercises
    .filter((e) => e.planId === "wpB")
    .map((e) => e.id);

  seedSession("wpA", 24, {
    [supinoReto]: [
      { weight: 60, reps: 10 },
      { weight: 60, reps: 10 },
      { weight: 60, reps: 9 },
      { weight: 55, reps: 10 },
    ],
    [supinoInclinado]: [
      { weight: 50, reps: 10 },
      { weight: 50, reps: 10 },
      { weight: 50, reps: 9 },
      { weight: 45, reps: 10 },
    ],
    [tricepsCorda]: [
      { weight: 20, reps: 15 },
      { weight: 20, reps: 14 },
      { weight: 20, reps: 13 },
    ],
  });
  seedSession("wpA", 10, {
    [supinoReto]: [
      { weight: 65, reps: 10 },
      { weight: 65, reps: 10 },
      { weight: 65, reps: 9 },
      { weight: 60, reps: 10 },
    ],
    [supinoInclinado]: [
      { weight: 55, reps: 10 },
      { weight: 55, reps: 9 },
      { weight: 55, reps: 9 },
      { weight: 50, reps: 10 },
    ],
    [tricepsCorda]: [
      { weight: 22, reps: 15 },
      { weight: 22, reps: 14 },
      { weight: 22, reps: 13 },
    ],
  });
  seedSession("wpB", 21, {
    [puxadaAlta]: [
      { weight: 50, reps: 10 },
      { weight: 50, reps: 10 },
      { weight: 50, reps: 9 },
      { weight: 45, reps: 10 },
    ],
    [remadaBaixa]: [
      { weight: 45, reps: 10 },
      { weight: 45, reps: 10 },
      { weight: 45, reps: 9 },
      { weight: 40, reps: 10 },
    ],
    [roscaDireta]: [
      { weight: 14, reps: 12 },
      { weight: 14, reps: 12 },
      { weight: 14, reps: 10 },
    ],
    [roscaMartelo]: [
      { weight: 12, reps: 12 },
      { weight: 12, reps: 12 },
      { weight: 12, reps: 11 },
    ],
  });
  seedSession("wpB", 7, {
    [puxadaAlta]: [
      { weight: 55, reps: 10 },
      { weight: 55, reps: 10 },
      { weight: 55, reps: 9 },
      { weight: 50, reps: 10 },
    ],
    [remadaBaixa]: [
      { weight: 50, reps: 10 },
      { weight: 50, reps: 10 },
      { weight: 50, reps: 9 },
      { weight: 45, reps: 10 },
    ],
    [roscaDireta]: [
      { weight: 16, reps: 12 },
      { weight: 16, reps: 12 },
      { weight: 16, reps: 10 },
    ],
    [roscaMartelo]: [
      { weight: 14, reps: 12 },
      { weight: 14, reps: 12 },
      { weight: 14, reps: 11 },
    ],
  });

  const bodyWeights: BodyWeightEntry[] = [
    { id: genId("bw"), date: toISODate(addDays(now, -28)), weight: 80.0 },
    { id: genId("bw"), date: toISODate(addDays(now, -14)), weight: 79.1 },
    { id: genId("bw"), date: toISODate(addDays(now, -3)), weight: 78.4 },
  ];

  return { plans, exercises, sessions, weeklyAssignment, bodyWeights };
}

// ---------------------------------------------------------------------------
// Store reativo
// ---------------------------------------------------------------------------
let state: State = buildSeedState();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

function set(updater: (s: State) => State) {
  state = updater(state);
  emit();
}

export function useWorkoutStore<T>(selector: (s: State) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector(snap);
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
export function createPlan(input: { letter: string; name: string; muscleGroups: string }): string {
  const id = genId("wp");
  set((s) => ({
    ...s,
    plans: [
      ...s.plans,
      {
        id,
        letter: input.letter,
        name: input.name,
        muscleGroups: input.muscleGroups,
        order: s.plans.length,
      },
    ],
  }));
  return id;
}

export function removePlan(planId: string) {
  set((s) => ({
    ...s,
    plans: s.plans.filter((p) => p.id !== planId),
    exercises: s.exercises.filter((e) => e.planId !== planId),
    weeklyAssignment: Object.fromEntries(
      Object.entries(s.weeklyAssignment).map(([day, pid]) => [day, pid === planId ? null : pid]),
    ),
  }));
}

export function addExercise(
  planId: string,
  input: {
    name: string;
    setsTarget: number;
    repsTarget: number;
    loadTarget: number;
    restSeconds: number;
  },
): string {
  const id = genId("wex");
  set((s) => {
    const order = s.exercises.filter((e) => e.planId === planId).length;
    return { ...s, exercises: [...s.exercises, { id, planId, order, ...input }] };
  });
  return id;
}

export function updateExercise(
  id: string,
  patch: Partial<
    Pick<Exercise, "name" | "setsTarget" | "repsTarget" | "loadTarget" | "restSeconds">
  >,
) {
  set((s) => ({ ...s, exercises: s.exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
}

export function removeExercise(id: string) {
  set((s) => ({ ...s, exercises: s.exercises.filter((e) => e.id !== id) }));
}

export function reorderExercise(id: string, direction: "up" | "down") {
  set((s) => {
    const ex = s.exercises.find((e) => e.id === id);
    if (!ex) return s;
    const siblings = exercisesForPlan(s.exercises, ex.planId);
    const idx = siblings.findIndex((e) => e.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return s;
    const other = siblings[swapIdx];
    return {
      ...s,
      exercises: s.exercises.map((e) => {
        if (e.id === ex.id) return { ...e, order: other.order };
        if (e.id === other.id) return { ...e, order: ex.order };
        return e;
      }),
    };
  });
}

export function setWeeklyAssignment(weekday: number, planId: string | null) {
  set((s) => ({ ...s, weeklyAssignment: { ...s.weeklyAssignment, [weekday]: planId } }));
}

/** Começa a sessão de hoje pro treino — se já existir uma sessão hoje pra esse treino, reaproveita (idempotente). */
export function startSession(planId: string): string {
  const existing = sessionForToday(state.sessions, planId);
  if (existing) return existing.id;
  const id = genId("wsess");
  set((s) => {
    const exerciseLogs: ExerciseLog[] = exercisesForPlan(s.exercises, planId).map((e) => ({
      exerciseId: e.id,
      sets: [],
      done: false,
    }));
    const session: WorkoutSession = {
      id,
      planId,
      date: todayISO(),
      startedAt: new Date().toISOString(),
      exerciseLogs,
      status: "em_andamento",
    };
    return { ...s, sessions: [session, ...s.sessions] };
  });
  return id;
}

export function logSet(sessionId: string, exerciseId: string, weight: number, reps: number) {
  set((s) => ({
    ...s,
    sessions: s.sessions.map((sess) => {
      if (sess.id !== sessionId) return sess;
      return {
        ...sess,
        exerciseLogs: sess.exerciseLogs.map((log) =>
          log.exerciseId === exerciseId
            ? { ...log, sets: [...log.sets, { setIndex: log.sets.length, weight, reps }] }
            : log,
        ),
      };
    }),
  }));
}

export function updateSet(
  sessionId: string,
  exerciseId: string,
  setIndex: number,
  patch: { weight?: number; reps?: number },
) {
  set((s) => ({
    ...s,
    sessions: s.sessions.map((sess) => {
      if (sess.id !== sessionId) return sess;
      return {
        ...sess,
        exerciseLogs: sess.exerciseLogs.map((log) =>
          log.exerciseId === exerciseId
            ? {
                ...log,
                sets: log.sets.map((set) =>
                  set.setIndex === setIndex ? { ...set, ...patch } : set,
                ),
              }
            : log,
        ),
      };
    }),
  }));
}

export function removeLastSet(sessionId: string, exerciseId: string) {
  set((s) => ({
    ...s,
    sessions: s.sessions.map((sess) => {
      if (sess.id !== sessionId) return sess;
      return {
        ...sess,
        exerciseLogs: sess.exerciseLogs.map((log) =>
          log.exerciseId === exerciseId ? { ...log, sets: log.sets.slice(0, -1) } : log,
        ),
      };
    }),
  }));
}

export function completeExerciseLog(sessionId: string, exerciseId: string) {
  set((s) => ({
    ...s,
    sessions: s.sessions.map((sess) =>
      sess.id === sessionId
        ? {
            ...sess,
            exerciseLogs: sess.exerciseLogs.map((log) =>
              log.exerciseId === exerciseId ? { ...log, done: true } : log,
            ),
          }
        : sess,
    ),
  }));
}

export function finishSession(sessionId: string) {
  set((s) => ({
    ...s,
    sessions: s.sessions.map((sess) =>
      sess.id === sessionId
        ? { ...sess, status: "concluido", finishedAt: new Date().toISOString() }
        : sess,
    ),
  }));
}

export function addBodyWeight(weight: number) {
  set((s) => {
    const iso = todayISO();
    const existing = s.bodyWeights.find((b) => b.date === iso);
    if (existing) {
      return {
        ...s,
        bodyWeights: s.bodyWeights.map((b) => (b.date === iso ? { ...b, weight } : b)),
      };
    }
    return { ...s, bodyWeights: [{ id: genId("bw"), date: iso, weight }, ...s.bodyWeights] };
  });
}
