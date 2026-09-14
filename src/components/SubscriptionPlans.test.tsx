import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SubscriptionPlans } from "./SubscriptionPlans";

afterEach(cleanup);

it("permite escolher plano e cobrança anual", () => {
  render(<SubscriptionPlans />);

  expect(screen.getByRole("heading", { name: "Escolha seu plano." })).toBeInTheDocument();
  expect(screen.getByText("Essencial").closest("button")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("15 interações com o Agente por mês")).toBeInTheDocument();

  fireEvent.click(screen.getByText("Ilimitado").closest("button")!);
  expect(screen.getByText("Agente sem limite mensal (uso justo)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Assinar Ilimitado" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Anual" }));
  expect(screen.getByText("R$ 299 por ano")).toBeInTheDocument();
});

it("abre a comparação completa dos benefícios", () => {
  render(<SubscriptionPlans />);
  fireEvent.click(screen.getByRole("button", { name: /Comparar todos/ }));
  expect(screen.getByRole("heading", { name: "Compare os planos" })).toBeInTheDocument();
  expect(screen.getByText("Exportação e suporte prioritário")).toBeInTheDocument();
});
