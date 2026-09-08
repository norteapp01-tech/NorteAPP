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
  type NutritionState,
} from "@/lib/nutrition-store";
import { MacroSummary } from "./MacroSummary";
import { MealDetailSheet } from "./MealDetailSheet";
import { Modal } from "@/components/ui/modal";
import { UnderlineTabs, WeekdaySelector } from "@/components/ui/app-design-system";
import { officialWeek } from "@/components/ui/app-design-system-data";

const todayLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(
  nowDate(),
);
const week = officialWeek;
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
      <UnderlineTabs
        items={
          [
            { key: "today", label: "Hoje" },
            { key: "plan", label: "Plano alimentar" },
          ] as const
        }
        value={tab}
        onChange={setTab}
      />
      {tab === "today" ? (
        <TodayTab state={state} totals={totals} onOpenMeal={setOpenMeal} />
      ) : (
        <PlanTab state={state} />
      )}
      {openMeal && <MealDetailSheet meal={openMeal} onClose={() => setOpenMeal(null)} />}
    </div>
  );
}

function TodayTab({
  state,
  totals,
  onOpenMeal,
}: {
  state: NutritionState;
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

function PlanTab({ state }: { state: NutritionState }) {
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
        <div className="mt-3">
          <WeekdaySelector
            selectedDay={selectedDay}
            onSelect={setSelectedDay}
            primary={(day) => mealsForWeekday(state.meals, day).length || "—"}
          />
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
  state: NutritionState;
  weekday: number;
  onClose: () => void;
}) {
  const initial = mealsForWeekday(state.meals, weekday).map((meal) => meal.id);
  const [selected, setSelected] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [addingMoment, setAddingMoment] = useState(false);
  const [momentName, setMomentName] = useState("");
  const [momentTime, setMomentTime] = useState("21:00");
  const save = async () => {
    setSaving(true);
    for (const [name, time] of commonMoments) {
      if (state.meals.some((meal) => meal.name.toLowerCase() === name.toLowerCase())) continue;
      if (!selected.includes(`new:${name}`)) continue;
      await addMeal({ name, time, weekdays: [weekday] });
    }
    // Só grava as refeições cujo conjunto de dias realmente mudou — evita um
    // UPDATE (e um refetch completo) por refeição a cada save, mesmo pras que
    // nem foram tocadas. As mudanças reais rodam em paralelo, já que cada
    // uma mexe numa linha diferente.
    const writes = state.meals.flatMap((meal) => {
      const nextDays = selected.includes(meal.id)
        ? [...new Set([...meal.weekdays, weekday])]
        : meal.weekdays.filter((day) => day !== weekday);
      const changed =
        nextDays.length !== meal.weekdays.length ||
        nextDays.some((day) => !meal.weekdays.includes(day));
      return changed ? [updateMeal(meal.id, { weekdays: nextDays })] : [];
    });
    await Promise.all(writes);
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
                {active && <Check className="check-enter h-3 w-3 text-primary-foreground" />}
              </span>
              <span className="flex-1 text-sm font-semibold">{meal.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{meal.time}</span>
            </button>
          );
        })}
        {addingMoment ? (
          <div className="rounded-xl border border-dashed border-primary/40 p-3">
            <p className="text-xs font-semibold">Novo momento</p>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <input
                autoFocus
                value={momentName}
                onChange={(event) => setMomentName(event.target.value)}
                placeholder="Ex: Ceia, pós-treino…"
                className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs outline-none focus:border-primary"
              />
              <input
                type="time"
                value={momentTime}
                onChange={(event) => setMomentTime(event.target.value)}
                className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs outline-none focus:border-primary"
              />
            </div>
            <button
              disabled={!momentName.trim()}
              onClick={async () => {
                await addMeal({ name: momentName.trim(), time: momentTime, weekdays: [weekday] });
                onClose();
              }}
              className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              Criar e adicionar ao dia
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingMoment(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs font-semibold text-primary"
          >
            <Plus className="h-4 w-4" /> Adicionar momento
          </button>
        )}
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
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<
    { name: string; quantity: string; unit: "g" | "ml" | "un" }[]
  >([]);
  const [macros, setMacros] = useState({ protein: "", carbs: "", fat: "", calories: "" });
  const save = async () => {
    if (!selected) return;
    await setMealPlanAssignment({ mealId: meal.id, weekday, optionId: selected, time });
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
          quantity: item.quantity ? Number(item.quantity) : undefined,
          unit: item.unit,
        })),
    });
    setSelected(id);
    setAdding(false);
  };
  return (
    <Modal onClose={onClose} title={meal.name}>
      <div className="space-y-3">
        {!adding &&
          options.map((option) => (
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
            <p className="mb-2 text-xs font-semibold">Nova opção de {meal.name.toLowerCase()}</p>
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Nome ou descrição"
              className="w-full rounded-lg border border-border bg-surface-2 p-2.5 text-sm"
            />
            <div className="mt-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold">Itens da refeição</p>
                <p className="text-[10px] text-muted-foreground">
                  Informe quantidade e unidade se quiser.
                </p>
              </div>
            </div>
            {ingredients.map((item, index) => (
              <div key={index} className="mt-2 grid grid-cols-[1fr_5rem_4.5rem] gap-1.5">
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
                  type="number"
                  value={item.quantity}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((row, i) =>
                        i === index ? { ...row, quantity: e.target.value } : row,
                      ),
                    )
                  }
                  placeholder="Qtd."
                  className="rounded-md border border-border bg-surface-2 p-2 text-xs"
                />
                <select
                  value={item.unit}
                  onChange={(e) =>
                    setIngredients(
                      ingredients.map((row, i) =>
                        i === index ? { ...row, unit: e.target.value as "g" | "ml" | "un" } : row,
                      ),
                    )
                  }
                  className="rounded-md border border-border bg-surface-2 p-2 text-xs"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="un">unidade</option>
                </select>
              </div>
            ))}
            <button
              onClick={() =>
                setIngredients([...ingredients, { name: "", quantity: "", unit: "g" }])
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/40 py-2.5 text-xs font-semibold text-primary"
            >
              <Plus className="h-4 w-4" /> Adicionar item
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
        {!adding && (
          <>
            <label className="block text-[10px] uppercase text-muted-foreground">
              Horário neste dia
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border bg-surface-2 p-2.5 text-sm text-foreground"
              />
            </label>
            <button
              disabled={!selected}
              onClick={() => void save()}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              Aplicar neste dia
            </button>
          </>
        )}
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
