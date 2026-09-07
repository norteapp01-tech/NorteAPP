import { useState } from "react";
import { Check, Circle, RotateCw, Plus, ChevronRight, Utensils, Settings2 } from "lucide-react";
import { todayISO } from "@/lib/goals-store";
import { nowDate } from "@/lib/test-clock";
import {
  useNutritionStore,
  mealsForWeekday,
  optionsForMeal,
  assignmentFor,
  logForMealOnDate,
  mealStatus,
  dailyTotals,
  addMeal,
  updateMeal,
  addMealOption,
  setMealPlanAssignment,
  setDailyGoals,
  type Meal,
  type MealOption,
  type MealStatus,
} from "@/lib/nutrition-store";
import { MacroSummary } from "./MacroSummary";
import { MealDetailSheet } from "./MealDetailSheet";
import { Modal } from "@/components/ui/modal";

const todayLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(
  nowDate(),
);
const week = [
  { day: 1, label: "Seg" },
  { day: 2, label: "Ter" },
  { day: 3, label: "Qua" },
  { day: 4, label: "Qui" },
  { day: 5, label: "Sex" },
  { day: 6, label: "Sáb" },
  { day: 0, label: "Dom" },
];
const commonMoments = [
  ["Café da manhã", "08:00"],
  ["Almoço", "12:30"],
  ["Lanche da tarde", "16:00"],
  ["Jantar", "20:00"],
] as const;
const statusMeta: Record<MealStatus, { icon: typeof Check; className: string }> = {
  as_planned: { icon: Check, className: "text-success" },
  adjusted: { icon: RotateCw, className: "text-warning" },
  pending: { icon: Circle, className: "text-muted-foreground" },
};

export function AlimentacaoModule() {
  const state = useNutritionStore((s) => s);
  const [tab, setTab] = useState<"today" | "plan">("today");
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);
  const date = todayISO();
  const totals = dailyTotals(state.logs, date);

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 rounded-xl border border-border bg-surface p-1">
        <Tab active={tab === "today"} onClick={() => setTab("today")}>
          Hoje
        </Tab>
        <Tab active={tab === "plan"} onClick={() => setTab("plan")}>
          Plano alimentar
        </Tab>
      </div>
      {tab === "today" ? (
        <TodayTab state={state} totals={totals} onOpenMeal={setOpenMeal} />
      ) : (
        <PlanTab state={state} />
      )}
      {openMeal && <MealDetailSheet meal={openMeal} onClose={() => setOpenMeal(null)} />}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg py-2.5 text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}

