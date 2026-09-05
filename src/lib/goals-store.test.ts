import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryClient } from "./query-client";

// ---------------------------------------------------------------------------
// Mock leve do client Supabase — nunca importa o módulo real (que lança se
// VITE_SUPABASE_URL/ANON_KEY não estiverem definidas). Mantém uma tabela
// "goals" em memória de verdade: insert() empurra a linha e select() sempre
// lê o array atual, exatamente como o Postgres se comportaria — é isso que
// permite provar que o refetch pós-invalidate enxerga o dado recém-inserido.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function chain(result: { data: unknown; error: unknown }) {
  const obj = {
    select: () => obj,
    order: () => obj,
    eq: () => obj,
    single: () => obj,
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return obj;
}

// vi.hoisted: os spies precisam existir antes do vi.mock (que é hoisted pro topo
// do arquivo pelo Vitest) e continuar acessíveis nos testes pra assert nas chamadas.
const { insertSpy, updateSpy } = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  updateSpy: vi.fn(),
}));

let goalsTable: Row[] = [];
let goalId = 0;

vi.mock("./supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "goals") {
        // Tabelas fora do escopo dos testes: leitura vazia, insert/update viram spy
        // (pra provar não-duplicação em scheduleExecution) sem manter estado real.
        return {
          select: () => chain({ data: [], error: null }),
          order: () => chain({ data: [], error: null }),
          insert: (payload: Row | Row[]) => {
            insertSpy(table, payload);
            // Insert em lote (ex.: etapas junto com o plano) devolve um array de
            // linhas com id gerado, como o Postgres faria com RETURNING — precisa
            // pra createGoal() conseguir achar o id da etapa de order_index 0.
            const data = Array.isArray(payload)
              ? payload.map((row, i) => ({ id: `spied-${i}`, ...row }))
              : { id: "spied", ...payload };
            return chain({ data, error: null });
          },
          update: (payload: Row) => {
            updateSpy(table, payload);
            return chain({ data: { id: "spied", ...payload }, error: null });
          },
        };
      }
      return {
        select: () => chain({ data: goalsTable, error: null }),
        order: () => chain({ data: goalsTable, error: null }),
        insert: (payload: Row) => {
          goalId += 1;
          const row: Row = { id: `g-${goalId}`, created_at: new Date().toISOString(), ...payload };
          goalsTable.push(row);
          return chain({ data: row, error: null });
        },
      };
    },
  },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

import {
  createGoal,
  scheduleExecution,
  setCurrentStep,
  formatDateBR,
  agendaByDate,
  isMissed,
  isScheduled,
  isPlanStalled,
  isGoalComplete,
  goalCompletionDate,
  scheduleStepAsExecution,
  progressOverTime,
  plannedVsActual,
  toISODate,
  fetchState,
  QUERY_KEY,
} from "./goals-store";
import type { Execution, Goal, Step } from "./goals-store";
import { setTestClockOverride } from "./test-clock";

beforeEach(() => {
  goalsTable = [];
  goalId = 0;
  insertSpy.mockClear();
  updateSpy.mockClear();
  queryClient.clear();
});

describe("formatDateBR", () => {
  it("formata YYYY-MM-DD em DD/MM/YYYY sem passar por Date/UTC", () => {
    expect(formatDateBR("2026-09-04")).toBe("04/09/2026");
    // dia 01 não pode "voltar" pro mês anterior por causa de fuso, como aconteceria
    // com `new Date("2026-01-01")` interpretado como UTC meia-noite em fusos negativos.
    expect(formatDateBR("2026-01-01")).toBe("01/01/2026");
  });
});

