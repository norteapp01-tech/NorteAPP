import { format, subDays, parseISO } from "date-fns";
import { dailyTotals, type NutritionState, type DailyGoals } from "./nutrition-store";

export const nutritionMetrics = [
  { key: "protein", label: "Proteína", unit: "g" },
  { key: "carbs", label: "Carboidratos", unit: "g" },
  { key: "fat", label: "Gorduras", unit: "g" },
  { key: "calories", label: "Calorias", unit: "kcal" },
] as const;

/** Missing logs are unknown, never a zero-intake observation.
 * Historical comparisons explicitly use the current plan and targets. */
export function nutritionAnalysis(state: NutritionState, days: number, end: Date) {
  const series = (until: Date) =>
    Array.from({ length: days }, (_, i) => {
      const date = format(subDays(until, days - 1 - i), "yyyy-MM-dd");
      const logs = state.logs.filter((log) => log.date === date);
      return { date, totals: logs.length ? dailyTotals(logs, date) : null };
    });
  const keys = nutritionMetrics.map((m) => m.key).filter((k) => state.goals[k] > 0);
  const consistency = (points: ReturnType<typeof series>) => {
    const recorded = points.filter((p) => p.totals && p.date < format(end, "yyyy-MM-dd"));
    const matched = recorded.filter(
      (p) =>
        keys.length > 0 &&
        keys.every(
          (k) => p.totals![k] >= state.goals[k] * 0.9 && p.totals![k] <= state.goals[k] * 1.1,
        ),
    ).length;
    return {
      recorded: recorded.length,
      matched,
      pct: recorded.length && keys.length ? Math.round((matched / recorded.length) * 100) : null,
    };
  };
  const points = series(end);
  const current = consistency(points);
  const previous = consistency(series(subDays(end, days)));
  const firstLog = state.logs.map((l) => l.date).sort()[0];
  const meals = state.meals.map((meal) => {
    const eligible = points.filter(
      (p) =>
        firstLog &&
        p.date >= firstLog &&
        p.date < format(end, "yyyy-MM-dd") &&
        meal.weekdays.includes(parseISO(p.date).getDay()),
    );
    const completed = eligible.filter((p) =>
      state.logs.some((l) => l.date === p.date && l.mealId === meal.id),
    ).length;
    return {
      id: meal.id,
      name: meal.name,
      planned: eligible.length,
      completed,
      pct: eligible.length ? Math.round((completed / eligible.length) * 100) : null,
    };
  });
  return {
    points,
    current,
    delta: current.pct !== null && previous.pct !== null ? current.pct - previous.pct : null,
    meals,
  };
}

export function averageNutrient(points: { totals: DailyGoals | null }[], key: keyof DailyGoals) {
  const known = points.filter((p) => p.totals !== null);
  return known.length
    ? Math.round(known.reduce((sum, p) => sum + p.totals![key], 0) / known.length)
    : null;
}
