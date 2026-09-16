import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { nowDate } from "./test-clock";
import { addDays, daysBetweenISO, toISODate, todayISO } from "./goals-store";
import {
  exerciseSeriesByLineage,
  finishedSessionsInRange,
  maxWeightAtReps,
  volumeForLineage,
  currentBodyWeight,
  type BodyWeightEntry,
  type Exercise,
  type SetTarget,
  type WorkoutPlan,
  type WorkoutSession,
} from "./workout-store";

// ---------------------------------------------------------------------------
// Ciclo de treino — blocos com datas, treinos por bloco e metas mensuráveis.
//
// O ciclo NÃO é um planejamento paralelo: ele aponta pra uma linha de `goals`
// e cada bloco pra uma `steps` daquele goal. Abrir por Academia ou por Planos
// mostra o mesmo planejamento, não duas cópias que divergem.
//
// Série, carga e registro continuam no domínio de treino (workout_*). Só o
// horário vira compromisso, e pelo fluxo de rotinas que já existe.
// ---------------------------------------------------------------------------

export type CycleStatus = "rascunho" | "ativo" | "concluido" | "arquivado";

export type WorkoutCycle = {
  id: string;
  goalId?: string;
  name: string;
  startDate: string;
  endDate: string;
  status: CycleStatus;
  createdAt: string;
};

export type CycleBlock = {
  id: string;
  cycleId: string;
  stepId?: string;
  name: string;
  /** Texto escolhido pelo usuário ("resistência"). Não é meta mensurável. */
  focus?: string;
  muscleGroups?: string;
  startDate: string;
  endDate: string;
  order: number;
};

export type BlockPlan = { id: string; blockId: string; planId: string; order: number };
export type BlockDay = {
  id: string;
  blockId: string;
  weekday: number;
  planId: string | null;
  startTime?: string;
};

export type CycleGoalKind = "peso_corporal" | "carga" | "series_reps" | "frequencia";

export type CycleGoal = {
  id: string;
  cycleId: string;
  blockId?: string;
  kind: CycleGoalKind;
  exerciseLineageId?: string;
  exerciseLabel?: string;
  referenceReps?: number;
  startValue: number;
  targetValue: number;
  unit: string;
  deadline?: string;
  createdAt: string;
};

type State = {
  cycles: WorkoutCycle[];
  blocks: CycleBlock[];
  blockPlans: BlockPlan[];
  blockDays: BlockDay[];
  cycleGoals: CycleGoal[];
};

const EMPTY_STATE: State = {
  cycles: [],
  blocks: [],
  blockPlans: [],
  blockDays: [],
  cycleGoals: [],
};

// ---------------------------------------------------------------------------
// Seletores puros
// ---------------------------------------------------------------------------

export function activeCycle(cycles: WorkoutCycle[]): WorkoutCycle | undefined {
  return cycles.find((c) => c.status === "ativo");
}

export function draftCycles(cycles: WorkoutCycle[]): WorkoutCycle[] {
  return cycles.filter((c) => c.status === "rascunho");
}

