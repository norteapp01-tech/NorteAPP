import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ensureSession, supabase, useSupabaseUserId } from "../supabase/client";
import { queryClient } from "../query-client";
import { dateAndTimeInZone, getAppTimeZone } from "../app-time-zone";
import { addDaysISO } from "../agenda-intervals";
import { todayISO } from "../goals-store";
import { getProfileWeekStart, useProfile } from "../profile-store";
import {
  eachDay,
  endOfPeriod,
  indexLogs,
  startOfPeriod,
  versionAt,
  type EvalContext,
  type LogIndex,
} from "./engine";
import { DEFAULT_POMODORO, measuredSeconds } from "./timer";
import {
  firesTrigger,
  goalOutcome,
  reminderOccurrences,
  scheduleAt,
  targetNeedsReminder,
  transitionOf,
  type QuietHours,
} from "./effects";
import { enqueue, flushOutbox, readOutbox, type OutboxOp } from "./outbox";
import type {
  Chain,
  ChecklistItem,
  EndCondition,
  Feeling,
  GoalPeriod,
  Habit,
  HabitLog,
  HabitModule,
  HabitReminder,
  HabitTimer,
  HabitVersion,
  Intent,
  LogSource,
  LogStatus,
  Measure,
  ModuleMetric,
  Pause,
  PomodoroConfig,
  Reflection,
  Schedule,
  TimeOfDay,
  TimerMode,
} from "./types";

// ---------------------------------------------------------------------------
// Dados das rotinas. Tudo que muda o estado passa por aqui — e por isso todas
// as superfícies (Hoje, Rotinas, Espelho, agente) enxergam o mesmo registro.
//
// Duas consultas:
//  * `habits-core`: rotinas + versões + pausas + encadeamentos + lembretes +
//    timer. Pequena, sempre completa.
//  * `habit-logs`: registros de uma janela de datas, com paginação — nunca
//    truncada em silêncio (cada página é de 1.000 linhas e o laço continua até
//    acabar).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export const HABITS_KEY = ["habits-core"] as const;
export const LOGS_KEY = ["habit-logs"] as const;
export const REFLECTIONS_KEY = ["habit-reflections"] as const;

const PAGE = 1000;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------------------------------------------------------------------------
// Mapeamento
// ---------------------------------------------------------------------------

const opt = <T>(v: unknown): T | undefined =>
  v === null || v === undefined ? undefined : (v as T);

function mapVersion(r: Row): HabitVersion {
  return {
    id: r.id as string,
    habitId: r.habit_id as string,
    effectiveFrom: r.effective_from as string,
    goalValue: Number(r.goal_value),
    goalPeriod: r.goal_period as GoalPeriod,
    schedule: r.schedule as Schedule,
    flexible: Boolean(r.flexible),
    timesOfDay: (r.times_of_day as TimeOfDay[]) ?? [],
    checklist: (r.checklist as ChecklistItem[]) ?? [],
  };
}

function mapHabit(r: Row, versions: HabitVersion[]): Habit {
  return {
    id: r.id as string,
    name: r.name as string,
    icon: opt(r.icon),
    color: opt(r.color),
    area: opt(r.area),
    intent: r.intent as Intent,
    measure: r.measure as Measure,
    unit: opt(r.unit),
    startDate: r.start_date as string,
    endCondition: opt<EndCondition>(r.end_condition),
    goalId: opt(r.goal_id),
    stepId: opt(r.step_id),
    labelId: opt(r.label_id),
    category: opt(r.category),
    module: opt<HabitModule>(r.module),
    moduleMetric: opt<ModuleMetric>(r.module_metric),
    position: Number(r.position ?? 0),
    archivedAt: opt(r.archived_at),
    createdAt: r.created_at as string,
    versions,
  };
}

export function mapLog(r: Row): HabitLog {
  return {
    id: r.id as string,
    habitId: r.habit_id as string,
    localDate: r.local_date as string,
    occurredAt: r.occurred_at as string,
    timeZone: opt(r.time_zone),
    status: r.status as LogStatus,
    value: Number(r.value),
    durationSeconds: opt<number>(r.duration_seconds),
    note: (r.note as string) ?? "",
    reason: opt(r.reason),
    feeling: opt<Feeling>(r.feeling),
    checks: (r.checks as string[]) ?? [],
    source: r.source as LogSource,
    sourceRef: opt(r.source_ref),
    deletedAt: opt(r.deleted_at),
  };
}

function mapPause(r: Row): Pause {
  return {
    id: r.id as string,
    scope: r.scope as Pause["scope"],
    habitId: opt(r.habit_id),
    area: opt(r.area),
    startDate: r.start_date as string,
    endDate: opt(r.end_date),
    reason: opt(r.reason),
  };
}

function mapTimer(r: Row): HabitTimer {
  return {
    id: r.id as string,
    habitId: r.habit_id as string,
    mode: r.mode as TimerMode,
    state: r.state as HabitTimer["state"],
    startedAt: r.started_at as string,
    accumulatedSeconds: Number(r.accumulated_seconds),
    targetSeconds: opt<number>(r.target_seconds),
    pomodoro: opt<PomodoroConfig>(r.pomodoro),
    deviceId: opt(r.device_id),
    createdAt: opt(r.created_at),
    revision: Number(r.revision ?? 0),
  };
}

function mapChain(r: Row): Chain {
  return {
    id: r.id as string,
    baseHabitId: r.base_habit_id as string,
    targetHabitId: r.target_habit_id as string,
    trigger: r.trigger_status as Chain["trigger"],
    delayMinutes: Number(r.delay_minutes),
  };
}