function TodayTab({
  state,
  totals,
  onOpenMeal,
}: {
  state: ReturnType<typeof useNutritionStore>;
  totals: ReturnType<typeof dailyTotals>;
  onOpenMeal: (meal: Meal) => void;
}) {
  const weekday = nowDate().getDay();
  const meals = mealsForWeekday(state.meals, weekday);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Hoje, {todayLabel}</p>
      <MacroSummary totals={totals} goals={state.goals} />
      <section>
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Refeições de hoje
        </h3>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
          {meals.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
              Nada planejado para hoje. Use a aba{" "}
              <span className="text-primary">Plano alimentar</span>.
            </div>
          ) : (
            meals.map((meal) => {
              const log = logForMealOnDate(state.logs, meal.id, todayISO());
              const assignment = assignmentFor(state.assignments, meal.id, weekday);
              const planned = state.options.find((option) => option.id === assignment?.optionId);
              const meta = statusMeta[mealStatus(state.logs, meal.id, todayISO())];
              const Icon = meta.icon;
              return (
                <button
                  key={meal.id}
                  onClick={() => onOpenMeal(meal)}
                  className="flex w-full items-center gap-3 border-b border-border p-4 text-left last:border-b-0"
                >
                  <Icon className={`h-5 w-5 shrink-0 ${meta.className}`} />
                  <span className="w-11 font-mono text-xs text-muted-foreground">
                    {assignment?.time ?? meal.time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{meal.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {log?.description ?? planned?.description ?? "Escolher uma opção"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function PlanTab({ state }: { state: ReturnType<typeof useNutritionStore> }) {
  const [selectedDay, setSelectedDay] = useState(nowDate().getDay());
  const [momentsOpen, setMomentsOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const meals = mealsForWeekday(state.meals, selectedDay);
  const dayName = week.find((item) => item.day === selectedDay)?.label ?? "Dia";
  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Plano da semana
          </h3>
          <button
            onClick={() => setGoalsOpen(true)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" /> Metas
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {week.map(({ day, label }) => {
            const count = mealsForWeekday(state.meals, day).length;
            const active = day === selectedDay;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`relative rounded-xl border py-2.5 text-center ${active ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
              >
                <span
                  className={`block text-[9px] ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  {label}
                </span>
                <span className="mt-1 block text-xs font-bold">{count || "—"}</span>
                {day === nowDate().getDay() && (
                  <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{dayName}</h3>
            <p className="text-xs text-muted-foreground">
              {meals.length} {meals.length === 1 ? "momento configurado" : "momentos configurados"}
            </p>
          </div>
          <button
            onClick={() => setMomentsOpen(true)}
            className="text-xs font-semibold text-primary"
          >
            {meals.length ? "Editar momentos" : "Selecionar momentos"}
          </button>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
          {meals.length === 0 ? (
            <button
              onClick={() => setMomentsOpen(true)}
              className="flex w-full flex-col items-center gap-2 p-8 text-sm text-muted-foreground"
            >
              <Utensils className="h-6 w-6" />
              Como será sua alimentação neste dia?
              <span className="text-primary">+ Selecionar momentos</span>
            </button>
          ) : (
            meals.map((meal) => {
              const assignment = assignmentFor(state.assignments, meal.id, selectedDay);
              const option = state.options.find((item) => item.id === assignment?.optionId);
              return (
                <button
                  key={meal.id}
                  onClick={() => setEditingMeal(meal)}
                  className="flex w-full items-center gap-3 border-b border-border p-4 text-left last:border-b-0"
                >
                  <span className="w-11 font-mono text-xs text-muted-foreground">
                    {assignment?.time ?? meal.time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{meal.name}</span>
                    <span
                      className={`block truncate text-[11px] ${option ? "text-muted-foreground" : "text-primary"}`}
                    >
                      {option?.description ?? "Escolher uma opção"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })
          )}
        </div>
      </section>
      {momentsOpen && (
        <MomentPicker state={state} weekday={selectedDay} onClose={() => setMomentsOpen(false)} />
      )}
      {editingMeal && (
        <OptionPicker
          meal={editingMeal}
          weekday={selectedDay}
          options={optionsForMeal(state.options, editingMeal.id)}
          assignment={assignmentFor(state.assignments, editingMeal.id, selectedDay)}
          onClose={() => setEditingMeal(null)}
        />
      )}
      {goalsOpen && <GoalsEditor goals={state.goals} onClose={() => setGoalsOpen(false)} />}
    </div>
  );
}

function MomentPicker({
  state,
  weekday,
  onClose,
}: {
  state: ReturnType<typeof useNutritionStore>;
  weekday: number;
  onClose: () => void;
}) {
  const initial = mealsForWeekday(state.meals, weekday).map((meal) => meal.id);
  const [selected, setSelected] = useState(initial);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const ids = [...selected];
    for (const [name, time] of commonMoments) {
      if (state.meals.some((meal) => meal.name.toLowerCase() === name.toLowerCase())) continue;
      if (!selected.includes(`new:${name}`)) continue;
      ids.push(await addMeal({ name, time, weekdays: [weekday] }));
    }
    for (const meal of state.meals) {
      const nextDays = selected.includes(meal.id)
        ? [...new Set([...meal.weekdays, weekday])]
        : meal.weekdays.filter((day) => day !== weekday);
      await updateMeal(meal.id, { weekdays: nextDays });
    }
    setSaving(false);
    onClose();
  };
  const choices = commonMoments.map(
    ([name, time]) =>
      state.meals.find((meal) => meal.name.toLowerCase() === name.toLowerCase()) ?? {
        id: `new:${name}`,
        name,
        time,
      },
  );
  return (
    <Modal onClose={onClose} title="Momentos do dia">
      <div className="space-y-2">
        {choices.map((meal) => {
          const active = selected.includes(meal.id);
          return (
            <button
              key={meal.id}
              onClick={() =>
                setSelected(
                  active ? selected.filter((id) => id !== meal.id) : [...selected, meal.id],
                )
              }
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${active ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2"}`}
            >
              <span
                className={`grid h-5 w-5 place-items-center rounded-md border ${active ? "border-primary bg-primary" : "border-muted-foreground"}`}
              >
                {active && <Check className="h-3 w-3 text-primary-foreground" />}
              </span>
              <span className="flex-1 text-sm font-semibold">{meal.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{meal.time}</span>
            </button>
          );
        })}
        <button
          disabled={saving}
          onClick={() => void save()}
          className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          {saving ? "Salvando…" : "Adicionar ao dia"}
        </button>
      </div>
    </Modal>
  );
}

function OptionPicker({
  meal,
  weekday,
  options,
  assignment,
  onClose,
}: {
  meal: Meal;
  weekday: number;
  options: MealOption[];
  assignment?: { optionId?: string; time: string };
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(assignment?.optionId ?? "");
  const [time, setTime] = useState(assignment?.time ?? meal.time);
  const [repeatDays, setRepeatDays] = useState<number[]>([weekday]);
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<
    { name: string; serving: string; grams: string }[]
  >([]);
  const [macros, setMacros] = useState({ protein: "", carbs: "", fat: "", calories: "" });
  const save = async () => {
    if (!selected) return;
    await updateMeal(meal.id, { weekdays: [...new Set([...meal.weekdays, ...repeatDays])] });
    for (const day of repeatDays) {
      await setMealPlanAssignment({ mealId: meal.id, weekday: day, optionId: selected, time });
    }
    onClose();
  };
  const create = async () => {
    if (!description.trim()) return;
    const id = await addMealOption(meal.id, {
      description,
      protein: macros.protein ? Number(macros.protein) : undefined,
      carbs: macros.carbs ? Number(macros.carbs) : undefined,
      fat: macros.fat ? Number(macros.fat) : undefined,
      calories: macros.calories ? Number(macros.calories) : undefined,
      ingredients: ingredients
        .filter((item) => item.name.trim())
        .map((item) => ({
          name: item.name.trim(),
          serving: item.serving || undefined,
          grams: item.grams ? Number(item.grams) : undefined,
        })),
    });
    setSelected(id);
    setAdding(false);
  };
  return (
    <Modal onClose={onClose} title={meal.name}>
      <div className="space-y-3">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => setSelected(option.id)}
            className={`w-full rounded-xl border p-3 text-left ${selected === option.id ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2"}`}
          >
            <p className="text-sm font-semibold">{option.description}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {option.calories ? `${option.calories} kcal` : "Macros opcionais"}
            </p>
          </button>
        ))}
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-xs font-semibold text-primary"
          >
            <Plus className="h-4 w-4" /> Cadastrar nova opção
          </button>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-3">
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nome ou descrição"
              className="w-full rounded-lg border border-border bg-surface-2 p-2.5 text-sm"
            />
            <p className="mt-3 text-[10px] uppercase text-muted-foreground">Itens opcionais</p>
            {ingredients.map((item, index) => (
              <div key={index} className="mt-2 grid grid-cols-[1fr_1fr_4rem] gap-1.5">
                <input
                  value={item.name}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((row, i) =>
                        i === index ? { ...row, name: e.target.value } : row,
                      ),
                    )
                  }
                  placeholder="Item"
                  className="rounded-md border border-border bg-surface-2 p-2 text-xs"
                />
                <input
                  value={item.serving}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((row, i) =>
                        i === index ? { ...row, serving: e.target.value } : row,
                      ),
                    )
                  }
                  placeholder="2 unidades"
                  className="rounded-md border border-border bg-surface-2 p-2 text-xs"
                />
                <input
                  type="number"
                  value={item.grams}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((row, i) =>
                        i === index ? { ...row, grams: e.target.value } : row,
                      ),
                    )
                  }
                  placeholder="g"
                  className="rounded-md border border-border bg-surface-2 p-2 text-xs"
                />
              </div>
            ))}
            <button
              onClick={() => setIngredients([...ingredients, { name: "", serving: "", grams: "" }])}
              className="mt-2 text-[11px] text-primary"
            >
              + Adicionar item
            </button>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {Object.keys(macros).map((key) => (
                <input
                  key={key}
                  type="number"
                  value={macros[key as keyof typeof macros]}
                  onChange={(e) => setMacros({ ...macros, [key]: e.target.value })}
                  placeholder={
                    key === "protein"
                      ? "Prot."
                      : key === "carbs"
                        ? "Carb."
                        : key === "fat"
                          ? "Gord."
                          : "Kcal"
                  }
                  className="w-full rounded-md border border-border bg-surface-2 p-2 text-[10px]"
                />
              ))}
            </div>
            <button
              onClick={() => void create()}
              className="mt-3 w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
            >
              Salvar e selecionar
            </button>
          </div>
        )}
        <label className="block text-[10px] uppercase text-muted-foreground">
          Horário
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-foreground"
          />
        </label>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] uppercase text-muted-foreground">
              Repetir em outros dias
            </span>
            <button
              onClick={() =>
                setRepeatDays(repeatDays.length === 7 ? [weekday] : [0, 1, 2, 3, 4, 5, 6])
              }
              className="text-[10px] font-semibold text-primary"
            >
              {repeatDays.length === 7 ? "Limpar" : "Selecionar todos"}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {week.map(({ day, label }) => {
              const active = repeatDays.includes(day);
              return (
                <button
                  key={day}
                  onClick={() =>
                    day !== weekday &&
                    setRepeatDays(
                      active ? repeatDays.filter((item) => item !== day) : [...repeatDays, day],
                    )
                  }
                  className={`h-8 rounded-lg text-[9px] font-bold ${active ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
                >
                  {label.slice(0, 1)}
                </button>
              );
            })}
          </div>
        </div>
        <button
          disabled={!selected}
          onClick={() => void save()}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Aplicar neste dia
        </button>
      </div>
    </Modal>
  );
}

function GoalsEditor({
  goals,
  onClose,
}: {
  goals: { protein: number; carbs: number; fat: number; calories: number };
  onClose: () => void;
}) {
  const [values, setValues] = useState(
    Object.fromEntries(Object.entries(goals).map(([k, v]) => [k, String(v)])) as Record<
      keyof typeof goals,
      string
    >,
  );
  const save = async () => {
    await setDailyGoals({
      protein: Number(values.protein) || 0,
      carbs: Number(values.carbs) || 0,
      fat: Number(values.fat) || 0,
      calories: Number(values.calories) || 0,
    });
    onClose();
  };
  return (
    <Modal onClose={onClose} title="Metas nutricionais">
      <div className="grid grid-cols-2 gap-2">
        {Object.keys(values).map((key) => (
          <label key={key} className="text-[10px] uppercase text-muted-foreground">
            {key}
            <input
              type="number"
              value={values[key as keyof typeof values]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-foreground"
            />
          </label>
        ))}
      </div>
      <button
        onClick={() => void save()}
        className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
      >
        Salvar metas
      </button>
    </Modal>
  );
}
