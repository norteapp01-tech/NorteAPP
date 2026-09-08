import { describe, expect, it } from "vitest";
import { financialPlanRows } from "./financial-planning";
import type { FinancialGoal } from "@/lib/finance-store";
import type { Goal } from "@/lib/goals-store";

function plan(id: string, category = "financas"): Goal {
  return {
    id,
    title: `Plano ${id}`,
    why: "",
    trackingType: "etapas",
    kind: "projeto",
    category,
    lifeArea: category === "financas" ? "Finanças" : "Carreira",
    deadlineLabel: "90 dias",
    createdAt: "2026-09-07T00:00:00Z",
    metric: { target: 1, unit: "etapas" },
  };
}

function objective(id: string, planId?: string): FinancialGoal {
  return {
    id,
    name: `Objetivo ${id}`,
    targetAmount: 1000,
    savedAmount: 100,
    planId,
    createdAt: "2026-09-07T00:00:00Z",
  };
}

describe("financialPlanRows", () => {
  it("exibe somente planos financeiros e conecta o objetivo sem duplicar o plano", () => {
    const rows = financialPlanRows(
      [plan("financeiro"), plan("carreira", "trabalho")],
      [objective("sonho", "financeiro")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].plan.id).toBe("financeiro");
    expect(rows[0].objective?.id).toBe("sonho");
  });

  it("também mostra plano financeiro criado diretamente na aba Plano", () => {
    const rows = financialPlanRows([plan("avulso")], []);
    expect(rows.map((row) => row.plan.id)).toEqual(["avulso"]);
    expect(rows[0].objective).toBeUndefined();
  });
});
