import { useState } from "react";
import { Plus, Trash2, ChevronRight, ChevronLeft } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  useNutritionStore,
  mealsSorted,
  optionsForMeal,
  setDailyGoals,
  addMeal,
  updateMeal,
  removeMeal,
  addMealOption,
  updateMealOption,
  removeMealOption,
  type Meal,
  type DailyGoals,
  type MealOption,
} from "@/lib/nutrition-store";

type View = { screen: "root" } | { screen: "meal"; mealId: string };

export function EditDietSheet({ onClose }: { onClose: () => void }) {
  const state = useNutritionStore((s) => s);
  const [view, setView] = useState<View>({ screen: "root" });
  const meals = mealsSorted(state.meals);
  const activeMeal = view.screen === "meal" ? state.meals.find((m) => m.id === view.mealId) : null;

  const title =
    view.screen === "meal" ? (
      <span className="flex items-center gap-2">
        <button
          onClick={() => setView({ screen: "root" })}
          aria-label="Voltar"
          className="-ml-1 rounded-full p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {activeMeal?.name}
      </span>
    ) : (
      "Editar dieta"
    );

  return (
    <Modal onClose={onClose} title={title}>
      {view.screen === "root" && (
        <DietRoot
          meals={meals}
          goals={state.goals}
          onOpenMeal={(mealId) => setView({ screen: "meal", mealId })}
        />
      )}
      {view.screen === "meal" && activeMeal && (
        <MealOptionsEditor
          meal={activeMeal}
          options={optionsForMeal(state.options, activeMeal.id)}
        />
      )}
    </Modal>
  );
}

