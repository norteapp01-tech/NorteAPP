import type { FinancialGoal } from "@/lib/finance-store";
import type { Goal } from "@/lib/goals-store";

export type FinancialPlanRow = { plan: Goal; objective?: FinancialGoal };

export function financialPlanRows(plans: Goal[], objectives: FinancialGoal[]): FinancialPlanRow[] {
  const financialPlans = plans.filter(
    (plan) => plan.category === "financas" || plan.lifeArea === "Finanças",
  );
  const byPlanId = new Map(
    objectives.filter((goal) => goal.planId).map((goal) => [goal.planId!, goal]),
  );
  return financialPlans.map((plan) => ({ plan, objective: byPlanId.get(plan.id) }));
}