function makeExecution(overrides: Partial<Execution>): Execution {
  return {
    id: "e1",
    title: "Execução de teste",
    dueDate: "2026-09-08",
    category: "generico",
    rigid: false,
    weight: "leve",
    status: "planejada",
    history: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("agendaByDate — prazo não é agenda", () => {
  it("execução só com dueDate não aparece na agenda", () => {
    const e = makeExecution({ dueDate: "2026-09-08" });
    expect(isScheduled(e)).toBe(false);
    expect(agendaByDate([e])).toEqual({});
  });

  it("depois de agendar (agendaDate/startTime), aparece na data agendada", () => {
    const e = makeExecution({
      dueDate: "2026-09-08",
      agendaDate: "2026-09-07",
      startTime: "14:00",
      endTime: "15:00",
    });
    expect(isScheduled(e)).toBe(true);
    const map = agendaByDate([e]);
    expect(Object.keys(map)).toEqual(["2026-09-07"]);
    expect(map["2026-09-07"][0].id).toBe("e1");
  });
});

describe("isMissed", () => {
  it("execução sem agenda só fica perdida quando o PRAZO (não a agenda) já passou", () => {
    const notDue = makeExecution({ dueDate: "2999-01-01", status: "planejada" });
    expect(isMissed(notDue)).toBe(false);
    const overdue = makeExecution({ dueDate: "2000-01-01", status: "planejada" });
    expect(isMissed(overdue)).toBe(true);
  });
});

describe("createGoal — regressão do bug 'Planejamento não encontrado'", () => {
  it("o goal criado já está no cache assim que createGoal() resolve, mesmo sem observador ativo", async () => {
    // Simula o cenário real do bug: a query já tinha sido carregada antes (usuário
    // navegou por outras telas) mas NENHUM componente está com useGoalsStore montado
    // no momento da criação — exatamente o caso de PlanejamentoFlow em criar.tsx.
    await queryClient.prefetchQuery({
      queryKey: QUERY_KEY,
      queryFn: fetchState,
    });

    const { id } = await createGoal({
      title: "Lançar um SaaS",
      why: "",
      trackingType: "etapas",
      kind: "projeto",
      category: "carreira",
      lifeArea: "Carreira",
      deadlineLabel: "Mês",
      metric: { target: 1, unit: "etapas" },
    });

    const cached = queryClient.getQueryData<{ goals: { id: string; title: string }[] }>(QUERY_KEY);
    expect(cached?.goals.some((g) => g.id === id && g.title === "Lançar um SaaS")).toBe(true);
  });

  it("um ID que nunca existiu não aparece no cache e a query não fica presa em fetching", async () => {
    await queryClient.prefetchQuery({
      queryKey: QUERY_KEY,
      queryFn: fetchState,
    });
    await createGoal({
      title: "Outro plano",
      why: "",
      trackingType: "etapas",
      kind: "projeto",
      category: "carreira",
      lifeArea: "Carreira",
      deadlineLabel: "Mês",
      metric: { target: 1, unit: "etapas" },
    });

    const cached = queryClient.getQueryData<{ goals: { id: string }[] }>(QUERY_KEY);
    expect(cached?.goals.some((g) => g.id === "id-que-nunca-existiu")).toBe(false);
    // settled: nada travado em "buscando pra sempre" — é isso que permite o
    // notFound() real disparar pra um ID genuinamente inexistente.
    expect(queryClient.getQueryState(QUERY_KEY)?.fetchStatus).toBe("idle");
  });
});

describe("scheduleExecution — agendar não duplica nem muda o prazo", () => {
  it("faz um UPDATE (nunca um INSERT) e não envia due_date no payload", async () => {
    await scheduleExecution("exec-1", "2026-09-07", "14:00", "15:00");

    expect(insertSpy).not.toHaveBeenCalledWith("executions", expect.anything());
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [table, payload] = updateSpy.mock.calls[0] as [string, Row];
    expect(table).toBe("executions");
    expect(payload).toMatchObject({
      agenda_date: "2026-09-07",
      start_time: "14:00",
      end_time: "15:00",
    });
    expect(payload).not.toHaveProperty("due_date");
  });
});

describe("setCurrentStep — só uma etapa atual por vez, sem duplicar linhas", () => {
  it("nunca faz INSERT — só UPDATE (desmarca todas do goal, depois marca a escolhida)", async () => {
    await setCurrentStep("goal-1", "step-2");

    expect(insertSpy).not.toHaveBeenCalledWith("steps", expect.anything());
    expect(updateSpy).toHaveBeenCalledTimes(2);
    const [firstTable, firstPayload] = updateSpy.mock.calls[0] as [string, Row];
    const [secondTable, secondPayload] = updateSpy.mock.calls[1] as [string, Row];
    expect(firstTable).toBe("steps");
    expect(firstPayload).toMatchObject({ is_current: false });
    expect(secondTable).toBe("steps");
    expect(secondPayload).toMatchObject({ is_current: true });
  });

  it("passar null só remove o destaque — apenas o UPDATE de desmarcar acontece", async () => {
    await setCurrentStep("goal-1", null);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [, payload] = updateSpy.mock.calls[0] as [string, Row];
    expect(payload).toMatchObject({ is_current: false });
  });
});

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    title: "Lançar um SaaS",
    why: "",
    trackingType: "etapas",
    kind: "projeto",
    category: "carreira",
    lifeArea: "Carreira",
    deadlineLabel: "Mês",
    createdAt: "2026-09-01T00:00:00.000Z",
    metric: { target: 1, unit: "etapas" },
    ...overrides,
  };
}

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: "step-1",
    goalId: "goal-1",
    title: "Etapa de teste",
    done: false,
    isCurrent: false,
    order: 0,
    ...overrides,
  };
}