function mapReminder(r: Row): HabitReminder {
  return {
    id: r.id as string,
    habitId: r.habit_id as string,
    time: r.time as string,
    weekdays: (r.weekdays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
    enabled: Boolean(r.enabled),
  };
}

function mapReflection(r: Row): Reflection {
  return {
    id: r.id as string,
    localDate: r.local_date as string,
    habitId: opt(r.habit_id),
    mood: opt<Reflection["mood"]>(r.mood),
    note: (r.note as string) ?? "",
    createdAt: r.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type HabitsCore = {
  habits: Habit[];
  pauses: Pause[];
  chains: Chain[];
  reminders: HabitReminder[];
  timer: HabitTimer | null;
};

export async function fetchCore(): Promise<HabitsCore> {
  const [h, v, p, c, r, t] = await Promise.all([
    supabase.from("habits").select("*").order("position").order("created_at"),
    supabase.from("habit_versions").select("*").order("effective_from"),
    supabase.from("habit_pauses").select("*").order("start_date"),
    supabase.from("habit_chains").select("*"),
    supabase.from("habit_reminders").select("*"),
    supabase.from("habit_timers").select("*").maybeSingle(),
  ]);
  const versions = unwrap(v) as Row[];
  const byHabit = new Map<string, HabitVersion[]>();
  for (const row of versions) {
    const mapped = mapVersion(row);
    const list = byHabit.get(mapped.habitId);
    if (list) list.push(mapped);
    else byHabit.set(mapped.habitId, [mapped]);
  }
  return {
    habits: (unwrap(h) as Row[]).map((row) => mapHabit(row, byHabit.get(row.id as string) ?? [])),
    pauses: (unwrap(p) as Row[]).map(mapPause),
    chains: (unwrap(c) as Row[]).map(mapChain),
    reminders: (unwrap(r) as Row[]).map(mapReminder),
    timer: t.data ? mapTimer(t.data as Row) : null,
  };
}

const EMPTY_CORE: HabitsCore = { habits: [], pauses: [], chains: [], reminders: [], timer: null };

export function useHabitsCore() {
  const userId = useSupabaseUserId();
  const q = useQuery({ queryKey: HABITS_KEY, queryFn: fetchCore, enabled: !!userId });
  // Fila de módulos e lembretes: ao abrir o app com a sessão pronta.
  useEffect(() => {
    if (!userId) return;
    const stop = startOutboxWorker(userId);
    scheduleReminderReconcile();
    return stop;
  }, [userId]);
  return {
    ...(q.data ?? EMPTY_CORE),
    loading: !!userId && q.isLoading,
    error: q.error as Error | null,
    retry: () => void q.refetch(),
  };
}

/** Todas as páginas de registros da janela [from, to] (nunca truncada). */
export async function fetchLogs(from: string, to: string, habitId?: string): Promise<HabitLog[]> {
  const out: HabitLog[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("habit_logs")
      .select("*")
      .is("deleted_at", null)
      .gte("local_date", from)
      .lte("local_date", to)
      .order("local_date")
      .order("occurred_at")
      .range(offset, offset + PAGE - 1);
    if (habitId) q = q.eq("habit_id", habitId);
    const rows = unwrap(await q) as Row[];
    out.push(...rows.map(mapLog));
    if (rows.length < PAGE) break;
  }
  return out;
}

export function useHabitLogs(from: string, to: string, habitId?: string) {
  const userId = useSupabaseUserId();
  const q = useQuery({
    queryKey: [...LOGS_KEY, habitId ?? "all", from, to],
    queryFn: () => fetchLogs(from, to, habitId),
    enabled: !!userId,
  });
  return {
    logs: q.data ?? [],
    loading: !!userId && q.isLoading,
    error: q.error as Error | null,
    retry: () => void q.refetch(),
  };
}

/** Uma página do histórico (mais recentes primeiro), com edição e origem. */
export async function fetchHistoryPage(
  habitId: string,
  page: number,
  size = 30,
): Promise<{ rows: HabitLog[]; hasMore: boolean }> {
  const rows = unwrap(
    await supabase
      .from("habit_logs")
      .select("*")
      .eq("habit_id", habitId)
      .is("deleted_at", null)
      .order("local_date", { ascending: false })
      .order("occurred_at", { ascending: false })
      .range(page * size, page * size + size),
  ) as Row[];
  return { rows: rows.slice(0, size).map(mapLog), hasMore: rows.length > size };
}

export async function fetchAllLogs(habitId: string): Promise<HabitLog[]> {
  return fetchLogs("2000-01-01", "2100-01-01", habitId);
}

// ---------------------------------------------------------------------------
// Janela de registros e contexto de avaliação para as telas
// ---------------------------------------------------------------------------

/** Começo da janela de registros necessária para avaliar HOJE: o maior período
 * de meta (semana/mês/ano) entre as rotinas, e no mínimo 5 semanas para a grade. */
export function windowStart(habits: Habit[], today: string, weekStart: 0 | 1): string {
  let from = addDaysISO(startOfPeriod(today, "week", weekStart), -28);
  for (const h of habits) {
    const v = versionAt(h, today);
    if (!v || h.archivedAt) continue;
    if (v.goalPeriod === "month" || v.goalPeriod === "year") {
      const s = startOfPeriod(today, v.goalPeriod, weekStart);
      if (s < from) from = s;
    }
  }
  return from;
}

export type HabitData = {
  ctx: EvalContext;
  habits: Habit[];
  pauses: Pause[];
  chains: Chain[];
  reminders: HabitReminder[];
  timer: HabitTimer | null;
  logs: HabitLog[];
  indexes: Map<string, LogIndex>;
  loading: boolean;
  error: Error | null;
  retry: () => void;
};

export function useHabitData(): HabitData {
  const core = useHabitsCore();
  const profile = useProfile();
  const today = todayISO();
  const weekStart: 0 | 1 = profile.weekStart === "sunday" ? 0 : 1;
  const from = useMemo(
    () => windowStart(core.habits, today, weekStart),
    [core.habits, today, weekStart],
  );
  const logs = useHabitLogs(from, today);
  const indexes = useMemo(() => {
    const byHabit = new Map<string, HabitLog[]>();
    for (const l of logs.logs) {
      const list = byHabit.get(l.habitId);
      if (list) list.push(l);
      else byHabit.set(l.habitId, [l]);
    }
    return new Map([...byHabit.entries()].map(([id, list]) => [id, indexLogs(list)]));
  }, [logs.logs]);
  const ctx = useMemo<EvalContext>(
    () => ({ today, weekStart, pauses: core.pauses }),
    [today, weekStart, core.pauses],
  );
  return {
    ctx,
    habits: core.habits,
    pauses: core.pauses,
    chains: core.chains,
    reminders: core.reminders,
    timer: core.timer,
    logs: logs.logs,
    indexes,
    loading: core.loading || logs.loading,
    error: core.error ?? logs.error,
    retry: () => {
      core.retry();
      logs.retry();
    },
  };
}

const EMPTY_INDEX: LogIndex = new Map();
export const indexFor = (data: Pick<HabitData, "indexes">, habitId: string): LogIndex =>
  data.indexes.get(habitId) ?? EMPTY_INDEX;

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

export function newKey(): string {
  return crypto.randomUUID();
}

export async function refreshHabits() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: HABITS_KEY, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: LOGS_KEY, refetchType: "all" }),
  ]);
  scheduleReminderReconcile();
}

