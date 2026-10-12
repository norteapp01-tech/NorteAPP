import { describe, expect, it, vi } from "vitest";

// goals-store importa o client do Supabase no topo; estes testes só usam
// funções puras (mesmo padrão do goals-store.test.ts).
vi.mock("./supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

import {
  buildOccurrences,
  loadForDate,
  occurrencesForDay,
  resolveStatus,
  type SeriesRecord,
} from "./agenda-occurrences";
import {
  EMPTY_FILTERS,
  filterOccurrences,
  hasActiveFilters,
  matchesQuery,
  normalizeText,
  searchAgenda,
} from "./agenda-search";
import {
  MONTH_NAMES,
  monthGrid,
  rangeForView,
  shiftDate,
  startOfWeekISO,
  titleForView,
  upcomingSections,
  weekDates,
} from "./agenda-navigation";
import { fitCandidates, suggestSlotsFor } from "./agenda-fit";
import { addDaysISO } from "./agenda-intervals";
import { summarizeHistory } from "./agenda-history";
import { DEFAULT_AGENDA_SETTINGS, parseAgendaSettings } from "./agenda-settings";
import type { Execution, Goal, Step } from "./goals-store";

const NOW = { date: "2026-10-12", hm: "10:00" };

function exec(o: Partial<Execution> = {}): Execution {
  return {
    id: "e1",
    title: "Reunião",
    dueDate: "2026-10-12",
    category: "generico",
    rigid: false,
    weight: "leve",
    status: "planejada",
    history: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    agendaDate: "2026-10-12",
    startTime: "14:00",
    endTime: "15:00",
    ...o,
  };
}

function series(o: Partial<SeriesRecord> = {}): SeriesRecord {
  return {
    id: "s1",
    title: "Academia",
    category: "saude",
    rigid: false,
    weight: "leve",
    startDate: "2026-10-12",
    startTime: "18:00",
    endTime: "19:00",
    allDay: false,
    rule: { freq: "weekly", interval: 1, byWeekday: [1, 3] },
    alerts: [],
    source: "norte",
    createdAt: "2026-10-01T00:00:00.000Z",
    ...o,
  };
}

function goal(o: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    title: "Lançar o app",
    why: "",
    trackingType: "etapas",
    kind: "projeto",
    planType: "comum",
    category: "carreira",
    lifeArea: "Carreira",
    deadlineLabel: "Mês",
    createdAt: "2026-10-01T00:00:00.000Z",
    metric: { target: 1, unit: "etapas" },
    ...o,
  };
}

