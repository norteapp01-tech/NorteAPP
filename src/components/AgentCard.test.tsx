import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AgentCard, parseCard } from "./AgentCard";
import { correctTransaction } from "@/lib/finance-store";
vi.mock("@/lib/finance-store", () => ({
  correctTransaction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/agent/tools", () => ({ executeTool: vi.fn() }));
afterEach(cleanup);
it("mostra valor e rosca real; alterna categoria sem registrar de novo", () => {
  render(
    <AgentCard
      data={{
        card: "finance",
        id: "test",
        amount: 23,
        description: "barra",
        category: "Alimentação",
        breakdown: [
          { category: "Alimentação", amount: 23 },
          { category: "Transporte", amount: 77 },
        ],
      }}
      onPrompt={vi.fn()}
    />,
  );
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Alimentação: 23% dos gastos do mês",
  );
  fireEvent.click(screen.getByRole("button", { name: /Transporte/ }));
  expect(screen.getByRole("img")).toHaveAttribute(
    "aria-label",
    "Transporte: 77% dos gastos do mês",
  );
});
it("ajuste financeiro edita o ID do card, não a última transação", async () => {
  render(
    <AgentCard
      data={{ card: "finance", id: "specific-id", amount: 23, description: "barra" }}
      onPrompt={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("Ajustar registro"));
  fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "24,50" } });
  fireEvent.click(screen.getByText("Salvar ajuste"));
  await waitFor(() =>
    expect(correctTransaction).toHaveBeenCalledWith("specific-id", {
      amount: 24.5,
      description: "barra",
    }),
  );
});
it("proposta mostra etapas e não afirma que foi salva", () => {
  render(
    <AgentCard
      data={{
        card: "plan",
        title: "Loja",
        steps: [{ title: "Orçamento" }, { title: "Inauguração" }],
      }}
      proposed
      onPrompt={vi.fn()}
    />,
  );
  expect(screen.getByText("Orçamento")).toBeInTheDocument();
  expect(screen.getByText(/ainda não salvas/)).toBeInTheDocument();
  expect(parseCard("Erro ao executar")).toBeNull();
});