export type HabitInput = {
  name: string;
  icon?: string;
  color?: string;
  area?: string;
  intent: Intent;
  measure: Measure;
  unit?: string;
  startDate: string;
  endCondition?: EndCondition;
  goalId?: string;
  stepId?: string;
  labelId?: string;
  category?: string;
  module?: HabitModule;
  moduleMetric?: ModuleMetric;
  goal: {
    value: number;
    period: GoalPeriod;
    schedule: Schedule;
    flexible: boolean;
    timesOfDay: TimeOfDay[];
    checklist: ChecklistItem[];
  };
  reminders?: { time: string; weekdays: number[] }[];
};

function validateInput(input: HabitInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Dê um nome à rotina.");
  if (name.length > 120) throw new Error("O nome pode ter até 120 caracteres.");
  const g = input.goal;
  if (!Number.isFinite(g.value) || g.value < 0)
    throw new Error("A meta precisa ser um número maior ou igual a zero.");
  if (input.intent === "build" && g.value <= 0)
    throw new Error("A meta precisa ser maior que zero.");
  if (g.value >= 1_000_000_000) throw new Error("A meta é grande demais.");
  if (
    input.measure !== "binary" &&
    input.measure !== "duration" &&
    input.intent !== "quit" &&
    !input.unit?.trim() &&
    input.measure === "quantity"
  )
    throw new Error("Escolha uma unidade para a quantidade.");
  if (g.schedule.type === "weekdays" && g.schedule.weekdays.length === 0)
    throw new Error("Escolha ao menos um dia da semana.");
  if (g.schedule.type === "monthdays" && g.schedule.days.length === 0)
    throw new Error("Escolha ao menos um dia do mês.");
  if (g.schedule.type === "interval" && (g.schedule.every < 1 || g.schedule.every > 365))
    throw new Error("O intervalo deve ficar entre 1 e 365 dias.");
  if (input.endCondition?.type === "completions" && input.endCondition.count < 1)
    throw new Error("Informe quantas conclusões encerram a rotina.");
  if (input.endCondition?.type === "total" && !(input.endCondition.amount > 0))
    throw new Error("Informe a quantidade que encerra a rotina.");
}

function versionRow(habitId: string, userId: string, effectiveFrom: string, g: HabitInput["goal"]) {
  return {
    habit_id: habitId,
    user_id: userId,
    effective_from: effectiveFrom,
    goal_value: g.value,
    goal_period: g.period,
    schedule: g.schedule,
    flexible: g.flexible,
    times_of_day: g.timesOfDay,
    checklist: g.checklist,
  };
}

export async function createHabit(input: HabitInput): Promise<string> {
  validateInput(input);
  const userId = await ensureSession();
  const habit = unwrap<{ id: string }>(
    await supabase
      .from("habits")
      .insert({
        user_id: userId,
        name: input.name.trim(),
        icon: input.icon,
        color: input.color,
        area: input.area?.trim() || null,
        intent: input.intent,
        measure: input.measure,
        unit: input.unit?.trim() || null,
        start_date: input.startDate,
        end_condition: input.endCondition ?? null,
        goal_id: input.goalId ?? null,
        step_id: input.stepId ?? null,
        label_id: input.labelId ?? null,
        category: input.category ?? null,
        module: input.module ?? null,
        module_metric: input.moduleMetric ?? null,
        position: Date.now() % 1_000_000_000,
      })
      .select("id")
      .single(),
  );
  const rollback = async () => void (await supabase.from("habits").delete().eq("id", habit.id));
  try {
    unwrap(
      await supabase
        .from("habit_versions")
        .insert(versionRow(habit.id, userId, input.startDate, input.goal)),
    );
    if (input.reminders?.length) {
      unwrap(
        await supabase.from("habit_reminders").insert(
          input.reminders.map((r) => ({
            habit_id: habit.id,
            user_id: userId,
            time: r.time,
            weekdays: r.weekdays,
          })),
        ),
      );
    }
  } catch (error) {
    await rollback(); // não deixa uma rotina sem meta
    throw error;
  }
  await refreshHabits();
  return habit.id;
}

