import { useQuery } from "@tanstack/react-query";
import { todayISO } from "./goals-store";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";

// ---------------------------------------------------------------------------
// Alimentação — a dieta virou rotina de execução, não um contador de
// alimentos. A unidade cadastrável é a OPÇÃO DE REFEIÇÃO (descrição livre +
// totais opcionais da refeição inteira) — sem breakdown por ingrediente. Os
// 4 campos de macro em MealOption são o ponto de extensão futuro: quando
// houver IA que interpreta a descrição, ela só precisa preencher esses
// campos — nenhuma mudança de forma será necessária.
//
// Persistida no Supabase (mesmo padrão de goals-store.ts) — seletores puros
// abaixo continuam 100% inalterados, só a camada de leitura/escrita mudou.
// ---------------------------------------------------------------------------

export type Meal = {
  id: string;
  time: string; // HH:MM
  name: string;
  order: number;
};

export type MealOption = {
  id: string;
  mealId: string;
  description: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  calories?: number;
};

export type DailyGoals = {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
};

export type MealLogSource = "option" | "custom";
export type MealLog = {
  id: string;
  mealId: string;
  date: string;
  source: MealLogSource;
  optionId?: string;
  description: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  confirmedAt: string;
};

export type MealStatus = "pending" | "as_planned" | "adjusted";

type State = {
  meals: Meal[];
  options: MealOption[];
  goals: DailyGoals;
  logs: MealLog[];
};

const DEFAULT_GOALS: DailyGoals = { protein: 160, carbs: 280, fat: 70, calories: 2500 };
const EMPTY_STATE: State = { meals: [], options: [], goals: DEFAULT_GOALS, logs: [] };

// ---------------------------------------------------------------------------
// Seletores puros
// ---------------------------------------------------------------------------
export function mealsSorted(meals: Meal[]): Meal[] {
  return [...meals].sort((a, b) => a.time.localeCompare(b.time));
}

export function optionsForMeal(options: MealOption[], mealId: string): MealOption[] {
  return options.filter((o) => o.mealId === mealId);
}

export function logForMealOnDate(
  logs: MealLog[],
  mealId: string,
  date: string,
): MealLog | undefined {
  return logs.find((l) => l.mealId === mealId && l.date === date);
}

export function mealStatus(logs: MealLog[], mealId: string, date: string): MealStatus {
  const log = logForMealOnDate(logs, mealId, date);
  if (!log) return "pending";
  return log.source === "option" ? "as_planned" : "adjusted";
}

export function dailyTotals(logs: MealLog[], date: string): DailyGoals {
  return logs
    .filter((l) => l.date === date)
    .reduce(
      (acc, l) => ({
        protein: acc.protein + l.protein,
        carbs: acc.carbs + l.carbs,
        fat: acc.fat + l.fat,
        calories: acc.calories + l.calories,
      }),
      { protein: 0, carbs: 0, fat: 0, calories: 0 },
    );
}

/** Nunca quebra passando da meta — a barra satura em 100%, o texto mostra o valor real. */
export function macroProgress(current: number, goal: number): { pct: number; label: string } {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  return { pct, label: `${Math.round(current)} / ${Math.round(goal)}` };
}

// ---------------------------------------------------------------------------
// Mapeamento snake_case (Supabase) -> camelCase (tipos acima)
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function mapMeal(r: Row): Meal {
  return {
    id: r.id as string,
    time: r.time as string,
    name: r.name as string,
    order: (r.order_index as number) ?? 0,
  };
}

function mapOption(r: Row): MealOption {
  return {
    id: r.id as string,
    mealId: r.meal_id as string,
    description: r.description as string,
    protein: (r.protein as number) ?? undefined,
    carbs: (r.carbs as number) ?? undefined,
    fat: (r.fat as number) ?? undefined,
    calories: (r.calories as number) ?? undefined,
  };
}

function mapLog(r: Row): MealLog {
  return {
    id: r.id as string,
    mealId: r.meal_id as string,
    date: r.date as string,
    source: r.source as MealLogSource,
    optionId: (r.option_id as string) ?? undefined,
    description: r.description as string,
    protein: (r.protein as number) ?? 0,
    carbs: (r.carbs as number) ?? 0,
    fat: (r.fat as number) ?? 0,
    calories: (r.calories as number) ?? 0,
    confirmedAt: r.confirmed_at as string,
  };
}

function mapGoals(r: Row): DailyGoals {
  return {
    protein: (r.protein as number) ?? 0,
    carbs: (r.carbs as number) ?? 0,
    fat: (r.fat as number) ?? 0,
    calories: (r.calories as number) ?? 0,
  };
}

