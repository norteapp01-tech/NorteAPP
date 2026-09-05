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
    isCurrent: false,
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

function seed(overrides: { goals?: Goal[]; steps?: Step[]; executions?: Execution[] }) {
  queryClient.setQueryData(QUERY_KEY, {
    goals: overrides.goals ?? [fixtureGoal()],
    steps: overrides.steps ?? [fixtureStep()],
    executions: overrides.executions ?? [fixtureExecution()],
    routines: [],
  });
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } });
  seed({});
});

function renderGoalDetail() {
  return render(
    <QueryClientProvider client={queryClient}>
      <GoalDetail />
    </QueryClientProvider>,
  );
}

describe("GoalDetail — abas: só Planejamento e Evolução", () => {
  it("a barra de abas tem exatamente Planejamento e Evolução, sem Execuções separada", () => {
    renderGoalDetail();
    expect(screen.getByRole("button", { name: "Planejamento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Evolução" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Execuções/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Visão" })).not.toBeInTheDocument();
  });

  it("não existe mais o card 'Números' na aba principal — os números moraram pra Evolução", () => {
    renderGoalDetail();
    expect(screen.queryByText("Números")).not.toBeInTheDocument();
  });

  it("não existe mais o botão 'Registrar avanço'", () => {
    renderGoalDetail();
    expect(screen.queryByText("Registrar avanço")).not.toBeInTheDocument();
  });

  it("as etapas (lista + form de nova etapa) aparecem dentro de Planejamento, sem precisar trocar de aba", () => {
    renderGoalDetail();
    expect(screen.getAllByText("Terminar front-end").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Ex: Terminar capítulo 3")).toBeInTheDocument();
  });

  it("a execução aparece aninhada dentro do card da etapa, não numa lista separada", () => {
    renderGoalDetail();
    expect(screen.getByText("Decidir layout")).toBeInTheDocument();
  });
});

describe("GoalDetail — plano sem etapas (cenário 1 da checklist)", () => {
  it("mostra o alerta de plano parado e o fallback vazio, sem quebrar", () => {
    seed({ steps: [], executions: [] });
    renderGoalDetail();
    expect(screen.getByText(/sem uma próxima ação/i)).toBeInTheDocument();
    expect(screen.getByText(/adicione uma abaixo/i)).toBeInTheDocument();
  });
});

describe("GoalDetail — subtarefas legadas: exibidas, nunca criáveis pela UI", () => {
  it("não existe nenhum jeito de criar uma subtarefa nova, mesmo com dado legado presente", () => {
    seed({
      steps: [
        fixtureStep({
          subtasks: [{ id: "sub-1", title: "Rascunho antigo", done: false }],
        }),
      ],
    });
    renderGoalDetail();
    // dado legado continua visível...
    expect(screen.getByText("Rascunho antigo")).toBeInTheDocument();
    // ...mas não há campo/botão de criar subtarefa nova em lugar nenhum da tela
    expect(screen.queryByPlaceholderText(/subtarefa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nova subtarefa/i)).not.toBeInTheDocument();
  });
});

describe("GoalDetail — etapa atual", () => {
  it("etapa marcada como isCurrent aparece destacada como 'etapa atual'", () => {
    seed({ steps: [fixtureStep({ isCurrent: true })] });
    renderGoalDetail();
    expect(screen.getByText(/etapa atual/i)).toBeInTheDocument();
  });
});

describe("GoalDetail — execução sem etapa (órfã)", () => {
  it("aparece numa seção própria 'Execuções sem etapa', não se perde", () => {
    seed({
      steps: [fixtureStep()],
      executions: [
        fixtureExecution({ id: "exec-orfa", title: "Sem etapa nenhuma", stepId: undefined }),
      ],
    });
    renderGoalDetail();
    expect(screen.getByText("Execuções sem etapa")).toBeInTheDocument();
    expect(screen.getByText("Sem etapa nenhuma")).toBeInTheDocument();
  });
});

describe("GoalDetail — 'Colocar etapa na agenda' (item 3)", () => {
  it("aparece só quando a etapa não tem nenhuma execução", () => {
    seed({ steps: [fixtureStep()], executions: [] });
    renderGoalDetail();
    expect(screen.getByText("Colocar etapa na agenda")).toBeInTheDocument();
  });

  it("some assim que a etapa já tem uma execução própria", () => {
    seed({ steps: [fixtureStep()], executions: [fixtureExecution()] });
    renderGoalDetail();
    expect(screen.queryByText("Colocar etapa na agenda")).not.toBeInTheDocument();
  });

  it("não aparece pra etapa já concluída", () => {
    seed({ steps: [fixtureStep({ done: true })], executions: [] });
    renderGoalDetail();
    expect(screen.queryByText("Colocar etapa na agenda")).not.toBeInTheDocument();
  });
});

describe("GoalDetail — alerta de plano parado desaparece com qualquer etapa aberta (item 2)", () => {
  it("etapa recém-criada (aberta, não marcada como atual, sem execução) já basta pra tirar o alerta", () => {
    seed({ steps: [fixtureStep({ isCurrent: false, done: false })], executions: [] });
    renderGoalDetail();
    expect(screen.queryByText(/sem uma próxima ação/i)).not.toBeInTheDocument();
  });

  it("plano sem nenhuma etapa continua mostrando o alerta", () => {
    seed({ steps: [], executions: [] });
    renderGoalDetail();
    expect(screen.getByText(/sem uma próxima ação/i)).toBeInTheDocument();
  });
});