export type HabitPatch = Partial<
  Pick<
    Habit,
    | "name"
    | "icon"
    | "color"
    | "area"
    | "unit"
    | "endCondition"
    | "goalId"
    | "stepId"
    | "labelId"
    | "category"
  >
>;

export async function updateHabit(id: string, patch: HabitPatch) {
  const row: Row = {};
  if (patch.name !== undefined) {
    const n = patch.name.trim();
    if (!n) throw new Error("Dê um nome à rotina.");
    row.name = n;
  }
  for (const [k, col] of [
    ["icon", "icon"],
    ["color", "color"],
    ["area", "area"],
    ["unit", "unit"],
    ["endCondition", "end_condition"],
    ["goalId", "goal_id"],
    ["stepId", "step_id"],
    ["labelId", "label_id"],
    ["category", "category"],
  ] as const) {
    if (k in patch) row[col] = (patch as Row)[k] ?? null;
  }
  unwrap(await supabase.from("habits").update(row).eq("id", id).select().single());
  await refreshHabits();
}

/** Muda meta/frequência. `from` é a data em que a nova versão passa a valer —
 * o passado continua com a meta que tinha. Passar o início da rotina reescreve
 * de propósito (opção explícita na interface). */
export async function setGoalVersion(habit: Habit, goal: HabitInput["goal"], from: string) {
  const userId = await ensureSession();
  if (goal.schedule.type === "weekdays" && goal.schedule.weekdays.length === 0)
    throw new Error("Escolha ao menos um dia da semana.");
  if (habit.intent === "build" && goal.value <= 0)
    throw new Error("A meta precisa ser maior que zero.");
  const row = versionRow(habit.id, userId, from, goal);
  const existing = habit.versions.find((v) => v.effectiveFrom === from);
  if (existing)
    unwrap(
      await supabase.from("habit_versions").update(row).eq("id", existing.id).select().single(),
    );
  else unwrap(await supabase.from("habit_versions").insert(row).select().single());
  await refreshHabits();
}

export async function archiveHabit(id: string, archived = true) {
  unwrap(
    await supabase
      .from("habits")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select()
      .single(),
  );
  // Arquivar cancela os lembretes futuros que a rotina gerou.
  if (archived)
    await supabase
      .from("reminders")
      .delete()
      .eq("related_habit_id", id)
      .gt("remind_at", new Date().toISOString());
  await refreshHabits();
}

export async function deleteHabit(id: string) {
  unwrap(await supabase.from("habits").delete().eq("id", id).select().single());
  await refreshHabits();
}

export async function duplicateHabit(habit: Habit): Promise<string> {
  const v = versionAt(habit, todayISO()) ?? habit.versions[habit.versions.length - 1];
  return createHabit({
    name: `${habit.name} (cópia)`.slice(0, 120),
    icon: habit.icon,
    color: habit.color,
    area: habit.area,
    intent: habit.intent,
    measure: habit.measure,
    unit: habit.unit,
    startDate: todayISO(),
    endCondition: habit.endCondition,
    goalId: habit.goalId,
    stepId: habit.stepId,
    labelId: habit.labelId,
    category: habit.category,
    goal: {
      value: v?.goalValue ?? 1,
      period: v?.goalPeriod ?? "day",
      schedule: v?.schedule ?? { type: "daily" },
      flexible: v?.flexible ?? false,
      timesOfDay: v?.timesOfDay ?? [],
      checklist: v?.checklist ?? [],
    },
  });
}

export async function reorderHabits(ids: string[]) {
  await Promise.all(
    ids.map((id, i) => supabase.from("habits").update({ position: i }).eq("id", id)),
  );
  await refreshHabits();
}

// --- registros -------------------------------------------------------------

export type LogInput = {
  habitId: string;
  date: string;
  status?: LogStatus;
  value?: number;
  durationSeconds?: number;
  note?: string;
  reason?: string;
  feeling?: Feeling;
  checks?: string[];
  source?: LogSource;
  sourceRef?: string;
  /** Repetir a MESMA ação (retry, duplo toque) devolve o mesmo registro. */
  key?: string;
  occurredAt?: string;
};

export async function logHabit(input: LogInput): Promise<HabitLog> {
  if (input.value !== undefined && (!Number.isFinite(input.value) || input.value < 0))
    throw new Error("Informe um valor válido.");
  const row = unwrap(
    await supabase.rpc("log_habit", {
      p_habit: input.habitId,
      p_date: input.date,
      p_status: input.status ?? "recorded",
      p_value: input.value ?? 0,
      p_duration: input.durationSeconds ?? null,
      p_note: input.note ?? "",
      p_reason: input.reason ?? null,
      p_feeling: input.feeling ?? null,
      p_checks: input.checks ?? [],
      p_source: input.source ?? "manual",
      p_source_ref: input.sourceRef ?? null,
      p_idempotency_key: input.key ?? null,
      p_time_zone: getAppTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      p_occurred_at: input.occurredAt ?? new Date().toISOString(),
    }),
  ) as Row;
  const log = mapLog(row);
  await refreshHabits();
  await runEffects(log);
  return log;
}

export type EffectsReport = { cancelled: number; alreadySent: number };

