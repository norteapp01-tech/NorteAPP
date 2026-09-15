import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SubscriptionSection } from "./SubscriptionSection";
const state = vi.hoisted(() => ({
  data: { subscription: null as unknown, charges: [] as unknown[] },
  isLoading: false,
  isError: false,
  error: new Error("Falha de consulta"),
  refetch: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => state }));
vi.mock("@/lib/supabase/client", () => ({
  useAuthUser: () => ({ id: "a", isAnonymous: false }),
  supabase: {},
}));
vi.mock("@/components/SubscriptionPlans", () => ({ SubscriptionPlans: () => <div>Catálogo</div> }));
afterEach(() => {
  cleanup();
  state.data = { subscription: null, charges: [] };
  state.isError = false;
});
it("não inventa plano ou cobrança para uma conta sem registros", () => {
  render(<SubscriptionSection />);
  expect(screen.getByText("Sem assinatura registrada")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Cobranças" }));
  expect(screen.getByText("Nenhuma cobrança registrada.")).toBeInTheDocument();
});
it("distingue renovação cancelada e usa preço contratado", () => {
  state.data.subscription = {
    plan: "essential",
    status: "active",
    interval: "year",
    amount_minor: 12300,
    currency: "BRL",
    provider: "apple",
    period_end: "2027-01-15T12:00:00Z",
    cancel_at_period_end: true,
  };
  render(<SubscriptionSection />);
  expect(screen.getByText(/Renovação cancelada/)).toBeInTheDocument();
  expect(screen.getByText(/Acesso até/)).toBeInTheDocument();
  expect(screen.queryByText(/Próxima renovação/)).not.toBeInTheDocument();
  expect(screen.getByText(/123,00/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Gerenciar ou cancelar/ })).toHaveAttribute(
    "href",
    "https://apps.apple.com/account/subscriptions",
  );
});
it("erro não se transforma em ausência de assinatura", () => {
  state.isError = true;
  render(<SubscriptionSection />);
  expect(screen.getByRole("alert")).toHaveTextContent("Falha de consulta");
  expect(screen.queryByText("Sem assinatura registrada")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Tentar novamente"));
  expect(state.refetch).toHaveBeenCalled();
});