export function pastCycles(cycles: WorkoutCycle[]): WorkoutCycle[] {
  return cycles
    .filter((c) => c.status === "concluido" || c.status === "arquivado")
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function blocksForCycle(blocks: CycleBlock[], cycleId: string): CycleBlock[] {
  return blocks.filter((b) => b.cycleId === cycleId).sort((a, b) => a.order - b.order);
}

/** O bloco que contém a data — os intervalos são construídos sem sobreposição,
 * então no máximo um responde. */
export function blockOn(blocks: CycleBlock[], iso: string): CycleBlock | undefined {
  return blocks.find((b) => iso >= b.startDate && iso <= b.endDate);
}

export function nextBlockAfter(blocks: CycleBlock[], iso: string): CycleBlock | undefined {
  return [...blocks]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .find((b) => b.startDate > iso);
}

export function plansOfBlock(
  blockPlans: BlockPlan[],
  plans: WorkoutPlan[],
  blockId: string,
): WorkoutPlan[] {
  const ids = blockPlans
    .filter((bp) => bp.blockId === blockId)
    .sort((a, b) => a.order - b.order)
    .map((bp) => bp.planId);
  return ids
    .map((id) => plans.find((p) => p.id === id))
    .filter((p): p is WorkoutPlan => Boolean(p));
}

export function daysOfBlock(blockDays: BlockDay[], blockId: string): BlockDay[] {
  return blockDays.filter((d) => d.blockId === blockId).sort((a, b) => a.weekday - b.weekday);
}

/** Divide um período em blocos consecutivos a partir das durações em dias.
 * Construir por soma em vez de aceitar datas soltas é o que garante que os
 * intervalos não se sobreponham nem deixem buraco. */
export function blockRangesFrom(
  startDate: string,
  durations: number[],
): { startDate: string; endDate: string }[] {
  const out: { startDate: string; endDate: string }[] = [];
  let cursor = startDate;
  for (const days of durations) {
    const safe = Math.max(1, Math.round(days));
    const start = cursor;
    const end = toISODate(addDays(new Date(start + "T00:00:00"), safe - 1));
    out.push({ startDate: start, endDate: end });
    cursor = toISODate(addDays(new Date(end + "T00:00:00"), 1));
  }
  return out;
}

export function blockDurationDays(block: { startDate: string; endDate: string }): number {
  return daysBetweenISO(block.startDate, block.endDate) + 1;
}

/** Qual programação está valendo hoje, e de onde ela vem. O ciclo ativo tem
 * precedência sobre o "Plano da semana" solto — mas a origem é sempre dita em
 * voz alta, porque combinar as duas em silêncio é o erro que não pode
 * acontecer. */
export type TodayProgramming = {
  source: "ciclo" | "semana" | "descanso" | "nenhum";
  planId: string | null;
  cycle?: WorkoutCycle;
  block?: CycleBlock;
  /** Preenchido quando existe ciclo ativo mas hoje está fora de qualquer bloco. */
  outsideBlocks?: boolean;
};

export function todayProgramming(
  state: {
    cycles: WorkoutCycle[];
    blocks: CycleBlock[];
    blockDays: BlockDay[];
  },
  weeklyAssignment: Record<number, string | null>,
  iso = todayISO(),
  weekday = nowDate().getDay(),
): TodayProgramming {
  const cycle = activeCycle(state.cycles);
  if (cycle) {
    const block = blockOn(blocksForCycle(state.blocks, cycle.id), iso);
    if (!block) return { source: "nenhum", planId: null, cycle, outsideBlocks: true };
    const day = state.blockDays.find((d) => d.blockId === block.id && d.weekday === weekday);
    if (!day) return { source: "nenhum", planId: null, cycle, block };
    if (!day.planId) return { source: "descanso", planId: null, cycle, block };
    return { source: "ciclo", planId: day.planId, cycle, block };
  }
  const planId = weeklyAssignment[weekday] ?? null;
  return { source: planId ? "semana" : "nenhum", planId };
}

/** Quantos treinos o ciclo programou num intervalo — denominador honesto de
 * "treinos realizados versus programados". Conta dias com treino marcado, não
 * dias corridos. */
export function plannedSessionsInRange(
  blocks: CycleBlock[],
  blockDays: BlockDay[],
  from: string,
  to: string,
): number {
  let count = 0;
  for (const block of blocks) {
    const start = block.startDate > from ? block.startDate : from;
    const end = block.endDate < to ? block.endDate : to;
    if (start > end) continue;
    const days = daysOfBlock(blockDays, block.id).filter((d) => d.planId);
    if (days.length === 0) continue;
    const weekdays = new Set(days.map((d) => d.weekday));
    for (let d = new Date(start + "T00:00:00"); toISODate(d) <= end; d.setDate(d.getDate() + 1)) {
      if (weekdays.has(d.getDay())) count += 1;
    }
  }
  return count;
}

export type CycleProgress = {
  /** Dias corridos — NÃO é progresso do planejamento. */
  elapsedDays: number;
  totalDays: number;
  plannedSessions: number;
  doneSessions: number;
  goalsReached: number;
  goalsTotal: number;
};

/** Três números separados de propósito: tempo transcorrido, treinos feitos
 * versus programados, e metas atingidas. Passar o tempo não é ter cumprido o
 * planejamento, e juntar isso numa barra só esconderia exatamente essa
 * diferença. */
export function cycleProgress(
  cycle: WorkoutCycle,
  blocks: CycleBlock[],
  blockDays: BlockDay[],
  sessions: WorkoutSession[],
  goalStates: { reached: boolean }[],
  iso = todayISO(),
): CycleProgress {
  const totalDays = daysBetweenISO(cycle.startDate, cycle.endDate) + 1;
  const cappedToday = iso > cycle.endDate ? cycle.endDate : iso;
  const elapsedDays =
    iso < cycle.startDate
      ? 0
      : Math.min(totalDays, daysBetweenISO(cycle.startDate, cappedToday) + 1);
  const until = cappedToday < cycle.startDate ? cycle.startDate : cappedToday;
  return {
    elapsedDays,
    totalDays,
    plannedSessions: plannedSessionsInRange(blocks, blockDays, cycle.startDate, until),
    doneSessions: finishedSessionsInRange(sessions, cycle.startDate, until).length,
    goalsReached: goalStates.filter((g) => g.reached).length,
    goalsTotal: goalStates.length,
  };
}

export type GoalEvaluation = {
  goal: CycleGoal;
  current: number;
  /** 0..1 — quanto do caminho entre o ponto inicial e o alvo foi percorrido. */
  progress: number;
  reached: boolean;
  /** Null quando ainda não há registro nenhum para medir. */
  hasData: boolean;
};

export function evaluateCycleGoal(
  goal: CycleGoal,
  ctx: {
    cycle: WorkoutCycle;
    blocks: CycleBlock[];
    blockDays: BlockDay[];
    sessions: WorkoutSession[];
    exercises: Exercise[];
    bodyWeights: BodyWeightEntry[];
  },
  iso = todayISO(),
): GoalEvaluation {
  const block = goal.blockId ? ctx.blocks.find((b) => b.id === goal.blockId) : undefined;
  const from = block?.startDate ?? ctx.cycle.startDate;
  const rawTo = block?.endDate ?? ctx.cycle.endDate;
  const to = iso < rawTo ? iso : rawTo;
  const range = { from, to };

  let current = goal.startValue;
  let hasData = false;

  if (goal.kind === "peso_corporal") {
    const latest = currentBodyWeight(ctx.bodyWeights);
    if (latest) {
      current = latest.weight;
      hasData = true;
    }
  } else if (goal.kind === "carga" && goal.exerciseLineageId) {
    const best = maxWeightAtReps(
      ctx.sessions,
      ctx.exercises,
      goal.exerciseLineageId,
      goal.referenceReps ?? 1,
      range,
    );
    if (best > 0) {
      current = best;
      hasData = true;
    }
  } else if (goal.kind === "series_reps" && goal.exerciseLineageId) {
    const vol = volumeForLineage(ctx.sessions, ctx.exercises, goal.exerciseLineageId, range);
    current = goal.unit === "reps" ? vol.reps : vol.sets;
    hasData = vol.sets > 0;
  } else if (goal.kind === "frequencia") {
    current = finishedSessionsInRange(ctx.sessions, from, to).length;
    hasData = true;
  }

  // Meta de emagrecer anda pra baixo; a de carga, pra cima. O sinal vem da
  // diferença entre início e alvo, não de uma suposição sobre o tipo.
  const span = goal.targetValue - goal.startValue;
  const walked = current - goal.startValue;
  const progress = span === 0 ? (current >= goal.targetValue ? 1 : 0) : walked / span;
  const reached = span >= 0 ? current >= goal.targetValue : current <= goal.targetValue;
  return {
    goal,
    current,
    progress: Math.max(0, Math.min(1, progress)),
    reached: hasData && reached,
    hasData,
  };
}

/** Série histórica de um exercício pela linhagem — usada no detalhe da meta. */
export function goalSeries(
  goal: CycleGoal,
  sessions: WorkoutSession[],
  exercises: Exercise[],
): { date: string; maxWeight: number }[] {
  if (!goal.exerciseLineageId) return [];
  return exerciseSeriesByLineage(sessions, exercises, goal.exerciseLineageId);
}

/** Texto honesto pra quando não há registro de onde partir — melhor dizer isso
 * do que exibir um zero que parece medição. */
export function finishedSessionsHint(kind: CycleGoalKind): string {
  if (kind === "frequencia") return "Conta os treinos finalizados dentro do período.";
  if (kind === "peso_corporal") return "Nenhum peso registrado ainda — informe o ponto de partida.";
  return "Nenhum registro deste exercício ainda — informe o ponto de partida.";
}

export const cycleGoalKindLabel: Record<CycleGoalKind, string> = {
  peso_corporal: "Peso corporal",
  carga: "Carga em um exercício",
  series_reps: "Séries e repetições",
  frequencia: "Frequência de treinos",
};

// ---------------------------------------------------------------------------
// Mapeamento
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function mapCycle(r: Row): WorkoutCycle {
  return {
    id: r.id as string,
    goalId: (r.goal_id as string) ?? undefined,
    name: r.name as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    status: r.status as CycleStatus,
    createdAt: r.created_at as string,
  };
}

function mapBlock(r: Row): CycleBlock {
  return {
    id: r.id as string,
    cycleId: r.cycle_id as string,
    stepId: (r.step_id as string) ?? undefined,
    name: r.name as string,
    focus: (r.focus as string) ?? undefined,
    muscleGroups: (r.muscle_groups as string) ?? undefined,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    order: (r.order_index as number) ?? 0,
  };
}

function mapCycleGoal(r: Row): CycleGoal {
  return {
    id: r.id as string,
    cycleId: r.cycle_id as string,
    blockId: (r.block_id as string) ?? undefined,
    kind: r.kind as CycleGoalKind,
    exerciseLineageId: (r.exercise_lineage_id as string) ?? undefined,
    exerciseLabel: (r.exercise_label as string) ?? undefined,
    referenceReps: (r.reference_reps as number) ?? undefined,
    startValue: Number(r.start_value),
    targetValue: Number(r.target_value),
    unit: r.unit as string,
    deadline: (r.deadline as string) ?? undefined,
    createdAt: r.created_at as string,
  };
}

export async function fetchCycleState(): Promise<State> {
  const [cyclesRes, blocksRes, blockPlansRes, blockDaysRes, goalsRes] = await Promise.all([
    supabase.from("workout_cycles").select("*").order("start_date", { ascending: false }),
    supabase.from("workout_cycle_blocks").select("*").order("order_index"),
    supabase.from("workout_block_plans").select("*").order("order_index"),
    supabase.from("workout_block_days").select("*").order("weekday"),
    supabase.from("workout_cycle_goals").select("*").order("created_at"),
  ]);
  return {
    cycles: (unwrap(cyclesRes) as Row[]).map(mapCycle),
    blocks: (unwrap(blocksRes) as Row[]).map(mapBlock),
    blockPlans: (unwrap(blockPlansRes) as Row[]).map((r) => ({
      id: r.id as string,
      blockId: r.block_id as string,
      planId: r.plan_id as string,
      order: (r.order_index as number) ?? 0,
    })),
    blockDays: (unwrap(blockDaysRes) as Row[]).map((r) => ({
      id: r.id as string,
      blockId: r.block_id as string,
      weekday: r.weekday as number,
      planId: (r.plan_id as string) ?? null,
      startTime: (r.start_time as string) ?? undefined,
    })),
    cycleGoals: (unwrap(goalsRes) as Row[]).map(mapCycleGoal),
  };
}

const QUERY_KEY = ["workout-cycle-domain"] as const;
const WORKOUT_KEY = ["workout-domain"] as const;

/** Invalida os dois domínios: criar um bloco copia treinos, e treino vive no
 * domínio da Academia. Sem isso a tela mostraria bloco novo com treino velho. */
async function invalidate() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: WORKOUT_KEY, refetchType: "all" }),
  ]);
}