/** Desfazer: o registro some das contas e das telas, em todas as superfícies, e os
 * lembretes que ele gerou e ainda não saíram são cancelados. Um aviso já entregue
 * não tem como ser desfeito — `alreadySent` conta quantos foram. */
export async function undoLog(logId: string): Promise<EffectsReport> {
  unwrap(
    await supabase
      .from("habit_logs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", logId)
      .select()
      .single(),
  );
  const report = await cancelEffects(logId);
  await refreshHabits();
  return report;
}

async function cancelEffects(logId: string): Promise<EffectsReport> {
  const { data, error } = await supabase.rpc("cancel_habit_effects", { p_log: logId });
  if (error) {
    console.warn("[rotinas] não consegui cancelar lembretes do registro:", error.message);
    return { cancelled: 0, alreadySent: 0 };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Row | null;
  return { cancelled: Number(row?.cancelled ?? 0), alreadySent: Number(row?.already_sent ?? 0) };
}

export async function editLog(
  logId: string,
  patch: {
    value?: number;
    note?: string;
    feeling?: Feeling | null;
    reason?: string | null;
    checks?: string[];
  },
): Promise<EffectsReport> {
  const row: Row = {};
  if (patch.value !== undefined) {
    if (!Number.isFinite(patch.value) || patch.value < 0)
      throw new Error("Informe um valor válido.");
    row.value = patch.value;
  }
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.feeling !== undefined) row.feeling = patch.feeling;
  if (patch.reason !== undefined) row.reason = patch.reason;
  if (patch.checks !== undefined) row.checks = patch.checks;
  const updated = mapLog(
    unwrap(await supabase.from("habit_logs").update(row).eq("id", logId).select().single()) as Row,
  );
  // O valor mudou: o que este registro gerou pode não valer mais. Cancela o que
  // está pendente e reavalia com o valor novo.
  let report: EffectsReport = { cancelled: 0, alreadySent: 0 };
  if (patch.value !== undefined) {
    report = await cancelEffects(logId);
    await refreshHabits();
    await runEffects(updated);
  } else {
    await refreshHabits();
  }
  return report;
}

// --- pausas ----------------------------------------------------------------

export async function createPause(input: {
  scope: Pause["scope"];
  habitId?: string;
  area?: string;
  startDate: string;
  endDate?: string;
  reason?: string;
}) {
  if (input.endDate && input.endDate < input.startDate)
    throw new Error("A data final precisa ser depois da inicial.");
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("habit_pauses")
      .insert({
        user_id: userId,
        scope: input.scope,
        habit_id: input.scope === "habit" ? input.habitId : null,
        area: input.scope === "area" ? input.area : null,
        start_date: input.startDate,
        end_date: input.endDate ?? null,
        reason: input.reason?.trim() || null,
      })
      .select()
      .single(),
  );
  // Rotina em pausa não manda lembrete: remove os futuros já gerados.
  await supabase
    .from("reminders")
    .delete()
    .not("related_habit_id", "is", null)
    .gt("remind_at", new Date(`${input.startDate}T00:00:00`).toISOString());
  await refreshHabits();
}

/** Retomar antes do fim: a pausa passa a terminar ontem (ou some, se começava hoje). */
export async function resumePause(pause: Pause, today: string) {
  if (pause.startDate >= today)
    unwrap(await supabase.from("habit_pauses").delete().eq("id", pause.id).select());
  else
    unwrap(
      await supabase
        .from("habit_pauses")
        .update({ end_date: addDaysISO(today, -1) })
        .eq("id", pause.id)
        .select()
        .single(),
    );
  await refreshHabits();
}

// --- encadeamento ----------------------------------------------------------

export async function addChain(input: {
  base: string;
  target: string;
  trigger: Chain["trigger"];
  delayMinutes: number;
}) {
  const userId = await ensureSession();
  const res = await supabase
    .from("habit_chains")
    .insert({
      user_id: userId,
      base_habit_id: input.base,
      target_habit_id: input.target,
      trigger_status: input.trigger,
      delay_minutes: input.delayMinutes,
    })
    .select()
    .single();
  if (res.error) {
    if (/ciclo/i.test(res.error.message))
      throw new Error("Essas rotinas se chamariam em círculo. Escolha outra ordem.");
    if (/duplicate|unique/i.test(res.error.message))
      throw new Error("Esse encadeamento já existe.");
    throw new Error(res.error.message);
  }
  await refreshHabits();
}

export async function removeChain(id: string) {
  unwrap(await supabase.from("habit_chains").delete().eq("id", id).select());
  await refreshHabits();
}

// Horário silencioso (0065). Sem a tabela ou sem configuração: sem silêncio.
async function fetchQuietHours(): Promise<QuietHours> {
  const { data, error } = await supabase
    .from("habit_settings")
    .select("quiet_start, quiet_end")
    .maybeSingle();
  if (error || !data?.quiet_start || !data?.quiet_end) return null;
  return { start: data.quiet_start as string, end: data.quiet_end as string };
}

const zoneNow = () => getAppTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

async function periodLogs(habit: Habit, date: string, weekStart: 0 | 1): Promise<HabitLog[]> {
  const v = versionAt(habit, date);
  const period = v?.goalPeriod ?? "day";
  return fetchLogs(
    startOfPeriod(date, period, weekStart),
    endOfPeriod(date, period, weekStart),
    habit.id,
  );
}

/** Efeitos de um registro: avisa a próxima rotina da cadeia — só quando o registro
 * MUDA o estado da meta (não a cada toque), só para registros de hoje, e uma vez
 * por origem/encadeamento/data. Falhar aqui nunca desfaz o registro. */
