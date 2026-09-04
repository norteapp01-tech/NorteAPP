import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import type { Goal, Step, Execution } from "@/lib/goals-store";

// Mock leve do Supabase client — goals-store.ts é importado de verdade neste teste
// (queremos os seletores reais), mas o módulo do client lança se as env vars do
// Supabase não estiverem definidas, então cortamos a IO real aqui.
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

const TEST_GOAL_ID = "goal-1";

vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => ({
      ...config,
      useParams: () => ({ id: TEST_GOAL_ID }),
      useSearch: () => ({}),
    }),
    useNavigate: () => vi.fn(),
    notFound: () => new Error("not-found"),
    Link: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <a {...props}>{children}</a>
    ),
  };
});

// Import depois dos mocks — objetivo.$id.tsx roda `createFileRoute(...)(...)` no
// nível de módulo, então precisa ver a versão mockada.
const { GoalDetail } = await import("../routes/objetivo.$id");
const { QUERY_KEY } = await import("@/lib/goals-store");

function fixtureGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: TEST_GOAL_ID,
    title: "Lançar um SaaS",
    why: "",
    trackingType: "etapas",
    kind: "projeto",
    category: "carreira",
    lifeArea: "Carreira",
    deadlineLabel: "Mês",
    deadlineISO: "2026-09-30",
    createdAt: "2026-09-01T00:00:00.000Z",
    metric: { target: 1, unit: "etapas" },
    ...overrides,
  };
}

function fixtureStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "step-1",
    goalId: TEST_GOAL_ID,
    title: "Terminar front-end",
    done: false,
    targetDate: "2026-09-10",
    order: 0,
    ...overrides,
  };
}

function fixtureExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    id: "exec-1",
    title: "Decidir layout",
    dueDate: "2026-09-08",
    category: "carreira",
    rigid: false,
    weight: "medio",
    status: "planejada",
    goalId: TEST_GOAL_ID,
    stepId: "step-1",
    history: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } });
  queryClient.setQueryData(QUERY_KEY, {
    goals: [fixtureGoal()],
    steps: [fixtureStep()],
    executions: [fixtureExecution()],
    routines: [],
  });
});

function renderGoalDetail() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GoalDetail />
    </QueryClientProvider>,
  );
}

describe("GoalDetail — Visão e Etapas unificadas", () => {
  it("não existe mais uma aba separada 'Etapas'", () => {
    renderGoalDetail();
    expect(screen.queryByRole("button", { name: /^Etapas/ })).not.toBeInTheDocument();
  });

  it("as etapas (lista + form de nova etapa) aparecem dentro de Visão, sem precisar trocar de aba", () => {
    renderGoalDetail();
    // A aba "vista" é a default — não clico em nada. O título aparece 2x (card
    // "Próxima etapa" + a linha da etapa em si), então uso getAllByText.
    expect(screen.getAllByText("Terminar front-end").length).toBeGreaterThan(0);
    expect(screen.getByText(/Realizar até: 10\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Realizar esta etapa até:")).toBeInTheDocument();
  });

  it("não existe mais o botão 'Registrar avanço'", () => {
    renderGoalDetail();
    expect(screen.queryByText("Registrar avanço")).not.toBeInTheDocument();
  });

  it("a barra de abas tem exatamente Visão, Execuções e Evolução", () => {
    renderGoalDetail();
    expect(screen.getByRole("button", { name: "Visão" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Execuções/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evolução" })).toBeInTheDocument();
  });
});