export function useCycleStore<T>(selector: (s: State) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchCycleState, enabled: !!userId });
  return selector(data ?? EMPTY_STATE);
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export type NewBlockInput = {
  name: string;
  durationDays: number;
  focus?: string;
  muscleGroups?: string;
};

/** Cria o ciclo E o planejamento correspondente, de uma vez. O goal é a mesma
 * coisa vista em Planos; os blocos viram etapas dele. */
export async function createCycle(input: {
  name: string;
  startDate: string;
  blocks: NewBlockInput[];
  why?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const ranges = blockRangesFrom(
    input.startDate,
    input.blocks.map((b) => b.durationDays),
  );
  const endDate = ranges.at(-1)?.endDate ?? input.startDate;

  const { createGoal } = await import("./goals-store");
  const goal = await createGoal({
    title: input.name,
    why: input.why ?? "",
    trackingType: "etapas",
    kind: "projeto",
    category: "academia",
    lifeArea: "Saúde",
    deadlineLabel: `${daysBetweenISO(input.startDate, endDate) + 1} dias`,
    deadlineISO: endDate,
    metric: { target: input.blocks.length, unit: "blocos" },
    steps: input.blocks.map((b, i) => ({ title: b.name, targetDate: ranges[i].endDate })),
  });

  const cycle = unwrap<{ id: string }>(
    await supabase
      .from("workout_cycles")
      .insert({
        user_id: userId,
        goal_id: goal.id,
        name: input.name,
        start_date: input.startDate,
        end_date: endDate,
        status: "rascunho",
      })
      .select("id")
      .single(),
  );

  const { data: stepRows } = await supabase
    .from("steps")
    .select("id, order_index")
    .eq("goal_id", goal.id)
    .order("order_index");

  if (input.blocks.length > 0) {
    unwrap(
      await supabase.from("workout_cycle_blocks").insert(
        input.blocks.map((b, i) => ({
          user_id: userId,
          cycle_id: cycle.id,
          step_id: (stepRows ?? []).find((s) => s.order_index === i)?.id ?? null,
          name: b.name,
          focus: b.focus ?? null,
          muscle_groups: b.muscleGroups ?? null,
          start_date: ranges[i].startDate,
          end_date: ranges[i].endDate,
          order_index: i,
        })),
      ),
    );
  }
  await invalidate();
  return cycle.id;
}

export async function updateCycle(
  cycleId: string,
  patch: Partial<Pick<WorkoutCycle, "name" | "startDate" | "endDate">>,
) {
  const dbPatch: Row = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate;
  if (patch.endDate !== undefined) dbPatch.end_date = patch.endDate;
  if (Object.keys(dbPatch).length === 0) return;
  unwrap(await supabase.from("workout_cycles").update(dbPatch).eq("id", cycleId).select().single());
  await invalidate();
}

export async function addBlock(cycle: WorkoutCycle, input: NewBlockInput): Promise<string> {
  const userId = await ensureSession();
  const { data: existing } = await supabase
    .from("workout_cycle_blocks")
    .select("end_date, order_index")
    .eq("cycle_id", cycle.id)
    .order("order_index", { ascending: false })
    .limit(1);
  const last = existing?.[0];
  const startDate = last
    ? toISODate(addDays(new Date((last.end_date as string) + "T00:00:00"), 1))
    : cycle.startDate;
  const [range] = blockRangesFrom(startDate, [input.durationDays]);

  let stepId: string | null = null;
  if (cycle.goalId) {
    const { addStep } = await import("./goals-store");
    await addStep(cycle.goalId, input.name, range.endDate);
    const { data: steps } = await supabase
      .from("steps")
      .select("id")
      .eq("goal_id", cycle.goalId)
      .order("order_index", { ascending: false })
      .limit(1);
    stepId = (steps?.[0]?.id as string) ?? null;
  }

  const row = unwrap<{ id: string }>(
    await supabase
      .from("workout_cycle_blocks")
      .insert({
        user_id: userId,
        cycle_id: cycle.id,
        step_id: stepId,
        name: input.name,
        focus: input.focus ?? null,
        muscle_groups: input.muscleGroups ?? null,
        start_date: range.startDate,
        end_date: range.endDate,
        order_index: ((last?.order_index as number) ?? -1) + 1,
      })
      .select("id")
      .single(),
  );
  await supabase.from("workout_cycles").update({ end_date: range.endDate }).eq("id", cycle.id);
  await invalidate();
  return row.id;
}

export async function updateBlock(
  blockId: string,
  patch: Partial<Pick<CycleBlock, "name" | "focus" | "muscleGroups">>,
) {
  const dbPatch: Row = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.focus !== undefined) dbPatch.focus = patch.focus;
  if (patch.muscleGroups !== undefined) dbPatch.muscle_groups = patch.muscleGroups;
  if (Object.keys(dbPatch).length === 0) return;
  unwrap(
    await supabase.from("workout_cycle_blocks").update(dbPatch).eq("id", blockId).select().single(),
  );
  await invalidate();
}