export async function runEffects(log: HabitLog): Promise<void> {
  try {
    if (log.deletedAt) return;
    const core = queryClient.getQueryData<HabitsCore>(HABITS_KEY) ?? (await fetchCore());
    const links = core.chains.filter((c) => c.baseHabitId === log.habitId);
    if (links.length === 0) return;
    const today = todayISO();
    if (log.localDate !== today) return; // registro retroativo não avisa "agora"
    const habit = core.habits.find((h) => h.id === log.habitId);
    if (!habit) return;
    const weekStart = await getProfileWeekStart();
    const ctx: EvalContext = { today, weekStart, pauses: core.pauses };
    const transition = transitionOf(
      ctx,
      habit,
      await periodLogs(habit, log.localDate, weekStart),
      log,
    );
    const fired = links.filter((c) => firesTrigger(c.trigger, log, transition));
    if (fired.length === 0) return;
    const quiet = await fetchQuietHours();
    const userId = await ensureSession();
    for (const chain of fired) {
      const target = core.habits.find((h) => h.id === chain.targetHabitId);
      if (!target) continue;
      const verdict = targetNeedsReminder(
        ctx,
        target,
        await periodLogs(target, today, weekStart),
        today,
      );
      if (!verdict.ok) continue;
      const when = scheduleAt(new Date(), chain.delayMinutes, zoneNow(), quiet, today);
      if (!when) continue;
      // Índice único (encadeamento, registro de origem, data): repetir devolve 23505,
      // que é o resultado esperado — não um erro.
      const { error } = await supabase.from("reminders").insert({
        user_id: userId,
        text: `${target.name} — depois de ${habit.name}`,
        date: when.date,
        remind_at: when.at.toISOString(),
        related_habit_id: target.id,
        habit_occurrence_date: when.date,
        habit_chain_id: chain.id,
        source_log_id: log.id,
        origin: "habit_chain",
      });
      if (error && error.code !== "23505")
        console.warn("[rotinas] lembrete encadeado não criado:", error.message);
    }
  } catch (e) {
    console.warn("[rotinas] efeitos do registro:", e instanceof Error ? e.message : e);
  }
}

// --- lembretes por horário -> notificações reais ---------------------------

const REMINDER_HORIZON_DAYS = 14;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let reconciling: Promise<void> | null = null;

function scheduleReminderReconcile() {
  if (typeof window === "undefined") return;
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcileHabitReminders();
  }, 1200);
}

/** Mantém a tabela de lembretes igual ao que as configurações pedem para os
 * próximos dias: cria o que falta, move o que mudou de horário e remove o que
 * deixou de valer (rotina arquivada, em pausa, já feita hoje, lembrete apagado).
 * Lembretes já entregues ficam como estão. */
export function reconcileHabitReminders(): Promise<void> {
  if (reconciling) return reconciling;
  reconciling = (async () => {
    try {
      const userId = await ensureSession();
      const core = queryClient.getQueryData<HabitsCore>(HABITS_KEY) ?? (await fetchCore());
      const zone = zoneNow();
      const now = new Date();
      const today = dateAndTimeInZone(now, zone).date;
      const weekStart = await getProfileWeekStart();
      const ctx: EvalContext = { today, weekStart, pauses: core.pauses };
      const quiet = await fetchQuietHours();

      const desired = new Map<
        string,
        { at: string; date: string; text: string; habitId: string; rid: string }
      >();
      for (const habit of core.habits) {
        const rs = core.reminders.filter((r) => r.habitId === habit.id);
        if (rs.length === 0) continue;
        const resolvedToday = ["completed", "skipped", "missed"].includes(
          goalOutcome(ctx, habit, await periodLogs(habit, today, weekStart), today),
        );
        for (const o of reminderOccurrences(ctx, habit, rs, {
          now,
          days: REMINDER_HORIZON_DAYS,
          zone,
          quiet,
        })) {
          if (o.date === today && resolvedToday) continue;
          desired.set(`${o.reminderId}|${o.date}`, {
            at: o.at,
            date: o.date,
            text: habit.name,
            habitId: habit.id,
            rid: o.reminderId,
          });
        }
      }

      const { data, error } = await supabase
        .from("reminders")
        .select("id, habit_reminder_id, habit_occurrence_date, remind_at, notified_at, done")
        .eq("origin", "habit_reminder")
        .gte("habit_occurrence_date", today);
      if (error) throw new Error(error.message);
      const existing = (data ?? []) as Row[];
      const have = new Map(
        existing.map((r) => [`${r.habit_reminder_id}|${r.habit_occurrence_date}`, r]),
      );

      const stale = existing.filter((r) => {
        if (r.notified_at || r.done) return false; // já entregue: não se mexe
        const d = desired.get(`${r.habit_reminder_id}|${r.habit_occurrence_date}`);
        return !d || new Date(d.at).getTime() !== new Date(r.remind_at as string).getTime();
      });
      if (stale.length)
        await supabase
          .from("reminders")
          .delete()
          .in(
            "id",
            stale.map((r) => r.id as string),
          );
      const staleIds = new Set(stale.map((r) => r.id));

      for (const [key, d] of desired) {
        const cur = have.get(key);
        if (cur && !staleIds.has(cur.id)) continue;
        const { error: insertError } = await supabase.from("reminders").insert({
          user_id: userId,
          text: d.text,
          date: d.date,
          remind_at: d.at,
          related_habit_id: d.habitId,
          habit_occurrence_date: d.date,
          habit_reminder_id: d.rid,
          origin: "habit_reminder",
        });
        if (insertError && insertError.code !== "23505")
          console.warn("[rotinas] lembrete não criado:", insertError.message);
      }
    } catch (e) {
      console.warn("[rotinas] reconciliação de lembretes:", e instanceof Error ? e.message : e);
    }
  })().finally(() => {
    reconciling = null;
  });
  return reconciling;
}

