import { useState } from "react";
import { Check, RotateCw, Circle } from "lucide-react";
import { todayISO } from "@/lib/goals-store";
import { nowDate } from "@/lib/test-clock";
import {
  useNutritionStore,
  mealsSorted,
  logForMealOnDate,
  mealStatus,
  dailyTotals,
  type Meal,
  type MealStatus,
} from "@/lib/nutrition-store";
import { Card } from "@/components/sub-agenda-shared";
import { MacroSummary } from "./MacroSummary";
import { MealDetailSheet } from "./MealDetailSheet";
import { EditDietSheet } from "./EditDietSheet";

const todayLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(
  nowDate(),
);

const statusMeta: Record<MealStatus, { icon: typeof Check; label: string; className: string }> = {
  as_planned: { icon: Check, label: "Conforme planejado", className: "text-success" },
  adjusted: { icon: RotateCw, label: "Refeição ajustada", className: "text-warning" },
  pending: { icon: Circle, label: "Pendente", className: "text-muted-foreground" },
};

export function AlimentacaoModule() {
  const state = useNutritionStore((s) => s);
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);
  const [editingDiet, setEditingDiet] = useState(false);

  const date = todayISO();
  const meals = mealsSorted(state.meals);
  const totals = dailyTotals(state.logs, date);

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Hoje, {todayLabel}</p>
        <button onClick={() => setEditingDiet(true)} className="text-xs font-semibold text-primary">
          Editar dieta
        </button>
      </div>

      <MacroSummary totals={totals} goals={state.goals} />

      <Card title="Refeições">
        <ul className="space-y-2">
          {meals.map((m) => {
            const status = mealStatus(state.logs, m.id, date);
            const log = logForMealOnDate(state.logs, m.id, date);
            const meta = statusMeta[status];
            const Icon = meta.icon;
            return (
              <li key={m.id}>
                <button
                  onClick={() => setOpenMeal(m)}
                  className="w-full rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.className}`} />
                    <span className="font-mono text-xs font-bold text-muted-foreground">
                      {m.time}
                    </span>
                    <span className="text-sm font-semibold">{m.name}</span>
                    <span className={`ml-auto text-[10px] ${meta.className}`}>{meta.label}</span>
                  </div>
                  {log ? (
                    <>
                      <p className="mt-1.5 text-xs text-muted-foreground">{log.description}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {log.protein}P · {log.carbs}C · {log.calories} kcal
                      </p>
                    </>
                  ) : (
                    <p className="mt-1.5 text-xs text-muted-foreground">Toque para registrar</p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {openMeal && <MealDetailSheet meal={openMeal} onClose={() => setOpenMeal(null)} />}
      {editingDiet && <EditDietSheet onClose={() => setEditingDiet(false)} />}
    </div>
  );
}
