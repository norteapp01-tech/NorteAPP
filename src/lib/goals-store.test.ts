import { describe, it, expect, vi, beforeEach } from "vitest";
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
          insert: (payload: Row) => {
            insertSpy(table, payload);
            return chain({ data: { id: "spied", ...payload }, error: null });
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
  formatDateBR,
  agendaByDate,
  isMissed,
  isScheduled,
  fetchState,
  QUERY_KEY,
} from "./goals-store";
import type { Execution } from "./goals-store";

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

    const id = await createGoal({
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