// --- timer -----------------------------------------------------------------

const deviceId = (() => {
  try {
    const k = "norte-device-id";
    let id = localStorage.getItem(k);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return "web";
  }
})();

export async function startTimer(input: {
  habitId: string;
  mode: TimerMode;
  targetSeconds?: number;
  pomodoro?: PomodoroConfig;
}) {
  const userId = await ensureSession();
  const existing = unwrap(await supabase.from("habit_timers").select("*").maybeSingle());
  if (existing)
    throw new Error("Já existe um timer em andamento. Encerre-o antes de iniciar outro.");
  if (input.mode === "countdown" && !(input.targetSeconds && input.targetSeconds > 0))
    throw new Error("Defina quanto tempo vai contar.");
  unwrap(
    await supabase
      .from("habit_timers")
      .insert({
        user_id: userId,
        habit_id: input.habitId,
        mode: input.mode,
        state: "running",
        started_at: new Date().toISOString(),
        accumulated_seconds: 0,
        target_seconds: input.mode === "countdown" ? input.targetSeconds : null,
        pomodoro: input.mode === "pomodoro" ? (input.pomodoro ?? DEFAULT_POMODORO) : null,
        device_id: deviceId,
      })
      .select()
      .single(),
  );
  await refreshHabits();
}

/** Atualização com compare-and-set na revisão: dois aparelhos não se atropelam.
 * Se outro aparelho mexeu antes, a interface recarrega e mostra o estado real. */
async function mutateTimer(timer: HabitTimer, patch: Row) {
  const res = await supabase
    .from("habit_timers")
    .update({ ...patch, revision: timer.revision + 1, device_id: deviceId })
    .eq("id", timer.id)
    .eq("revision", timer.revision)
    .select();
  if (res.error) throw new Error(res.error.message);
  if (!res.data || res.data.length === 0) {
    await refreshHabits();
    throw new Error("O timer foi alterado em outro aparelho. Mostrando o estado atual.");
  }
  await refreshHabits();
}

export async function pauseTimer(timer: HabitTimer, nowMs = Date.now()) {
  if (timer.state !== "running") return;
  const elapsed =
    timer.accumulatedSeconds +
    Math.max(0, Math.floor((nowMs - new Date(timer.startedAt).getTime()) / 1000));
  await mutateTimer(timer, { state: "paused", accumulated_seconds: elapsed });
}

export async function resumeTimer(timer: HabitTimer) {
  if (timer.state !== "paused") return;
  await mutateTimer(timer, { state: "running", started_at: new Date().toISOString() });
}

export async function discardTimer(timer: HabitTimer) {
  unwrap(
    await supabase
      .from("habit_timers")
      .delete()
      .eq("id", timer.id)
      .eq("revision", timer.revision)
      .select(),
  );
  await refreshHabits();
}

/** Encerra e registra a duração REAL medida. Gravar o registro e remover o timer
 * acontece numa única transação no banco, só se a revisão ainda for a que esta tela
 * viu: se outro aparelho mexeu antes, nada é gravado e a tela mostra o estado atual.
 * A sessão conta no dia em que foi iniciada (mesmo que termine depois da meia-noite);
 * a duração é a medida, não o tempo entre dois horários. */
export async function finishTimer(
  timer: HabitTimer,
  habit: Habit,
  nowMs = Date.now(),
): Promise<HabitLog | null> {
  const seconds = measuredSeconds(timer, nowMs);
  if (seconds < 1) {
    await discardTimer(timer);
    return null;
  }
  const minutes = Math.round((seconds / 60) * 100) / 100;
  const value = habit.measure === "binary" || habit.measure === "count" ? 1 : minutes;
  const date = localDateOfInstant(timer.createdAt ?? timer.startedAt);
  const { data, error } = await supabase.rpc("finish_habit_timer", {
    p_timer: timer.id,
    p_revision: timer.revision,
    p_date: date,
    p_value: value,
    p_duration: seconds,
    p_time_zone: zoneNow(),
    p_occurred_at: new Date(nowMs).toISOString(),
  });
  if (error) {
    await refreshHabits();
    if (error.code === "PT409" || /timer_changed/.test(error.message))
      throw new Error("O timer foi alterado em outro aparelho. Mostrando o estado atual.");
    if (error.code === "PT404" || /timer_not_found/.test(error.message))
      throw new Error("Este timer já foi encerrado em outro aparelho.");
    throw new Error(error.message);
  }
  const log = mapLog(data as Row);
  await refreshHabits();
  await runEffects(log);
  return log;
}

// --- lembretes e reflexões -------------------------------------------------

/** Troca todos os lembretes da rotina de uma vez: se algo for inválido, os anteriores
 * continuam exatamente como estavam (uma transação no banco). */
export async function setHabitReminders(
  habitId: string,
  items: { time: string; weekdays: number[]; enabled?: boolean }[],
) {
  unwrap(await supabase.rpc("set_habit_reminders", { p_habit: habitId, p_items: items }));
  await refreshHabits();
}

export async function addReflection(input: {
  localDate: string;
  habitId?: string;
  mood?: Reflection["mood"];
  note: string;
}) {
  if (!input.mood && !input.note.trim())
    throw new Error("Escreva uma nota ou escolha como foi o dia.");
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("habit_reflections")
      .insert({
        user_id: userId,
        local_date: input.localDate,
        habit_id: input.habitId ?? null,
        mood: input.mood ?? null,
        note: input.note.trim(),
      })
      .select()
      .single(),
  );
  await queryClient.invalidateQueries({ queryKey: REFLECTIONS_KEY });
}

