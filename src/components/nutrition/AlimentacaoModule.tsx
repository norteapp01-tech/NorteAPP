import { useRef, useState } from "react";
import {
  Check,
  Circle,
  RotateCw,
  Ellipsis,
  Plus,
  Camera,
  Sparkles,
  CalendarDays,
  ChevronRight,
  Flame,
  Dumbbell,
} from "lucide-react";
import { todayISO, toISODate } from "@/lib/goals-store";
import { nowDate } from "@/lib/test-clock";
import {
  useNutritionStore,
  mealsForWeekday,
  logForMealOnDate,
  mealStatus,
  dailyTotals,
  confirmMealCustom,
  addMeal,
  type Meal,
  type MealLog,
  type MealStatus,
} from "@/lib/nutrition-store";
import { useWorkoutStore, todaysPlanId } from "@/lib/workout-store";
import { MacroSummary } from "./MacroSummary";
import { MealDetailSheet } from "./MealDetailSheet";
import { EditDietSheet } from "./EditDietSheet";
import { Modal } from "@/components/ui/modal";

const todayLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(
  nowDate(),
);
const statusMeta: Record<MealStatus, { icon: typeof Check; className: string }> = {
  as_planned: { icon: Check, className: "text-success" },
  adjusted: { icon: RotateCw, className: "text-warning" },
  pending: { icon: Circle, className: "text-muted-foreground" },
};