describe("isPlanStalled — plano ativo sem próxima ação visível", () => {
  afterEach(() => setTestClockOverride(null));

  it("true quando não há execução pendente, etapa atual, nem conclusão recente", () => {
    const goal = makeGoal();
    expect(isPlanStalled(goal, [], [])).toBe(true);
  });

  it("false quando existe uma execução planejada (pendente) do plano", () => {
    const goal = makeGoal();
    const exec = makeExecution({ goalId: "goal-1", status: "planejada" });
    expect(isPlanStalled(goal, [], [exec])).toBe(false);
  });

  it("false quando existe uma etapa marcada como atual", () => {
    const goal = makeGoal();
    const step = makeStep({ isCurrent: true });
    expect(isPlanStalled(goal, [step], [])).toBe(false);
  });

  it("false quando existe qualquer etapa aberta, mesmo sem ser 'etapa atual' — criar a 1a etapa já basta pra tirar o alerta (regressão do CTA 'Definir próxima execução')", () => {
    const goal = makeGoal();
    const step = makeStep({ isCurrent: false, done: false });
    expect(isPlanStalled(goal, [step], [])).toBe(false);
  });

  it("false quando uma execução foi concluída nos últimos 14 dias (plano por frequência, sem etapas)", () => {
    setTestClockOverride(new Date("2026-09-20T12:00:00.000Z").getTime());
    const goal = makeGoal({ trackingType: "frequencia", frequency: { timesPerWeek: 3 } });
    const exec = makeExecution({
      goalId: "goal-1",
      status: "concluida",
      history: [{ at: "2026-09-10T00:00:00.000Z", from: "planejada", to: "concluida" }],
    });
    expect(isPlanStalled(goal, [], [exec])).toBe(false);
  });

  it("volta a true quando a última conclusão passou de 14 dias (plano por frequência, sem etapas nem execução pendente)", () => {
    setTestClockOverride(new Date("2026-09-30T12:00:00.000Z").getTime());
    const goal = makeGoal({ trackingType: "frequencia", frequency: { timesPerWeek: 3 } });
    const exec = makeExecution({
      goalId: "goal-1",
      status: "concluida",
      history: [{ at: "2026-09-10T00:00:00.000Z", from: "planejada", to: "concluida" }],
    });
    expect(isPlanStalled(goal, [], [exec])).toBe(true);
  });

  it("false para um plano já concluído (100%) — não há o que travar", () => {
    const goal = makeGoal();
    const step = makeStep({ done: true, completedAt: "2026-09-05T00:00:00.000Z" });
    expect(isPlanStalled(goal, [step], [])).toBe(false);
  });
});

describe("progressOverTime — linha de evolução só com dados reais", () => {
  it("plano 'por etapas' sem nenhuma etapa retorna vazio (nada a plotar, não inventa ponto)", () => {
    const goal = makeGoal();
    expect(progressOverTime(goal, [], [])).toEqual([]);
  });

  it("cada ponto vem de um completedAt real, e sempre fecha hoje com o percentual atual", () => {
    setTestClockOverride(new Date("2026-09-20T12:00:00.000Z").getTime());
    const goal = makeGoal();
    const steps = [
      makeStep({ id: "s1", done: true, completedAt: "2026-09-05T00:00:00.000Z" }),
      makeStep({ id: "s2", done: false }),
    ];
    const points = progressOverTime(goal, steps, []);
    // começa em 0% na criação do plano (data local a partir do createdAt, não fixa —
    // evita depender do fuso horário de quem roda o teste)
    expect(points[0]).toEqual({ date: toISODate(new Date(goal.createdAt)), pct: 0 });
    // sobe pra 50% no dia real em que a 1a de 2 etapas foi concluída
    expect(points).toContainEqual({ date: "2026-09-05", pct: 50 });
    // termina hoje com o percentual atual (mesmo número mostrado no resto da tela)
    const last = points[points.length - 1];
    expect(last.date).toBe("2026-09-20");
    expect(last.pct).toBe(50);
  });
});

describe("plannedVsActual — o que já devia ter acontecido vs. o que de fato aconteceu", () => {
  it("só conta como 'planejado' o que já venceu (prazo ou agenda no passado)", () => {
    setTestClockOverride(new Date("2026-09-10T12:00:00.000Z").getTime());
    const goal = makeGoal();
    const executions: Execution[] = [
      makeExecution({ id: "e1", goalId: "goal-1", dueDate: "2026-09-05", status: "concluida" }),
      makeExecution({ id: "e2", goalId: "goal-1", dueDate: "2026-09-08", status: "planejada" }),
      makeExecution({ id: "e3", goalId: "goal-1", dueDate: "2026-09-30", status: "planejada" }),
    ];
    const result = plannedVsActual(goal, executions);
    expect(result.planned).toBe(2); // e1 e e2 já venceram, e3 ainda não
    expect(result.actual).toBe(1); // só e1 foi de fato concluída
  });

  it("execuções canceladas/reagendadas não contam nem como planejadas", () => {
    setTestClockOverride(new Date("2026-09-10T12:00:00.000Z").getTime());
    const goal = makeGoal();
    const executions: Execution[] = [
      makeExecution({ id: "e1", goalId: "goal-1", dueDate: "2026-09-01", status: "cancelada" }),
      makeExecution({ id: "e2", goalId: "goal-1", dueDate: "2026-09-01", status: "reagendada" }),
    ];
    expect(plannedVsActual(goal, executions)).toEqual({ planned: 0, actual: 0 });
  });
});