describe("ocorrências: compromissos reais + séries", () => {
  it("junta compromissos reais e ocorrências calculadas, em ordem", () => {
    const list = buildOccurrences({
      executions: [exec()],
      series: [series()],
      exceptions: [],
      from: "2026-10-12",
      to: "2026-10-14",
      now: NOW,
    });
    expect(list.map((o) => `${o.date} ${o.startTime} ${o.title}`)).toEqual([
      "2026-10-12 14:00 Reunião",
      "2026-10-12 18:00 Academia",
      "2026-10-14 18:00 Academia",
    ]);
    expect(list.filter((o) => o.kind === "virtual")).toHaveLength(2);
  });

  it("ocorrência com linha própria não é gerada de novo pela regra", () => {
    const moved = exec({
      id: "e2",
      title: "Academia",
      seriesId: "s1",
      seriesOccurrenceDate: "2026-10-12",
      agendaDate: "2026-10-13",
      startTime: "07:00",
      endTime: "08:00",
    });
    const list = buildOccurrences({
      executions: [moved],
      series: [series()],
      exceptions: [],
      from: "2026-10-12",
      to: "2026-10-14",
      now: NOW,
    });
    const academia = list.filter((o) => o.title === "Academia");
    // A segunda (12) foi movida para terça (13): sobram a movida e a de quarta (14).
    expect(academia.map((o) => `${o.date} ${o.startTime}`)).toEqual([
      "2026-10-13 07:00",
      "2026-10-14 18:00",
    ]);
  });

  it("ocorrência removida (exceção) some; as outras continuam", () => {
    const list = buildOccurrences({
      executions: [],
      series: [series()],
      exceptions: [{ seriesId: "s1", occurrenceDate: "2026-10-12", kind: "removed" }],
      from: "2026-10-12",
      to: "2026-10-14",
      now: NOW,
    });
    expect(list.map((o) => o.date)).toEqual(["2026-10-14"]);
  });

  it("série arquivada não gera nada", () => {
    expect(
      buildOccurrences({
        executions: [],
        series: [series({ archivedAt: "2026-10-10T00:00:00Z" })],
        exceptions: [],
        from: "2026-10-12",
        to: "2026-10-30",
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("compromisso antigo, sem rótulo nem série, continua válido", () => {
    const [o] = buildOccurrences({
      executions: [exec({ labelId: undefined, seriesId: undefined })],
      series: [],
      exceptions: [],
      from: "2026-10-12",
      to: "2026-10-12",
      now: NOW,
    });
    expect(o.labelId).toBeUndefined();
    expect(o.recurring).toBe(false);
    expect(o.source).toBe("norte");
  });

  it("compromisso reagendado (substituído) não aparece", () => {
    expect(
      buildOccurrences({
        executions: [exec({ status: "reagendada" })],
        series: [],
        exceptions: [],
        from: "2026-10-12",
        to: "2026-10-12",
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("planejada vencida vira perdida; futura continua planejada", () => {
    expect(resolveStatus("planejada", "2026-10-12", "09:00", false, NOW)).toBe("perdida");
    expect(resolveStatus("planejada", "2026-10-12", "14:00", false, NOW)).toBe("planejada");
    expect(resolveStatus("concluida", "2026-10-01", "09:00", false, NOW)).toBe("concluida");
  });

  it("dia inteiro não ocupa horário", () => {
    const list = buildOccurrences({
      executions: [exec({ allDay: true, startTime: undefined, endTime: undefined })],
      series: [],
      exceptions: [],
      from: "2026-10-12",
      to: "2026-10-12",
      now: NOW,
    });
    expect(list[0].allDay).toBe(true);
    expect(loadForDate(list, "2026-10-12").busy).toBe(0);
    expect(loadForDate(list, "2026-10-12").untimedCount).toBe(1);
  });
});

describe("dia: noturnos, cancelados e carga", () => {
  const night = exec({
    id: "n",
    title: "Plantão",
    agendaDate: "2026-10-11",
    startTime: "23:00",
    endTime: "01:00",
  });

  it("continuação do dia anterior aparece no dia seguinte", () => {
    const all = buildOccurrences({
      executions: [night],
      series: [],
      exceptions: [],
      from: "2026-10-11",
      to: "2026-10-12",
      now: NOW,
    });
    expect(occurrencesForDay(all, "2026-10-12").overnight.map((o) => o.title)).toEqual(["Plantão"]);
    expect(occurrencesForDay(all, "2026-10-11").overnight).toEqual([]);
  });

  it("22:30–00:00 não vira continuação", () => {
    const all = buildOccurrences({
      executions: [exec({ startTime: "22:30", endTime: "00:00" })],
      series: [],
      exceptions: [],
      from: "2026-10-12",
      to: "2026-10-13",
      now: NOW,
    });
    expect(occurrencesForDay(all, "2026-10-13").overnight).toEqual([]);
  });

  it("cancelado não conta na carga do dia", () => {
    const all = buildOccurrences({
      executions: [
        exec({ status: "cancelada" }),
        exec({ id: "e2", startTime: "16:00", endTime: "17:00" }),
      ],
      series: [],
      exceptions: [],
      from: "2026-10-12",
      to: "2026-10-12",
      now: NOW,
    });
    expect(loadForDate(all, "2026-10-12").busy).toBe(60);
  });

  it("carga considera a parte do dia anterior", () => {
    const all = buildOccurrences({
      executions: [night],
      series: [],
      exceptions: [],
      from: "2026-10-11",
      to: "2026-10-12",
      now: NOW,
    });
    expect(loadForDate(all, "2026-10-12").busy).toBe(60);
    expect(loadForDate(all, "2026-10-11").busy).toBe(60);
  });
});

describe("busca e filtros", () => {
  const labelName = (id?: string) => ({ w: "Trabalho", s: "Saúde" })[id ?? ""];
  const all = buildOccurrences({
    executions: [
      exec({
        id: "a",
        title: "Dentista",
        labelId: "s",
        location: "Clínica Sorriso",
        notes: "levar exames",
      }),
      exec({ id: "b", title: "Reunião de equipe", labelId: "w", rigid: true, goalId: "g1" }),
      exec({ id: "c", title: "Ligar para a mãe", status: "concluida", agendaDate: "2026-09-01" }),
    ],
    series: [],
    exceptions: [],
    from: "2026-09-01",
    to: "2026-10-30",
    now: NOW,
  });

  it("ignora acento e caixa", () => {
    expect(normalizeText("Saúde")).toBe("saude");
    const dentist = all.find((o) => o.executionId === "a")!;
    expect(matchesQuery(dentist, "SAUDE", { labelName })).toBe(true);
  });

  it("busca em título, local, nota e rótulo", () => {
    const ids = (q: string) =>
      searchAgenda(all, q, EMPTY_FILTERS, { labelName }).map((o) => o.executionId);
    expect(ids("dentista")).toEqual(["a"]);
    expect(ids("sorriso")).toEqual(["a"]);
    expect(ids("exames")).toEqual(["a"]);
    expect(ids("trabalho")).toEqual(["b"]);
  });

  it("encontra passado e futuro em ordem cronológica", () => {
    const found = searchAgenda(all, "", EMPTY_FILTERS);
    expect(found.map((o) => o.date)).toEqual([...found.map((o) => o.date)].sort());
    expect(found.some((o) => o.date === "2026-09-01")).toBe(true);
  });

  it("busca por data no formato brasileiro", () => {
    expect(searchAgenda(all, "01/09", EMPTY_FILTERS).map((o) => o.executionId)).toEqual(["c"]);
  });

  it("filtra por rótulo, estado, rigidez e plano", () => {
    expect(
      filterOccurrences(all, { ...EMPTY_FILTERS, labelIds: ["w"], includeUnlabeled: false }),
    ).toHaveLength(1);
    expect(filterOccurrences(all, { ...EMPTY_FILTERS, statuses: ["concluida"] })).toHaveLength(1);
    expect(filterOccurrences(all, { ...EMPTY_FILTERS, rigid: "rigidos" })).toHaveLength(1);
    expect(filterOccurrences(all, { ...EMPTY_FILTERS, plan: "com" })).toHaveLength(1);
    expect(filterOccurrences(all, { ...EMPTY_FILTERS, plan: "sem" })).toHaveLength(2);
  });

  it("filtra por conflito e por intervalo de datas", () => {
    // a e b estão no mesmo horário (14:00–15:00) no dia 12/10
    const conflicting = filterOccurrences(all, { ...EMPTY_FILTERS, conflict: true });
    expect(conflicting.map((o) => o.executionId).sort()).toEqual(["a", "b"]);
    expect(filterOccurrences(all, { ...EMPTY_FILTERS, from: "2026-10-01" })).toHaveLength(2);
  });

  it("detecta filtros ativos", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, conflict: true })).toBe(true);
  });
});

describe("navegação", () => {
  it("avançar uma semana mantém o dia da semana", () => {
    expect(shiftDate("2026-10-14", "semana", 1)).toBe("2026-10-21");
    expect(shiftDate("2026-10-14", "semana", -1)).toBe("2026-10-07");
  });

  it("o mês acompanha: dia 31 cai no último dia do mês curto", () => {
    expect(shiftDate("2026-01-31", "mes", 1)).toBe("2026-02-28");
  });

  it("semana começa segunda ou domingo conforme a preferência", () => {
    expect(startOfWeekISO("2026-10-14", "monday")).toBe("2026-10-12");
    expect(startOfWeekISO("2026-10-14", "sunday")).toBe("2026-10-11");
    expect(weekDates("2026-10-14", "monday")[0]).toBe("2026-10-12");
  });

  it("sem fins de semana a semana tem cinco dias", () => {
    expect(weekDates("2026-10-14", "monday", false)).toHaveLength(5);
  });

  it("título e intervalo derivam do dia selecionado", () => {
    expect(titleForView("2026-10-14", "mes", "monday")).toBe(`${MONTH_NAMES[9]} 2026`);
    expect(titleForView("2026-10-14", "semana", "monday")).toBe("12–18 de outubro");
    expect(rangeForView("2026-10-14", "dia", "monday")).toEqual({
      from: "2026-10-13",
      to: "2026-10-14",
    });
  });

  it("a grade do mês tem linhas completas de 7 dias", () => {
    const rows = monthGrid("2026-10-14", "monday");
    expect(rows.every((r) => r.length === 7)).toBe(true);
    expect(rows.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });

  it("o mês carrega também a véspera do primeiro quadrinho para eventos noturnos", () => {
    const rows = monthGrid("2026-10-14", "monday");
    const range = rangeForView("2026-10-14", "mes", "monday");
    expect(range.from).toBe(addDaysISO(rows[0][0].date, -1));
    expect(range.to).toBe(rows.at(-1)!.at(-1)!.date);
  });

  it("próximos: hoje, amanhã, esta semana e próximas semanas", () => {
    const items = ["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-25", "2026-10-01"].map(
      (date) => ({ date }),
    );
    const sections = upcomingSections(items, "2026-10-12", "monday");
    expect(sections.map((s) => s.id)).toEqual(["hoje", "amanha", "semana", "proximas"]);
    expect(sections.flatMap((s) => s.items).some((i) => i.date === "2026-10-01")).toBe(false);
  });
});

describe("para encaixar", () => {
  const goals = [goal()];
  const steps: Step[] = [];

  it("lista ações de planos ativos com prazo e sem horário, por prazo", () => {
    const list = fitCandidates(
      [
        exec({
          id: "x",
          title: "Mais tarde",
          dueDate: "2026-10-30",
          goalId: "g1",
          agendaDate: undefined,
          startTime: undefined,
          endTime: undefined,
        }),
        exec({
          id: "y",
          title: "Urgente",
          dueDate: "2026-10-13",
          goalId: "g1",
          agendaDate: undefined,
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      goals,
      steps,
      "2026-10-12",
    );
    expect(list.map((i) => i.execution.title)).toEqual(["Urgente", "Mais tarde"]);
    expect(list[0].soon).toBe(true);
    expect(list[1].soon).toBe(false);
  });

  it("não inclui o que já tem horário, concluído, cancelado ou sem plano", () => {
    const base = { goalId: "g1", agendaDate: undefined, startTime: undefined, endTime: undefined };
    const list = fitCandidates(
      [
        exec({ id: "1", ...base, agendaDate: "2026-10-20", startTime: "09:00" }),
        exec({ id: "2", ...base, status: "concluida" }),
        exec({ id: "3", ...base, status: "cancelada" }),
        exec({ id: "4", ...base, goalId: undefined }),
      ],
      goals,
      steps,
      "2026-10-12",
    );
    expect(list).toEqual([]);
  });

  it("sugere horário livre antes do prazo", () => {
    const [item] = fitCandidates(
      [
        exec({
          id: "y",
          dueDate: "2026-10-13",
          goalId: "g1",
          agendaDate: undefined,
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      goals,
      steps,
      "2026-10-12",
    );
    const slots = suggestSlotsFor(
      item,
      [{ date: "2026-10-12", startTime: "10:00", endTime: "22:00" }],
      DEFAULT_AGENDA_SETTINGS,
      { date: "2026-10-12", minute: 10 * 60 },
    );
    expect(slots[0].date).toBe("2026-10-13");
    expect(slots.every((s) => s.date <= "2026-10-13")).toBe(true);
  });
});

describe("configurações", () => {
  it("descarta valores inválidos e mantém os padrões", () => {
    expect(parseAgendaSettings(null)).toEqual(DEFAULT_AGENDA_SETTINGS);
    const parsed = parseAgendaSettings({
      defaultDurationMin: -5,
      dayStart: "25:00",
      defaultView: "xyz",
      showWeekends: "sim",
    });
    expect(parsed).toEqual(DEFAULT_AGENDA_SETTINGS);
  });

  it("aceita valores válidos e corrige janela invertida", () => {
    const parsed = parseAgendaSettings({
      defaultDurationMin: 45,
      dayStart: "09:00",
      dayEnd: "18:00",
      defaultView: "semana",
      showWeekends: false,
      defaultAlertMin: 10,
    });
    expect(parsed).toMatchObject({
      defaultDurationMin: 45,
      dayStart: "09:00",
      dayEnd: "18:00",
      defaultView: "semana",
      showWeekends: false,
      defaultAlertMin: 10,
    });
    expect(parseAgendaSettings({ dayStart: "20:00", dayEnd: "08:00" }).dayStart).toBe("07:00");
  });
});

describe("histórico essencial", () => {
  it("conta reagendamentos e guarda o horário original", () => {
    const summary = summarizeHistory([
      { at: "2026-10-01T10:00:00Z", kind: "scheduled", toDate: "2026-10-12", toStart: "14:00" },
      {
        at: "2026-10-02T10:00:00Z",
        kind: "moved",
        fromDate: "2026-10-12",
        fromStart: "14:00",
        toDate: "2026-10-13",
        toStart: "15:00",
      },
      {
        at: "2026-10-03T10:00:00Z",
        kind: "moved",
        fromDate: "2026-10-13",
        fromStart: "15:00",
        toDate: "2026-10-14",
        toStart: "09:00",
      },
      { at: "2026-10-14T10:00:00Z", kind: "completed" },
    ]);
    expect(summary.rescheduleCount).toBe(2);
    expect(summary.original).toEqual({ date: "2026-10-12", start: "14:00" });
    expect(summary.completedAt).toBe("2026-10-14T10:00:00Z");
  });

  it("sem histórico não inventa nada", () => {
    expect(summarizeHistory([])).toEqual({
      rescheduleCount: 0,
      original: undefined,
      completedAt: undefined,
      cancelledAt: undefined,
    });
  });
});