export async function deleteReflection(id: string) {
  unwrap(await supabase.from("habit_reflections").delete().eq("id", id).select());
  await queryClient.invalidateQueries({ queryKey: REFLECTIONS_KEY });
}

export async function fetchReflections(
  search: string,
  page: number,
  size = 30,
): Promise<{ rows: Reflection[]; hasMore: boolean }> {
  let q = supabase
    .from("habit_reflections")
    .select("*")
    .order("local_date", { ascending: false })
    .order("created_at", { ascending: false });
  const term = search.trim();
  if (term) q = q.ilike("note", `%${term.replace(/[%_]/g, "\\$&")}%`);
  const rows = unwrap(await q.range(page * size, page * size + size)) as Row[];
  return { rows: rows.slice(0, size).map(mapReflection), hasMore: rows.length > size };
}

// --- módulos (Academia, Esportes, Leitura, Água) ---------------------------

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

async function runOutboxOp(op: OutboxOp): Promise<void> {
  if (op.kind === "unsync") {
    const res = await supabase
      .from("habit_logs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("source_ref", `${op.module}:${op.ref}`)
      .is("deleted_at", null)
      .select("id");
    if (res.error) throw new Error(res.error.message);
    for (const row of res.data ?? []) await cancelEffects(row.id as string);
    return;
  }
  const { data, error } = await supabase.rpc("sync_module_habits", {
    p_module: op.module,
    p_ref: op.ref,
    p_date: op.date,
    p_metrics: op.metrics,
    p_time_zone: zoneNow(),
  });
  if (error) throw new Error(error.message);
  // Mesmos efeitos do registro manual (cadeias, lembretes).
  for (const row of (data ?? []) as Row[]) await runEffects(mapLog(row));
}

let flushing: Promise<{ done: number; pending: number }> | null = null;

/** Envia o que estiver na fila. Seguro chamar a qualquer momento. */
export function flushHabitOutbox(opts: { includeStalled?: boolean } = {}) {
  const store = storage();
  if (!store) return Promise.resolve({ done: 0, pending: 0 });
  if (flushing) return flushing;
  flushing = (async () => {
    const userId = await ensureSession();
    const r = await flushOutbox(store, userId, runOutboxOp, opts);
    if (r.done > 0) await refreshHabits();
    notifyOutbox();
    return r;
  })()
    .catch(() => ({ done: 0, pending: pendingOutbox() }))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

let outboxUser: string | null = null;
export function pendingOutbox(): number {
  const store = storage();
  return store && outboxUser ? readOutbox(store, outboxUser).length : 0;
}
const outboxListeners = new Set<() => void>();
const notifyOutbox = () => outboxListeners.forEach((fn) => fn());
export const subscribeOutbox = (fn: () => void) => {
  outboxListeners.add(fn);
  return () => void outboxListeners.delete(fn);
};

let workerRefs = 0;
let stopWorker: (() => void) | null = null;
/** Liga o reenvio automático: ao abrir, ao voltar a rede e a cada minuto com pendência.
 * Várias telas podem pedir; só um relógio roda. */
export function startOutboxWorker(userId: string) {
  outboxUser = userId;
  if (typeof window === "undefined") return () => {};
  workerRefs += 1;
  if (workerRefs === 1) {
    const tick = () => void flushHabitOutbox();
    window.addEventListener("online", tick);
    const interval = setInterval(() => {
      if (pendingOutbox() > 0) tick();
    }, 60_000);
    stopWorker = () => {
      window.removeEventListener("online", tick);
      clearInterval(interval);
    };
  }
  void flushHabitOutbox();
  return () => {
    workerRefs -= 1;
    if (workerRefs === 0) stopWorker?.();
  };
}

async function enqueueAndFlush(op: OutboxOp) {
  const store = storage();
  if (!store) return;
  const userId = await ensureSession();
  outboxUser = userId;
  enqueue(store, userId, op);
  notifyOutbox();
  await flushHabitOutbox();
}

/** Um treino, corrida, leitura ou copo d'água alimenta as rotinas vinculadas. O
 * pedido entra primeiro numa fila persistente e só sai dela quando o banco confirma:
 * sem rede ou com erro momentâneo, ele é reenviado sozinho. A referência é única por
 * rotina, então reenviar não soma duas vezes; editar a origem atualiza o valor. */
export async function syncModuleHabits(
  module: HabitModule,
  ref: string,
  date: string,
  metrics: Partial<Record<ModuleMetric, number>>,
): Promise<void> {
  await enqueueAndFlush({
    kind: "sync",
    module,
    ref,
    date,
    metrics: metrics as Record<string, number>,
    attempts: 0,
  });
}

/** Remove o que um módulo lançou quando o registro de origem é desfeito (também via fila). */
export async function unsyncModuleHabits(module: HabitModule, ref: string): Promise<void> {
  await enqueueAndFlush({ kind: "unsync", module, ref, attempts: 0 });
}

/** Data civil (no fuso do app) de um instante — a mesma regra de `todayISO`. */
export function localDateOfInstant(iso: string): string {
  const zone = getAppTimeZone();
  if (zone) {
    try {
      return dateAndTimeInZone(new Date(iso), zone).date;
    } catch {
      /* fuso inválido: cai no do aparelho */
    }
  }
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export { eachDay, endOfPeriod };