/** Muda a duração de um bloco e EMPURRA só os seguintes. Blocos anteriores e o
 * histórico ficam onde estão — mudar uma fase futura não reescreve o passado. */
export async function resizeBlock(
  cycle: WorkoutCycle,
  blocks: CycleBlock[],
  blockId: string,
  durationDays: number,
) {
  const ordered = blocksForCycle(blocks, cycle.id);
  const index = ordered.findIndex((b) => b.id === blockId);
  if (index < 0) return;
  const durations = ordered.map((b, i) =>
    i === index ? Math.max(1, Math.round(durationDays)) : blockDurationDays(b),
  );
  const ranges = blockRangesFrom(ordered[0].startDate, durations);
  for (let i = index; i < ordered.length; i += 1) {
    await supabase
      .from("workout_cycle_blocks")
      .update({ start_date: ranges[i].startDate, end_date: ranges[i].endDate })
      .eq("id", ordered[i].id);
    if (ordered[i].stepId) {
      await supabase
        .from("steps")
        .update({ target_date: ranges[i].endDate })
        .eq("id", ordered[i].stepId!);
    }
  }
  await supabase
    .from("workout_cycles")
    .update({ end_date: ranges.at(-1)!.endDate })
    .eq("id", cycle.id);
  await invalidate();
}

