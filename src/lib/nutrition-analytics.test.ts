import { describe, it, expect } from "vitest";
import { nutritionAnalysis, averageNutrient } from "./nutrition-analytics";
import type { NutritionState } from "./nutrition-store";
const state: NutritionState = {
  goals: { protein: 100, carbs: 100, fat: 50, calories: 1000 },
  meals: [{ id: "a", name: "Jantar", time: "20:00", order: 0, weekdays: [1] }],
  options: [],
  assignments: [],
  logs: [
    {
      id: "1",
      mealId: "a",
      date: "2026-09-14",
      source: "custom",
      description: "Jantar",
      protein: 100,
      carbs: 100,
      fat: 50,
      calories: 1000,
      confirmedAt: "2026-09-14T23:00:00Z",
    },
  ],
};
describe("nutrition analysis", () => {
  it("keeps missing observations null and excludes them from averages", () => {
    const result = nutritionAnalysis(state, 7, new Date(2026, 8, 19));
    expect(result.points).toHaveLength(7);
    expect(result.points.filter((p) => p.totals)).toHaveLength(1);
    expect(averageNutrient(result.points, "protein")).toBe(100);
    expect(result.current.pct).toBe(100);
  });
  it("normalizes meals by scheduled weekdays", () => {
    const result = nutritionAnalysis(state, 30, new Date(2026, 8, 19));
    expect(result.meals[0]).toMatchObject({ planned: 1, completed: 1, pct: 100 });
  });
  it("does not invent consistency with no records or goals", () => {
    expect(
      nutritionAnalysis({ ...state, logs: [] }, 7, new Date(2026, 8, 19)).current.pct,
    ).toBeNull();
    expect(
      nutritionAnalysis(
        { ...state, goals: { protein: 0, carbs: 0, fat: 0, calories: 0 } },
        7,
        new Date(2026, 8, 19),
      ).current.pct,
    ).toBeNull();
  });
  it("excludes the ongoing day from consistency", () => {
    expect(nutritionAnalysis(state, 7, new Date(2026, 8, 14)).current.recorded).toBe(0);
  });
});
