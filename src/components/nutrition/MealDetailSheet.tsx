import { useState } from "react";
import { X, Check } from "lucide-react";
import {
  useNutritionStore,
  optionsForMeal,
  logForMealOnDate,
  confirmMealOption,
  confirmMealCustom,
  type Meal,
} from "@/lib/nutrition-store";
import { todayISO } from "@/lib/goals-store";

export function MealDetailSheet({ meal, onClose }: { meal: Meal; onClose: () => void }) {
  const state = useNutritionStore((s) => s);
  const options = optionsForMeal(state.options, meal.id);
  const date = todayISO();
  const currentLog = logForMealOnDate(state.logs, meal.id, date);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    currentLog?.optionId ?? null,
  );
  const [customMode, setCustomMode] = useState(currentLog?.source === "custom");
  const [customText, setCustomText] = useState(
    currentLog?.source === "custom" ? currentLog.description : "",
  );
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [calories, setCalories] = useState("");

  const confirm = () => {
    if (customMode) {
      if (!customText.trim()) return;
      confirmMealCustom(
        meal.id,
        customText,
        {
          protein: protein ? parseFloat(protein) : undefined,
          carbs: carbs ? parseFloat(carbs) : undefined,
          fat: fat ? parseFloat(fat) : undefined,
          calories: calories ? parseFloat(calories) : undefined,
        },
        date,
      );
    } else {
      if (!selectedOptionId) return;
      confirmMealOption(meal.id, selectedOptionId, date);
    }
    onClose();
  };

  const canConfirm = customMode ? customText.trim().length > 0 : !!selectedOptionId;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface flex w-full max-w-md flex-col rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
        style={{ maxHeight: "85vh" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">
            {meal.name} · {meal.time}
          </h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
          {options.map((o) => {
            const active = !customMode && selectedOptionId === o.id;
            return (
              <button
                key={o.id}
                onClick={() => {
                  setCustomMode(false);
                  setSelectedOptionId(o.id);
                }}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left ${active ? "border-primary/40 bg-primary/10" : "border-border bg-surface-2"}`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-primary bg-primary" : "border-muted-foreground"}`}
                >
                  {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{o.description}</p>
                  {(o.protein || o.carbs || o.calories) && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {o.protein ?? 0}g proteína · {o.carbs ?? 0}g carbo · {o.calories ?? 0} kcal
                    </p>
                  )}
                </div>
              </button>
            );
          })}

          {!customMode ? (
            <button
              onClick={() => {
                setCustomMode(true);
                setSelectedOptionId(null);
              }}
              className="w-full py-1.5 text-left text-xs text-primary"
            >
              + Registrar diferente
            </button>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="text-xs font-semibold">O que você comeu?</p>
              <textarea
                autoFocus
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="ex: 2 pães de queijo + café"
                className="mt-2 min-h-16 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="mt-2 text-[10px] uppercase text-muted-foreground">
                Valores nutricionais (opcional)
              </p>
              <div className="mt-1 grid grid-cols-4 gap-1.5">
                <NumField label="prot g" value={protein} onChange={setProtein} />
                <NumField label="carb g" value={carbs} onChange={setCarbs} />
                <NumField label="gord g" value={fat} onChange={setFat} />
                <NumField label="kcal" value={calories} onChange={setCalories} />
              </div>
              <button
                onClick={() => setCustomMode(false)}
                className="mt-2 text-[11px] text-muted-foreground"
              >
                voltar pras opções
              </button>
            </div>
          )}
        </div>

        <button
          onClick={confirm}
          disabled={!canConfirm}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Confirmar refeição
        </button>
      </div>
    </div>
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