/** Desloca o bloco e todos os seguintes em N dias. É o ajuste explícito que
 * substitui empurrar o ciclo inteiro sozinho quando o usuário falta. */
export async function shiftBlocksFrom(
  cycle: WorkoutCycle,
  blocks: CycleBlock[],
  fromBlockId: string,
  days: number,
) {
  if (days === 0) return;
  const ordered = blocksForCycle(blocks, cycle.id);
  const index = ordered.findIndex((b) => b.id === fromBlockId);
  if (index < 0) return;
  const shift = (iso: string) => toISODate(addDays(new Date(iso + "T00:00:00"), days));
  for (let i = index; i < ordered.length; i += 1) {
    const b = ordered[i];
    await supabase
      .from("workout_cycle_blocks")
      .update({ start_date: shift(b.startDate), end_date: shift(b.endDate) })
      .eq("id", b.id);
    if (b.stepId) {
      await supabase
        .from("steps")
        .update({ target_date: shift(b.endDate) })
        .eq("id", b.stepId);
    }
  }
  await supabase
    .from("workout_cycles")
    .update({ end_date: shift(ordered.at(-1)!.endDate) })
    .eq("id", cycle.id);
  await invalidate();
}

/** Remover o bloco ARQUIVA os treinos dele em vez de apagar: as sessões já
 * registradas apontam pra esses treinos, e apagá-los levaria o histórico. */
