import { useSyncExternalStore } from "react";
import { todayISO } from "./goals-store";

// ---------------------------------------------------------------------------
// Alimentação — a dieta virou rotina de execução, não um contador de
// alimentos. A unidade cadastrável é a OPÇÃO DE REFEIÇÃO (descrição livre +
// totais opcionais da refeição inteira) — sem breakdown por ingrediente. Os
// 4 campos de macro em MealOption são o ponto de extensão futuro: quando
// houver IA que interpreta a descrição, ela só precisa preencher esses
// campos — nenhuma mudança de forma será necessária.
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

let seq = 0;
function genId(prefix: string) {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

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
// Seed — ecoa o exemplo do próprio pedido: Café e Almoço já confirmados hoje,
// Lanche e Jantar pendentes.
// ---------------------------------------------------------------------------
function buildSeedState(): State {
  const meals: Meal[] = [
    { id: "meal-cafe", time: "07:30", name: "Café da manhã", order: 0 },
    { id: "meal-almoco", time: "12:30", name: "Almoço", order: 1 },
    { id: "meal-lanche", time: "16:00", name: "Lanche", order: 2 },
    { id: "meal-jantar", time: "20:00", name: "Jantar", order: 3 },
  ];

  const options: MealOption[] = [
    {
      id: "opt-cafe-a",
      mealId: "meal-cafe",
      description: "2 ovos + banana + café",
      protein: 17,
      carbs: 25,
      fat: 12,
      calories: 280,
    },
    {
      id: "opt-cafe-b",
      mealId: "meal-cafe",
      description: "Iogurte + granola + morango",
      protein: 14,
      carbs: 32,
      fat: 8,
      calories: 260,
    },
    {
      id: "opt-cafe-c",
      mealId: "meal-cafe",
      description: "Pão + ovos + queijo",
      protein: 19,
      carbs: 30,
      fat: 14,
      calories: 320,
    },
    {
      id: "opt-almoco-a",
      mealId: "meal-almoco",
      description: "Frango + arroz + feijão + salada",
      protein: 48,
      carbs: 72,
      fat: 14,
      calories: 610,
    },
    {
      id: "opt-almoco-b",
      mealId: "meal-almoco",
      description: "Carne moída + batata doce + legumes",
      protein: 44,
      carbs: 58,
      fat: 18,
      calories: 590,
    },
    {
      id: "opt-lanche-a",
      mealId: "meal-lanche",
      description: "Whey + banana",
      protein: 24,
      carbs: 28,
      fat: 3,
      calories: 250,
    },
    {
      id: "opt-lanche-b",
      mealId: "meal-lanche",
      description: "Pasta de amendoim + torrada",
      protein: 12,
      carbs: 26,
      fat: 16,
      calories: 290,
    },
    {
      id: "opt-jantar-a",
      mealId: "meal-jantar",
      description: "Salmão + arroz + legumes",
      protein: 35,
      carbs: 58,
      fat: 16,
      calories: 540,
    },
    {
      id: "opt-jantar-b",
      mealId: "meal-jantar",
      description: "Omelete + salada + torrada",
      protein: 28,
      carbs: 30,
      fat: 18,
      calories: 420,
    },
  ];

  const goals: DailyGoals = { protein: 160, carbs: 280, fat: 70, calories: 2500 };

  const today = todayISO();
  const now = new Date().toISOString();
  const logs: MealLog[] = [
    {
      id: genId("mlog"),
      mealId: "meal-cafe",
      date: today,
      source: "option",
      optionId: "opt-cafe-a",
      description: "2 ovos + banana + café",
      protein: 17,
      carbs: 25,
      fat: 12,
      calories: 280,
      confirmedAt: now,
    },
    {
      id: genId("mlog"),
      mealId: "meal-almoco",
      date: today,
      source: "option",
      optionId: "opt-almoco-a",
      description: "Frango + arroz + feijão + salada",
      protein: 48,
      carbs: 72,
      fat: 14,
      calories: 610,
      confirmedAt: now,
    },
  ];

  return { meals, options, goals, logs };
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

export function useNutritionStore<T>(selector: (s: State) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector(snap);
}

// ---------------------------------------------------------------------------
// Ações — metas
// ---------------------------------------------------------------------------
export function setDailyGoals(goals: DailyGoals) {
  set((s) => ({ ...s, goals }));
}

// ---------------------------------------------------------------------------
// Ações — refeições e opções (a dieta / o plano)
// ---------------------------------------------------------------------------
export function addMeal(input: { time: string; name: string }): string {
  const id = genId("meal");
  set((s) => ({
    ...s,
    meals: [...s.meals, { id, time: input.time, name: input.name.trim(), order: s.meals.length }],
  }));
  return id;
}

export function updateMeal(id: string, patch: { time?: string; name?: string }) {
  set((s) => ({
    ...s,
    meals: s.meals.map((m) =>
      m.id === id ? { ...m, ...patch, name: patch.name?.trim() ?? m.name } : m,
    ),
  }));
}

export function removeMeal(id: string) {
  set((s) => ({
    ...s,
    meals: s.meals.filter((m) => m.id !== id),
    options: s.options.filter((o) => o.mealId !== id),
    logs: s.logs.filter((l) => l.mealId !== id),
  }));
}

export function addMealOption(
  mealId: string,
  input: { description: string; protein?: number; carbs?: number; fat?: number; calories?: number },
): string {
  const id = genId("mopt");
  set((s) => ({
    ...s,
    options: [
      ...s.options,
      {
        id,
        mealId,
        description: input.description.trim(),
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        calories: input.calories,
      },
    ],
  }));
  return id;
}

export function updateMealOption(
  id: string,
  patch: {
    description?: string;
    protein?: number;
    carbs?: number;
    fat?: number;
    calories?: number;
  },
) {
  set((s) => ({
    ...s,
    options: s.options.map((o) =>
      o.id === id ? { ...o, ...patch, description: patch.description?.trim() ?? o.description } : o,
    ),
  }));
}

export function removeMealOption(id: string) {
  set((s) => ({
    ...s,
    options: s.options.filter((o) => o.id !== id),
    logs: s.logs.map((l) => (l.optionId === id ? { ...l, optionId: undefined } : l)),
  }));
}

// ---------------------------------------------------------------------------
// Ações — execução do dia (confirmar refeição)
// ---------------------------------------------------------------------------
function upsertLog(s: State, log: MealLog): State {
  const idx = s.logs.findIndex((l) => l.mealId === log.mealId && l.date === log.date);
  if (idx >= 0) {
    const logs = [...s.logs];
    logs[idx] = log;
    return { ...s, logs };
  }
  return { ...s, logs: [...s.logs, log] };
}

export function confirmMealOption(mealId: string, optionId: string, date: string = todayISO()) {
  const option = state.options.find((o) => o.id === optionId);
  if (!option) return;
  const log: MealLog = {
    id: genId("mlog"),
    mealId,
    date,
    source: "option",
    optionId,
    description: option.description,
    protein: option.protein ?? 0,
    carbs: option.carbs ?? 0,
    fat: option.fat ?? 0,
    calories: option.calories ?? 0,
    confirmedAt: new Date().toISOString(),
  };
  set((s) => upsertLog(s, log));
}

export function confirmMealCustom(
  mealId: string,
  description: string,
  macros: { protein?: number; carbs?: number; fat?: number; calories?: number } = {},
  date: string = todayISO(),
) {
  const log: MealLog = {
    id: genId("mlog"),
    mealId,
    date,
    source: "custom",
    description: description.trim(),
    protein: macros.protein ?? 0,
    carbs: macros.carbs ?? 0,
    fat: macros.fat ?? 0,
    calories: macros.calories ?? 0,
    confirmedAt: new Date().toISOString(),
  };
  set((s) => upsertLog(s, log));
}