describe("isGoalComplete / goalCompletionDate — planos concluídos saem das listas ativas", () => {
  it("isGoalComplete só é true em 100% de progresso", () => {
    const goal = makeGoal();
    const openStep = makeStep({ id: "s1", done: false });
    const doneStep = makeStep({ id: "s1", done: true, completedAt: "2026-09-05T00:00:00.000Z" });
    expect(isGoalComplete(goal, [openStep], [])).toBe(false);
    expect(isGoalComplete(goal, [doneStep], [])).toBe(true);
  });

  it("goalCompletionDate usa o completedAt real mais recente ('etapas'), não uma data inventada", () => {
    const goal = makeGoal();
    const steps = [
      makeStep({ id: "s1", done: true, completedAt: "2026-09-05T00:00:00.000Z" }),
      makeStep({ id: "s2", done: true, completedAt: "2026-09-12T00:00:00.000Z" }),
    ];
    expect(goalCompletionDate(goal, steps, [])).toBe("2026-09-12");
  });

  it("goalCompletionDate é null enquanto o plano não bateu 100%", () => {
    const goal = makeGoal();
    const steps = [
      makeStep({ id: "s1", done: true, completedAt: "2026-09-05T00:00:00.000Z" }),
      makeStep({ id: "s2", done: false }),
    ];
    expect(goalCompletionDate(goal, steps, [])).toBeNull();
  });

  it("reabrir a última etapa concluída derruba isGoalComplete de volta pra false (plano volta aos ativos)", () => {
    const goal = makeGoal();
    const reopened = makeStep({ id: "s1", done: false, completedAt: undefined });
    expect(isGoalComplete(goal, [reopened], [])).toBe(false);
  });
});

describe("scheduleStepAsExecution — agenda etapa sem execução, sem duplicar", () => {
  it("cria uma única execução vinculada à etapa e ao plano, com prazo/agenda corretos", async () => {
    const goal = makeGoal();
    const step = makeStep({ id: "step-9", targetDate: "2026-09-20" });

    await scheduleStepAsExecution(step, goal, "2026-09-15", "09:00", "10:00");

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const [table, payload] = insertSpy.mock.calls[0] as [string, Row];
    expect(table).toBe("executions");
    expect(payload).toMatchObject({
      title: step.title,
      due_date: "2026-09-20", // prazo da etapa, não a data escolhida na agenda
      agenda_date: "2026-09-15",
      start_time: "09:00",
      end_time: "10:00",
      goal_id: goal.id,
      step_id: step.id,
    });
  });

  it("sem prazo próprio, a etapa usa a data da agenda como prazo", async () => {
    const goal = makeGoal();
    const step = makeStep({ id: "step-10", targetDate: undefined });

    await scheduleStepAsExecution(step, goal, "2026-09-15", "09:00");

    const [, payload] = insertSpy.mock.calls[0] as [string, Row];
    expect(payload).toMatchObject({ due_date: "2026-09-15" });
  });
});

describe("createGoal — a primeira execução do cadastro recebe o stepId correto (item 7)", () => {
  it("retorna firstStepId apontando pra etapa de order_index 0, não pra ordem de retorno do insert", async () => {
    const { id, firstStepId } = await createGoal({
      title: "Lançar um SaaS",
      why: "",
      trackingType: "etapas",
      kind: "projeto",
      category: "carreira",
      lifeArea: "Carreira",
      deadlineLabel: "Mês",
      metric: { target: 2, unit: "etapas" },
      steps: [{ title: "Primeira etapa" }, { title: "Segunda etapa" }],
    });

    expect(id).toBeTruthy();
    expect(firstStepId).toBeTruthy();
  });

  it("sem etapas, firstStepId fica undefined", async () => {
    const { firstStepId } = await createGoal({
      title: "Plano sem etapas",
      why: "",
      trackingType: "etapas",
      kind: "projeto",
      category: "carreira",
      lifeArea: "Carreira",
      deadlineLabel: "Mês",
      metric: { target: 1, unit: "etapas" },
    });
    expect(firstStepId).toBeUndefined();
  });
});