export async function removeBlock(blockId: string) {
  await supabase
    .from("workout_plans")
    .update({ archived_at: nowDate().toISOString(), block_id: null })
    .eq("block_id", blockId);
  const { data: block } = await supabase
    .from("workout_cycle_blocks")
    .select("step_id")
    .eq("id", blockId)
    .maybeSingle();
  await supabase.from("workout_cycle_blocks").delete().eq("id", blockId);
  if (block?.step_id)
    await supabase
      .from("steps")
      .delete()
      .eq("id", block.step_id as string);
  await invalidate();
}

/** Copia um treino (com exercícios e alvos por série) para dentro de um bloco.
 * A cópia é o que permite ajustar uma fase sem tocar na outra; `lineage_id`
 * preservado é o que mantém a evolução do exercício contínua entre elas. */
export async function copyPlanIntoBlock(blockId: string, sourcePlanId: string): Promise<string> {
  const userId = await ensureSession();
  const source = unwrap<Row>(
    await supabase.from("workout_plans").select("*").eq("id", sourcePlanId).single(),
  );
  const { count } = await supabase
    .from("workout_block_plans")
    .select("id", { count: "exact", head: true })
    .eq("block_id", blockId);
  const order = count ?? 0;

  const plan = unwrap<{ id: string }>(
    await supabase
      .from("workout_plans")
      .insert({
        user_id: userId,
        letter: source.letter as string,
        name: source.name as string,
        muscle_groups: (source.muscle_groups as string) ?? "",
        order_index: order,
        block_id: blockId,
        source_plan_id: sourcePlanId,
        lineage_id: source.lineage_id as string,
      })
      .select("id")
      .single(),
  );

  const { data: exercises } = await supabase
    .from("workout_exercises")
    .select("*")
    .eq("plan_id", sourcePlanId)
    .order("order_index");
  if (exercises && exercises.length > 0) {
    unwrap(
      await supabase.from("workout_exercises").insert(
        (exercises as Row[]).map((e) => ({
          user_id: userId,
          plan_id: plan.id,
          name: e.name as string,
          sets_target: e.sets_target as number,
          reps_target: e.reps_target as number,
          load_target: e.load_target as number,
          rest_seconds: e.rest_seconds as number,
          set_targets: e.set_targets ?? null,
          order_index: e.order_index as number,
          lineage_id: e.lineage_id as string,
        })),
      ),
    );
  }

  unwrap(
    await supabase
      .from("workout_block_plans")
      .insert({ user_id: userId, block_id: blockId, plan_id: plan.id, order_index: order })
      .select("id")
      .single(),
  );
  await invalidate();
  return plan.id;
}

