import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ensureSession, supabase, useSupabaseUserId } from "../supabase/client";
import { queryClient } from "../query-client";
import { dateAndTimeInZone, getAppTimeZone } from "../app-time-zone";
import { addDaysISO } from "../agenda-intervals";
import { todayISO } from "../goals-store";
import { useProfile } from "../profile-store";
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
  await afterLog(input.habitId, log);
  return log;
}

/** Desfazer: o registro some das contas e das telas, em todas as superfícies. */
export async function undoLog(logId: string) {
  unwrap(
    await supabase
      .from("habit_logs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", logId)
      .select()
      .single(),
  );
  await refreshHabits();
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
) {
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
  unwrap(await supabase.from("habit_logs").update(row).eq("id", logId).select().single());
  await refreshHabits();
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

/** Depois de um registro, avisa a próxima rotina da cadeia (uma vez só, e só se
 * ela não estiver em pausa nem já resolvida hoje). */
async function afterLog(habitId: string, log: HabitLog) {
  const status =
    log.status === "skipped"
      ? "skipped"
      : log.status === "missed"
        ? "missed"
        : log.status === "recorded"
          ? "done"
          : null;
  if (!status) return;
  const core = queryClient.getQueryData<HabitsCore>(HABITS_KEY);
  if (!core) return;
  const links = core.chains.filter((c) => c.baseHabitId === habitId && c.trigger === status);
  if (links.length === 0) return;
  const today = todayISO();
  const userId = await ensureSession();
  for (const chain of links) {
    const target = core.habits.find((h) => h.id === chain.targetHabitId);
    if (!target || target.archivedAt) continue;
    if (
      core.pauses.some(
        (p) =>
          (p.scope === "global" ||
            (p.scope === "habit" && p.habitId === target.id) ||
            (p.scope === "area" && p.area === target.area)) &&
          today >= p.startDate &&
          (!p.endDate || today <= p.endDate),
      )
    )
      continue;
    const at = new Date(Date.now() + chain.delayMinutes * 60_000);
    at.setSeconds(0, 0); // um lembrete por rotina-alvo e minuto
    // O índice único (usuário, rotina, instante) impede o segundo: repetir o mesmo
    // evento devolve 23505 e isso é o resultado esperado, não um erro.
    const { error } = await supabase.from("reminders").insert({
      user_id: userId,
      text: `${target.name} — depois de ${core.habits.find((h) => h.id === habitId)?.name ?? "sua rotina"}`,
      date: today,
      remind_at: at.toISOString(),
      related_habit_id: target.id,
      habit_occurrence_date: today,
      origin: "habit_chain",
    });
    if (error && error.code !== "23505")
      console.warn("[rotinas] lembrete encadeado não criado:", error.message);
  }
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

/** Encerra e registra a duração REAL medida (idempotente: a chave é o timer). */
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
  const value =
    habit.measure === "duration"
      ? minutes
      : habit.measure === "binary"
        ? 1
        : habit.measure === "count"
          ? 1
          : minutes;
  const log = await logHabit({
    habitId: habit.id,
    date: todayISO(),
    value,
    durationSeconds: seconds,
    source: "timer",
    key: `timer:${timer.id}`,
  });
  await supabase.from("habit_timers").delete().eq("id", timer.id);
  await refreshHabits();
  return log;
}

// --- lembretes e reflexões -------------------------------------------------

export async function setHabitReminders(
  habitId: string,
  items: { time: string; weekdays: number[] }[],
) {
  const userId = await ensureSession();
  unwrap(await supabase.from("habit_reminders").delete().eq("habit_id", habitId).select());
  if (items.length) {
    unwrap(
      await supabase
        .from("habit_reminders")
        .insert(
          items.map((r) => ({
            habit_id: habitId,
            user_id: userId,
            time: r.time,
            weekdays: r.weekdays,
          })),
        )
        .select(),
    );
  }
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

/** Um treino, corrida, leitura ou copo d'água alimenta as rotinas vinculadas.
 * A referência é única por rotina: chamar de novo (retry, reabrir) não soma duas
 * vezes. Falhar aqui nunca impede o módulo de salvar o próprio registro. */
export async function syncModuleHabits(
  module: HabitModule,
  ref: string,
  date: string,
  metrics: Partial<Record<ModuleMetric, number>>,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("log_habits_from_module", {
      p_module: module,
      p_ref: ref,
      p_date: date,
      p_metrics: metrics,
      p_time_zone: getAppTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (error) return 0;
    const n = Number(data ?? 0);
    if (n > 0) await refreshHabits();
    return n;
  } catch {
    return 0;
  }
}

/** Remove o que um módulo lançou quando o registro de origem é desfeito. */
export async function unsyncModuleHabits(module: HabitModule, ref: string): Promise<void> {
  try {
    await supabase
      .from("habit_logs")
      .update({ deleted_at: new Date().toISOString() })
      .eq("source_ref", `${module}:${ref}`)
      .is("deleted_at", null);
    await refreshHabits();
  } catch {
    /* sem rede: o módulo segue valendo e a rotina corrige na próxima sincronização */
  }
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
