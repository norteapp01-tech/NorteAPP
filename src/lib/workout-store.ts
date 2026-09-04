import { useQuery } from "@tanstack/react-query";
import { todayISO } from "./goals-store";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { nowDate } from "./test-clock";

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
  };
}

function mapExercise(r: Row): Exercise {
  return {
    id: r.id as string,
    planId: r.plan_id as string,
    name: r.name as string,
    setsTarget: (r.sets_target as number) ?? 0,
    repsTarget: (r.reps_target as number) ?? 0,
    loadTarget: (r.load_target as number) ?? 0,
    restSeconds: (r.rest_seconds as number) ?? 60,
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
  };
}

function mapBodyWeight(r: Row): BodyWeightEntry {
  return { id: r.id as string, date: r.date as string, weight: r.weight as number };
}

async function fetchState(): Promise<State> {
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
      exerciseId: el.exercise_id as string,
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
    Pick<Exercise, "name" | "setsTarget" | "repsTarget" | "loadTarget" | "restSeconds">
  >,
) {
  const dbPatch: Row = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.setsTarget !== undefined) dbPatch.sets_target = patch.setsTarget;
  if (patch.repsTarget !== undefined) dbPatch.reps_target = patch.repsTarget;
  if (patch.loadTarget !== undefined) dbPatch.load_target = patch.loadTarget;
  if (patch.restSeconds !== undefined) dbPatch.rest_seconds = patch.restSeconds;
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

  const row = unwrap<{ id: string }>(
    await supabase
      .from("workout_sessions")
      .insert({ user_id: userId, plan_id: planId, date: today, status: "em_andamento" })
      .select()
      .single(),
  );
  const { data: planExercises } = await supabase
    .from("workout_exercises")
    .select("id")
    .eq("plan_id", planId);
  if (planExercises && planExercises.length > 0) {
    unwrap(
      await supabase.from("workout_exercise_logs").insert(
        planExercises.map((e) => ({
          user_id: userId,
          session_id: row.id,
          exercise_id: e.id as string,
          done: false,
        })),
      ),
    );
  }
  await invalidate();
  return row.id;
}

async function findExerciseLogId(sessionId: string, exerciseId: string): Promise<string> {
  const row = unwrap<{ id: string }>(
    await supabase
      .from("workout_exercise_logs")
      .select("id")
      .eq("session_id", sessionId)
      .eq("exercise_id", exerciseId)
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

export async function finishSession(sessionId: string) {
  unwrap(
    await supabase
      .from("workout_sessions")
      .update({ status: "concluido", finished_at: nowDate().toISOString() })
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