/** Cria um treino vazio direto dentro do bloco. */
export async function createPlanInBlock(
  blockId: string,
  input: { letter: string; name: string; muscleGroups?: string },
): Promise<string> {
  const userId = await ensureSession();
  const { count } = await supabase
    .from("workout_block_plans")
    .select("id", { count: "exact", head: true })
    .eq("block_id", blockId);
  const order = count ?? 0;
  const plan = unwrap<{ id: string }>(
    await supabase
      .from("workout_plans")
      .insert({
        user_id: userId,
        letter: input.letter,
        name: input.name,
        muscle_groups: input.muscleGroups ?? "",
        order_index: order,
        block_id: blockId,
      })
      .select("id")
      .single(),
  );
  unwrap(
    await supabase
      .from("workout_block_plans")
      .insert({ user_id: userId, block_id: blockId, plan_id: plan.id, order_index: order })
      .select("id")
      .single(),
  );
  await invalidate();
  return plan.id;
}

/** Copia todos os treinos de um bloco pro outro, mantendo a linhagem. */
export async function copyBlockPrograms(fromBlockId: string, toBlockId: string) {
  const { data: rows } = await supabase
    .from("workout_block_plans")
    .select("plan_id")
    .eq("block_id", fromBlockId)
    .order("order_index");
  for (const r of rows ?? []) {
    await copyPlanIntoBlock(toBlockId, r.plan_id as string);
  }
  await invalidate();
}

/** Tira o treino do bloco. Arquiva em vez de apagar, pelo mesmo motivo de
 * `removeBlock`: sessões registradas apontam pra ele. */
export async function removePlanFromBlock(blockId: string, planId: string) {
  await supabase.from("workout_block_days").update({ plan_id: null }).eq("plan_id", planId);
  await supabase.from("workout_block_plans").delete().eq("block_id", blockId).eq("plan_id", planId);
  await supabase
    .from("workout_plans")
    .update({ archived_at: nowDate().toISOString(), block_id: null })
    .eq("id", planId);
  await invalidate();
}

export async function setBlockDay(
  blockId: string,
  weekday: number,
  planId: string | null,
  startTime?: string | null,
) {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("workout_block_days")
      .upsert(
        {
          user_id: userId,
          block_id: blockId,
          weekday,
          plan_id: planId,
          start_time: startTime ?? null,
        },
        { onConflict: "block_id,weekday" },
      )
      .select("id")
      .single(),
  );
  await invalidate();
}

/** Adiciona o MESMO exercício a vários treinos de uma vez — o caso de "duas
 * séries de abdominal nos treinos A até E". Cada treino recebe a sua própria
 * linha (para poder ajustar depois), mas todas compartilham a linhagem, então
 * a evolução do abdominal é uma curva só. */
export async function addExerciseToPlans(
  planIds: string[],
  input: {
    name: string;
    setsTarget: number;
    repsTarget: number;
    loadTarget: number;
    restSeconds: number;
    setTargets?: SetTarget[];
  },
): Promise<{ added: number; skipped: string[] }> {
  const userId = await ensureSession();
  const lineageId = crypto.randomUUID();
  const skipped: string[] = [];
  let added = 0;
  for (const planId of planIds) {
    // Não duplica em silêncio: se o treino já tem um exercício com esse nome,
    // ele é deixado como está e reportado de volta.
    const { data: existing } = await supabase
      .from("workout_exercises")
      .select("id")
      .eq("plan_id", planId)
      .ilike("name", input.name)
      .maybeSingle();
    if (existing) {
      skipped.push(planId);
      continue;
    }
    const { count } = await supabase
      .from("workout_exercises")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", planId);
    unwrap(
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
          order_index: count ?? 0,
          lineage_id: lineageId,
        })
        .select("id")
        .single(),
    );
    added += 1;
  }
  await invalidate();
  return { added, skipped };
}

