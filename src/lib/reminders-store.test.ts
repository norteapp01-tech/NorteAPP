import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setTestClockOverride } from "./test-clock";

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

const { insertSpy, updateSpy, deleteSpy } = vi.hoisted(() => ({
  insertSpy: vi.fn(),
  updateSpy: vi.fn(),
  deleteSpy: vi.fn(),
}));

vi.mock("./supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => chain({ data: [], error: null }),
      order: () => chain({ data: [], error: null }),
      eq: () => chain({ data: [], error: null }),
      insert: (payload: Row) => {
        insertSpy(table, payload);
        return chain({ data: { id: "r-1", ...payload }, error: null });
      },
      update: (payload: Row) => {
        updateSpy(table, payload);
        return chain({ data: { id: "spied", ...payload }, error: null });
      },
      delete: () => {
        deleteSpy(table);
        return chain({ data: null, error: null });
      },
    }),
  },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

import {
  reminderStatus,
  overdueReminders,
  todayReminders,
  upcomingReminders,
  recentlyCompletedReminders,
  highlightedReminders,
  formatRelativeDate,
  createReminder,
  toggleReminder,
  removeReminder,
  fetchState,
  type Reminder,
} from "./reminders-store";
import { queryClient } from "./query-client";

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "rem-1",
    text: "Ligar pro dentista",
    date: "2026-09-04",
    done: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  insertSpy.mockClear();
  updateSpy.mockClear();
  deleteSpy.mockClear();
  queryClient.clear();
});
afterEach(() => setTestClockOverride(null));

describe("reminderStatus", () => {
  it("classifica atrasado/hoje/próximo/concluído corretamente", () => {
    const today = "2026-09-04";
    expect(reminderStatus(makeReminder({ date: "2026-09-01" }), today)).toBe("atrasado");
    expect(reminderStatus(makeReminder({ date: "2026-09-04" }), today)).toBe("hoje");
    expect(reminderStatus(makeReminder({ date: "2026-09-10" }), today)).toBe("proximo");
    expect(reminderStatus(makeReminder({ date: "2026-09-01", done: true }), today)).toBe(
      "concluido",
    );
  });

  it("um lembrete não concluído permanece atrasado, nunca some sozinho", () => {
    // mesmo muito no passado, sem estar `done`, o status é sempre "atrasado" —
    // não existe um terceiro estado "expirado/sumido".
    expect(reminderStatus(makeReminder({ date: "2020-01-01" }), "2026-09-04")).toBe("atrasado");
  });
});

describe("ordenação: atrasados, depois hoje, depois próximos", () => {
  const today = "2026-09-04";
  const reminders = [
    makeReminder({ id: "future", date: "2026-09-10" }),
    makeReminder({ id: "overdue2", date: "2026-09-02" }),
    makeReminder({ id: "todayR", date: "2026-09-04" }),
    makeReminder({ id: "overdue1", date: "2026-09-01" }),
  ];

  it("overdueReminders vem ordenado do mais antigo pro mais recente", () => {
    expect(overdueReminders(reminders, today).map((r) => r.id)).toEqual(["overdue1", "overdue2"]);
  });

  it("todayReminders só contém os de hoje", () => {
    expect(todayReminders(reminders, today).map((r) => r.id)).toEqual(["todayR"]);
  });

  it("upcomingReminders só contém datas futuras", () => {
    expect(upcomingReminders(reminders, today).map((r) => r.id)).toEqual(["future"]);
  });

  it("highlightedReminders junta atrasados+hoje, na ordem certa, sem nenhum futuro", () => {
    const ids = highlightedReminders(reminders, today).map((r) => r.id);
    expect(ids).toEqual(["overdue1", "overdue2", "todayR"]);
    expect(ids).not.toContain("future");
  });
});

describe("recentlyCompletedReminders", () => {
  it("mais recentes primeiro, só os concluídos", () => {
    const reminders = [
      makeReminder({ id: "a", done: true, updatedAt: "2026-09-01T00:00:00.000Z" }),
      makeReminder({ id: "b", done: false, updatedAt: "2026-09-05T00:00:00.000Z" }),
      makeReminder({ id: "c", done: true, updatedAt: "2026-09-03T00:00:00.000Z" }),
    ];
    expect(recentlyCompletedReminders(reminders).map((r) => r.id)).toEqual(["c", "a"]);
  });
});

describe("formatRelativeDate", () => {
  it("hoje, amanhã, dia da semana dentro da semana, e DD/MM além disso", () => {
    setTestClockOverride(new Date("2026-09-04T12:00:00.000Z").getTime()); // uma sexta-feira
    const today = "2026-09-04";
    expect(formatRelativeDate("2026-09-04", today)).toBe("Hoje");
    expect(formatRelativeDate("2026-09-05", today)).toBe("Amanhã");
    expect(formatRelativeDate("2026-09-08", today)).toBe("Terça-feira");
    expect(formatRelativeDate("2026-09-20", today)).toBe("20/09");
  });
});

describe("mutations — CRUD + duplo clique + otimismo", () => {
  it("createReminder faz um INSERT com os campos certos", async () => {
    await createReminder({ text: "Pagar conta", date: "2026-09-10" });
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const [table, payload] = insertSpy.mock.calls[0] as [string, Row];
    expect(table).toBe("reminders");
    expect(payload).toMatchObject({ text: "Pagar conta", date: "2026-09-10" });
  });

  it("toggleReminder atualiza o cache otimisticamente antes do round-trip", async () => {
    // prefetch com a queryFn real registra a query no cache — sem isso, o
    // refetch disparado por invalidate() dentro de toggleReminder não teria
    // queryFn associada e falharia.
    await queryClient.prefetchQuery({ queryKey: ["reminders-domain"], queryFn: fetchState });
    queryClient.setQueryData(["reminders-domain"], [makeReminder({ id: "rem-1", done: false })]);
    const promise = toggleReminder("rem-1", false);
    // logo após chamar (antes do await terminar), o cache já deve refletir done:true
    const cachedDuring = queryClient.getQueryData<Reminder[]>(["reminders-domain"]);
    expect(cachedDuring?.[0].done).toBe(true);
    await promise;
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [, payload] = updateSpy.mock.calls[0] as [string, Row];
    expect(payload).toMatchObject({ done: true });
  });

  it("removeReminder faz um DELETE, nunca um UPDATE de soft-delete", async () => {
    await removeReminder("rem-1");
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