function DietRoot({
  meals,
  goals,
  onOpenMeal,
}: {
  meals: Meal[];
  goals: DailyGoals;
  onOpenMeal: (mealId: string) => void;
}) {
  const [editingGoals, setEditingGoals] = useState(false);
  const [protein, setProtein] = useState(String(goals.protein));
  const [carbs, setCarbs] = useState(String(goals.carbs));
  const [fat, setFat] = useState(String(goals.fat));
  const [calories, setCalories] = useState(String(goals.calories));
  const [addingMeal, setAddingMeal] = useState(false);
  const [newTime, setNewTime] = useState("12:00");
  const [newName, setNewName] = useState("");

  const saveGoals = async () => {
    await setDailyGoals({
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
      calories: parseFloat(calories) || 0,
    });
    setEditingGoals(false);
  };

  const saveNewMeal = async () => {
    if (!newName.trim()) return;
    await addMeal({ time: newTime, name: newName.trim() });
    setNewName("");
    setAddingMeal(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Metas diárias
          </h4>
          {!editingGoals && (
            <button onClick={() => setEditingGoals(true)} className="text-xs text-primary">
              editar
            </button>
          )}
        </div>

        {!editingGoals ? (
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <p>
              Proteína <span className="text-muted-foreground">{goals.protein}g</span>
            </p>
            <p>
              Carboidratos <span className="text-muted-foreground">{goals.carbs}g</span>
            </p>
            <p>
              Gorduras <span className="text-muted-foreground">{goals.fat}g</span>
            </p>
            <p>
              Calorias <span className="text-muted-foreground">{goals.calories}kcal</span>
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <GoalField label="Proteína (g)" value={protein} onChange={setProtein} />
              <GoalField label="Carboidratos (g)" value={carbs} onChange={setCarbs} />
              <GoalField label="Gorduras (g)" value={fat} onChange={setFat} />
              <GoalField label="Calorias (kcal)" value={calories} onChange={setCalories} />
            </div>
            <button
              onClick={saveGoals}
              className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
            >
              Salvar metas
            </button>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Refeições
        </h4>
        <ul className="mt-2 space-y-1.5">
          {meals.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-lg bg-surface-2 p-2.5">
              <button
                onClick={() => onOpenMeal(m.id)}
                className="flex flex-1 items-center gap-2 text-left"
              >
                <span className="font-mono text-xs font-bold text-muted-foreground">{m.time}</span>
                <span className="text-sm font-semibold">{m.name}</span>
              </button>
              <button onClick={() => onOpenMeal(m.id)}>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button
                onClick={async () => {
                  await removeMeal(m.id);
                }}
                className="text-muted-foreground hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>

        {!addingMeal ? (
          <button
            onClick={() => setAddingMeal(true)}
            className="mt-2 flex items-center gap-1.5 text-xs text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> adicionar refeição
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border p-2.5">
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-24 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome da refeição"
              className="flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
            <button onClick={saveNewMeal} className="text-primary">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GoalField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
      />
    </label>
  );
}

function MealOptionsEditor({ meal, options }: { meal: Meal; options: MealOption[] }) {
  const [time, setTime] = useState(meal.time);
  const [name, setName] = useState(meal.name);
  const [addingOption, setAddingOption] = useState(false);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  const saveMealFields = async () => {
    await updateMeal(meal.id, { time, name });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">Horário</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            onBlur={saveMealFields}
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveMealFields}
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      <div>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Opções
        </h4>
        <ul className="mt-2 space-y-1.5">
          {options.map((o) =>
            editingOptionId === o.id ? (
              <OptionForm
                key={o.id}
                initial={o}
                onSave={async (patch) => {
                  await updateMealOption(o.id, patch);
                  setEditingOptionId(null);
                }}
                onCancel={() => setEditingOptionId(null)}
              />
            ) : (
              <li key={o.id} className="rounded-lg bg-surface-2 p-2.5">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm font-semibold">{o.description}</p>
                  <button onClick={() => setEditingOptionId(o.id)} className="text-xs text-primary">
                    editar
                  </button>
                  <button
                    onClick={async () => {
                      await removeMealOption(o.id);
                    }}
                    className="text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {(o.protein || o.carbs || o.fat || o.calories) && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {o.protein ?? 0}g P · {o.carbs ?? 0}g C · {o.fat ?? 0}g G · {o.calories ?? 0}{" "}
                    kcal
                  </p>
                )}
              </li>
            ),
          )}
        </ul>

        {!addingOption ? (
          <button
            onClick={() => setAddingOption(true)}
            className="mt-2 flex items-center gap-1.5 text-xs text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> adicionar opção
          </button>
        ) : (
          <div className="mt-2">
            <OptionForm
              onSave={async (patch) => {
                if (!patch.description) return;
                await addMealOption(meal.id, patch);
                setAddingOption(false);
              }}
              onCancel={() => setAddingOption(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function OptionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: MealOption;
  onSave: (patch: {
    description: string;
    protein?: number;
    carbs?: number;
    fat?: number;
    calories?: number;
  }) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [protein, setProtein] = useState(
    initial?.protein !== undefined ? String(initial.protein) : "",
  );
  const [carbs, setCarbs] = useState(initial?.carbs !== undefined ? String(initial.carbs) : "");
  const [fat, setFat] = useState(initial?.fat !== undefined ? String(initial.fat) : "");
  const [calories, setCalories] = useState(
    initial?.calories !== undefined ? String(initial.calories) : "",
  );

  return (
    <li className="rounded-lg border border-dashed border-border p-3">
      <input
        autoFocus
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="ex: 2 ovos + banana + café"
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <NumField label="prot g" value={protein} onChange={setProtein} />
        <NumField label="carb g" value={carbs} onChange={setCarbs} />
        <NumField label="gord g" value={fat} onChange={setFat} />
        <NumField label="kcal" value={calories} onChange={setCalories} />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() =>
            onSave({
              description,
              protein: protein ? parseFloat(protein) : undefined,
              carbs: carbs ? parseFloat(carbs) : undefined,
              fat: fat ? parseFloat(fat) : undefined,
              calories: calories ? parseFloat(calories) : undefined,
            })
          }
          disabled={!description.trim()}
          className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          Salvar
        </button>
        <button onClick={onCancel} className="text-xs text-muted-foreground">
          cancelar
        </button>
      </div>
    </li>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[8px] uppercase text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-surface-2 px-1.5 py-1 text-xs outline-none focus:border-primary"
      />
    </label>
  );
}