/** O que precisaria ser criado na Agenda pros horários deste ciclo — mostrado
 * antes de criar. Rotina de academia que já existe naquele dia é mantida, não
 * duplicada nem sobrescrita. */
export type RoutinePlanItem = {
  weekday: number;
  time: string;
  title: string;
  alreadyExists: boolean;
};

export function routinePlanForBlock(
  block: CycleBlock,
  blockDays: BlockDay[],
  plans: WorkoutPlan[],
  existingRoutines: { category: string; weekday: number; active: boolean }[],
): RoutinePlanItem[] {
  return daysOfBlock(blockDays, block.id)
    .filter((d) => d.planId && d.startTime)
    .map((d) => {
      const plan = plans.find((p) => p.id === d.planId);
      return {
        weekday: d.weekday,
        time: d.startTime!,
        title: plan ? `Treino ${plan.letter} · ${plan.name}` : "Treino",
        alreadyExists: existingRoutines.some(
          (r) => r.category === "academia" && r.weekday === d.weekday && r.active,
        ),
      };
    });
}

export async function applyRoutinePlan(items: RoutinePlanItem[]) {
  const { createRoutine } = await import("./goals-store");
  for (const item of items) {
    if (item.alreadyExists) continue;
    await createRoutine({
      category: "academia",
      title: item.title,
      weekday: item.weekday,
      time: item.time,
    });
  }
}

/** Ativar torna esta a programação vigente. O índice único no banco garante um
 * ciclo ativo por vez; aqui o anterior é encerrado explicitamente em vez de
 * duas programações passarem a valer juntas. */
export async function activateCycle(cycleId: string) {
  const userId = await ensureSession();
  await supabase
    .from("workout_cycles")
    .update({ status: "concluido" })
    .eq("user_id", userId)
    .eq("status", "ativo");
  unwrap(
    await supabase
      .from("workout_cycles")
      .update({ status: "ativo" })
      .eq("id", cycleId)
      .select()
      .single(),
  );
  await invalidate();
}

export async function setCycleStatus(cycleId: string, status: CycleStatus) {
  unwrap(
    await supabase.from("workout_cycles").update({ status }).eq("id", cycleId).select().single(),
  );
  await invalidate();
}

export async function removeCycle(cycleId: string) {
  const { data: blocks } = await supabase
    .from("workout_cycle_blocks")
    .select("id")
    .eq("cycle_id", cycleId);
  for (const b of blocks ?? []) await removeBlock(b.id as string);
  const { data: cycle } = await supabase
    .from("workout_cycles")
    .select("goal_id")
    .eq("id", cycleId)
    .maybeSingle();
  await supabase.from("workout_cycles").delete().eq("id", cycleId);
  if (cycle?.goal_id)
    await supabase
      .from("goals")
      .delete()
      .eq("id", cycle.goal_id as string);
  await invalidate();
}

export async function createCycleGoal(input: {
  cycleId: string;
  blockId?: string;
  kind: CycleGoalKind;
  exerciseLineageId?: string;
  exerciseLabel?: string;
  referenceReps?: number;
  startValue: number;
  targetValue: number;
  unit: string;
  deadline?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("workout_cycle_goals")
      .insert({
        user_id: userId,
        cycle_id: input.cycleId,
        block_id: input.blockId ?? null,
        kind: input.kind,
        exercise_lineage_id: input.exerciseLineageId ?? null,
        exercise_label: input.exerciseLabel ?? null,
        reference_reps: input.referenceReps ?? null,
        start_value: input.startValue,
        target_value: input.targetValue,
        unit: input.unit,
        deadline: input.deadline ?? null,
      })
      .select("id")
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function removeCycleGoal(goalId: string) {
  await supabase.from("workout_cycle_goals").delete().eq("id", goalId);
  await invalidate();
}