function nutritionStreak(logs: MealLog[], goals: ReturnType<typeof dailyTotals>): number {
  let streak = 0;
  const cursor = new Date(nowDate());
  cursor.setHours(12, 0, 0, 0);
  for (let i = 0; i < 365; i += 1) {
    const totals = dailyTotals(logs, toISODate(cursor));
    const hit =
      goals.calories > 0 &&
      totals.calories >= goals.calories * 0.85 &&
      totals.protein >= goals.protein * 0.85;
    // Um dia ainda em andamento não apaga a sequência conquistada até ontem.
    if (!hit && i === 0) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (!hit) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function AlimentacaoModule() {
  const state = useNutritionStore((s) => s);
  const workout = useWorkoutStore((s) => s);
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);
  const [editingDiet, setEditingDiet] = useState(false);
  const [quickEntry, setQuickEntry] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const date = todayISO();
  const meals = mealsForWeekday(state.meals, nowDate().getDay());
  const totals = dailyTotals(state.logs, date);
  const nowTime = nowDate().toTimeString().slice(0, 5);
  const nextMeal = meals.find(
    (meal) => !logForMealOnDate(state.logs, meal.id, date) && meal.time >= nowTime,
  );
  const streak = nutritionStreak(state.logs, state.goals);
  const trainingToday = Boolean(todaysPlanId(workout.weeklyAssignment));
  const remainingProtein = Math.max(0, Math.round(state.goals.protein - totals.protein));
  const yesterday = new Date(nowDate());
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayLog = state.logs
    .filter((log) => log.date === toISODate(yesterday))
    .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))[0];

  const repeatYesterday = async () => {
    if (!yesterdayLog) return;
    const meal = meals.find((item) => item.id === yesterdayLog.mealId) ?? meals[0];
    if (!meal) return;
    await confirmMealCustom(
      meal.id,
      yesterdayLog.description,
      {
        protein: yesterdayLog.protein,
        carbs: yesterdayLog.carbs,
        fat: yesterdayLog.fat,
        calories: yesterdayLog.calories,
      },
      date,
    );
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Hoje, {todayLabel}</p>
        <button
          aria-label="Abrir plano alimentar"
          onClick={() => setEditingDiet(true)}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground"
        >
          <Ellipsis className="h-4 w-4" />
        </button>
      </div>
      <MacroSummary totals={totals} goals={state.goals} />
      {streak > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Flame className="h-4 w-4" /> {streak} {streak === 1 ? "dia" : "dias"} no ritmo
        </p>
      )}

      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Refeições de hoje
        </h3>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
          {meals.length === 0 ? (
            <button
              onClick={() => setEditingDiet(true)}
              className="w-full p-5 text-left text-sm text-muted-foreground"
            >
              Monte seu primeiro dia alimentar <span className="text-primary">começar</span>
            </button>
          ) : (
            meals.map((meal) => {
              const status = mealStatus(state.logs, meal.id, date);
              const log = logForMealOnDate(state.logs, meal.id, date);
              const meta = statusMeta[status];
              const Icon = meta.icon;
              const isNext = nextMeal?.id === meal.id;
              return (
                <div
                  key={meal.id}
                  className={`relative flex items-center gap-3 border-b border-border p-3.5 last:border-b-0 ${isNext ? "bg-primary/[0.04]" : ""}`}
                >
                  {isNext && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
                  <button
                    onClick={() => setOpenMeal(meal)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${meta.className}`} />
                    <span className="w-11 shrink-0 font-mono text-xs text-muted-foreground">
                      {meal.time}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{meal.name}</span>
                        {isNext && (
                          <span className="text-[9px] font-semibold uppercase text-primary">
                            Próxima
                          </span>
                        )}
                      </span>
                      {log && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {log.description} · {Math.round(log.calories)} kcal
                        </span>
                      )}
                    </span>
                  </button>
                  {isNext ? (
                    <button
                      onClick={() => setOpenMeal(meal)}
                      className="shrink-0 rounded-lg border border-primary/60 px-2.5 py-1.5 text-[10px] font-semibold text-primary"
                    >
                      Marcar feita
                    </button>
                  ) : (
                    <button onClick={() => setOpenMeal(meal)} aria-label={`Opções de ${meal.name}`}>
                      <Ellipsis className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              );
            })
          )}
          <button
            onClick={() => setQuickEntry(true)}
            className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground"
          >
            <Plus className="h-4 w-4" /> Registro rápido
          </button>
        </div>
      </section>

      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Registro rápido
        </h3>
        <div className="mt-3 grid grid-cols-[1fr_1.4fr_auto] divide-x divide-border overflow-hidden rounded-xl border border-border bg-surface">
          <button
            disabled={!yesterdayLog || meals.length === 0}
            onClick={() => void repeatYesterday()}
            className="flex items-center gap-2 p-3 text-left text-[11px] disabled:opacity-35"
          >
            <RotateCw className="h-4 w-4 shrink-0 text-muted-foreground" /> Repetir de ontem
          </button>
          <button
            onClick={() => setQuickEntry(true)}
            className="flex items-center gap-2 p-3 text-left text-[11px] text-muted-foreground"
          >
            <Sparkles className="h-4 w-4 shrink-0" /> Descreva seu prato…
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            aria-label="Registrar com foto"
            className="p-3.5 text-muted-foreground"
          >
            <Camera className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={() => setQuickEntry(true)}
          />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Sugestão de macros para revisão antes de salvar.
        </p>
      </section>

      {remainingProtein > 0 && remainingProtein <= 30 && (
        <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-xs text-muted-foreground">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Faltam {remainingProtein} g de proteína — que tal um lanche?
          </span>
        </div>
      )}
      {trainingToday && (
        <p className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
          <Dumbbell className="h-4 w-4 text-primary" /> Dia de treino: revise se sua meta precisa de
          ajuste.
        </p>
      )}
      <button
        onClick={() => setEditingDiet(true)}
        className="flex w-full items-center gap-3 border-y border-border py-3 text-left"
      >
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Plano alimentar</span>
          <span className="block truncate text-xs text-muted-foreground">
            {new Set(state.meals.flatMap((meal) => meal.weekdays)).size} dias configurados ·{" "}
            {state.meals.length} refeições
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
      {openMeal && <MealDetailSheet meal={openMeal} onClose={() => setOpenMeal(null)} />}
      {editingDiet && <EditDietSheet onClose={() => setEditingDiet(false)} />}
      {quickEntry && <QuickMealSheet meals={meals} onClose={() => setQuickEntry(false)} />}
    </div>
  );
}

function estimateMacros(text: string) {
  const lower = text.toLowerCase();
  const result = { protein: 0, carbs: 0, fat: 0, calories: 0 };
  const add = (needle: string, values: [number, number, number, number]) => {
    if (!lower.includes(needle)) return;
    result.protein += values[0];
    result.carbs += values[1];
    result.fat += values[2];
    result.calories += values[3];
  };
  add("frango", [35, 0, 5, 190]);
  add("arroz", [4, 45, 1, 210]);
  add("feijão", [8, 24, 1, 130]);
  add("ovo", [12, 1, 10, 140]);
  add("pão", [5, 28, 2, 150]);
  add("banana", [1, 24, 0, 95]);
  add("salada", [2, 10, 1, 55]);
  return result;
}

function QuickMealSheet({ meals, onClose }: { meals: Meal[]; onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [mealId, setMealId] = useState(meals[0]?.id ?? "new");
  const [name, setName] = useState("Refeição");
  const [time, setTime] = useState(nowDate().toTimeString().slice(0, 5));
  const [macros, setMacros] = useState({ protein: "", carbs: "", fat: "", calories: "" });
  const [saving, setSaving] = useState(false);
  const suggest = () => {
    const estimate = estimateMacros(description);
    setMacros(
      Object.fromEntries(
        Object.entries(estimate).map(([key, value]) => [key, value ? String(value) : ""]),
      ) as typeof macros,
    );
  };
  const save = async () => {
    if (!description.trim() || saving) return;
    setSaving(true);
    try {
      const targetId =
        mealId === "new" ? await addMeal({ name, time, weekdays: [nowDate().getDay()] }) : mealId;
      await confirmMealCustom(targetId, description, {
        protein: macros.protein ? Number(macros.protein) : undefined,
        carbs: macros.carbs ? Number(macros.carbs) : undefined,
        fat: macros.fat ? Number(macros.fat) : undefined,
        calories: macros.calories ? Number(macros.calories) : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal onClose={onClose} title="Registro rápido">
      <div className="space-y-3">
        <textarea
          autoFocus
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Ex: arroz, feijão, frango e salada"
          className="min-h-20 w-full resize-none rounded-xl border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={suggest}
          className="flex items-center gap-2 text-xs font-semibold text-primary"
        >
          <Sparkles className="h-4 w-4" /> Sugerir macros pelo texto
        </button>
        <select
          value={mealId}
          onChange={(event) => setMealId(event.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 p-2.5 text-xs"
        >
          {meals.map((meal) => (
            <option key={meal.id} value={meal.id}>
              {meal.time} · {meal.name}
            </option>
          ))}
          <option value="new">Novo horário no dia</option>
        </select>
        {mealId === "new" && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs"
            />
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs"
            />
          </div>
        )}
        <div className="grid grid-cols-4 gap-2">
          {(["protein", "carbs", "fat", "calories"] as const).map((key) => (
            <label key={key} className="text-[9px] uppercase text-muted-foreground">
              {key === "protein"
                ? "Prot."
                : key === "carbs"
                  ? "Carb."
                  : key === "fat"
                    ? "Gord."
                    : "Kcal"}
              <input
                type="number"
                value={macros[key]}
                onChange={(event) => setMacros({ ...macros, [key]: event.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 p-2 text-xs text-foreground"
              />
            </label>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Estimativas são sugestões. Revise os valores ou deixe-os em branco.
        </p>
        <button
          disabled={!description.trim() || saving}
          onClick={() => void save()}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Confirmar refeição"}
        </button>
      </div>
    </Modal>
  );
}