async function fetchState(): Promise<State> {
  const [mealsRes, optionsRes, logsRes, goalsRes] = await Promise.all([
    supabase.from("meals").select("*").order("order_index"),
    supabase.from("meal_options").select("*"),
    supabase.from("meal_logs").select("*").order("date", { ascending: false }),
    supabase.from("nutrition_goals").select("*").maybeSingle(),
  ]);
  const mealRows = unwrap(mealsRes);
  const optionRows = unwrap(optionsRes);
  const logRows = unwrap(logsRes);
  if (goalsRes.error) throw new Error(goalsRes.error.message);

  return {
    meals: (mealRows as Row[]).map(mapMeal),
    options: (optionRows as Row[]).map(mapOption),
    logs: (logRows as Row[]).map(mapLog),
    goals: goalsRes.data ? mapGoals(goalsRes.data as Row) : DEFAULT_GOALS,
  };
}

const QUERY_KEY = ["nutrition-domain"] as const;
function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

export function useNutritionStore<T>(selector: (s: State) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return selector(data ?? EMPTY_STATE);
}

// ---------------------------------------------------------------------------
// Ações — metas
// ---------------------------------------------------------------------------
export async function setDailyGoals(goals: DailyGoals) {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("nutrition_goals")
      .upsert({ user_id: userId, ...goals }, { onConflict: "user_id" })
      .select()
      .single(),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — refeições e opções (a dieta / o plano)
// ---------------------------------------------------------------------------
export async function addMeal(input: { time: string; name: string }): Promise<string> {
  const userId = await ensureSession();
  const { count } = await supabase.from("meals").select("id", { count: "exact", head: true });
  const row = unwrap<{ id: string }>(
    await supabase
      .from("meals")
      .insert({
        user_id: userId,
        time: input.time,
        name: input.name.trim(),
        order_index: count ?? 0,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function updateMeal(id: string, patch: { time?: string; name?: string }) {
  const dbPatch: Row = {};
  if (patch.time !== undefined) dbPatch.time = patch.time;
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  unwrap(await supabase.from("meals").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

/** Deleta em cascata (options + logs) direto no banco — mesma FK já garantia isso em memória. */
export async function removeMeal(id: string) {
  await supabase.from("meals").delete().eq("id", id);
  await invalidate();
}

export async function addMealOption(
  mealId: string,
  input: { description: string; protein?: number; carbs?: number; fat?: number; calories?: number },
): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("meal_options")
      .insert({
        user_id: userId,
        meal_id: mealId,
        description: input.description.trim(),
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        calories: input.calories,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function updateMealOption(
  id: string,
  patch: {
    description?: string;
    protein?: number;
    carbs?: number;
    fat?: number;
    calories?: number;
  },
) {
  const dbPatch: Row = {};
  if (patch.description !== undefined) dbPatch.description = patch.description.trim();
  if (patch.protein !== undefined) dbPatch.protein = patch.protein;
  if (patch.carbs !== undefined) dbPatch.carbs = patch.carbs;
  if (patch.fat !== undefined) dbPatch.fat = patch.fat;
  if (patch.calories !== undefined) dbPatch.calories = patch.calories;
  unwrap(await supabase.from("meal_options").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

/** `option_id` nos logs vira null automaticamente (FK on delete set null) — não precisa passo manual. */
export async function removeMealOption(id: string) {
  await supabase.from("meal_options").delete().eq("id", id);
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — execução do dia (confirmar refeição)
// ---------------------------------------------------------------------------
export async function confirmMealOption(
  mealId: string,
  optionId: string,
  date: string = todayISO(),
): Promise<void> {
  const userId = await ensureSession();
  const optRow = unwrap<Row>(
    await supabase.from("meal_options").select("*").eq("id", optionId).single(),
  );
  unwrap(
    await supabase
      .from("meal_logs")
      .upsert(
        {
          user_id: userId,
          meal_id: mealId,
          date,
          source: "option",
          option_id: optionId,
          description: optRow.description,
          protein: (optRow.protein as number) ?? 0,
          carbs: (optRow.carbs as number) ?? 0,
          fat: (optRow.fat as number) ?? 0,
          calories: (optRow.calories as number) ?? 0,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "meal_id,date" },
      )
      .select()
      .single(),
  );
  await invalidate();
}

export async function confirmMealCustom(
  mealId: string,
  description: string,
  macros: { protein?: number; carbs?: number; fat?: number; calories?: number } = {},
  date: string = todayISO(),
): Promise<void> {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("meal_logs")
      .upsert(
        {
          user_id: userId,
          meal_id: mealId,
          date,
          source: "custom",
          option_id: null,
          description: description.trim(),
          protein: macros.protein ?? 0,
          carbs: macros.carbs ?? 0,
          fat: macros.fat ?? 0,
          calories: macros.calories ?? 0,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "meal_id,date" },
      )
      .select()
      .single(),
  );
  await invalidate();
}
