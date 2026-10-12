import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createFakeSupabase } from "../test/fake-supabase";

type Fake = ReturnType<typeof createFakeSupabase>;

vi.mock("./supabase/client", async () => {
  const { createFakeSupabase } = await import("../test/fake-supabase");
  const fake = createFakeSupabase("user-a");
  (globalThis as unknown as { __fake: Fake }).__fake = fake;
  return {
    supabase: fake.client,
    ensureSession: async () => fake.userId,
    useSupabaseUserId: () => fake.userId,
  };
});

import {
  cancelOccurrence,
  completeOccurrence,
  createSeries,
  discardSeries,
  editOccurrence,
  fetchSeriesState,
  materializeUpcoming,
  moveOccurrence,
  removeOccurrence,
  type OccurrenceRef,
} from "./agenda-series-store";
import {
  archiveLabel,
  createDefaultLabels,
  createLabel,
  fetchLabels,
  restoreLabel,
  updateLabel,
} from "./agenda-labels-store";
import { fetchAgendaAlerts, setExecutionAlerts } from "./agenda-alerts";
import {
  createRoutine,
  createExecution,
  fetchState as fetchGoalsState,
  removeAgendaSession,
  scheduleExecution,
  updateAgendaSession,
  updateExecutionDetails,
  updateRoutineAndFutureExecutions,
} from "./goals-store";
import { buildOccurrences, type AgendaOccurrence } from "./agenda-occurrences";
import { setTestClockOverride } from "./test-clock";

const fake = (globalThis as unknown as { __fake: Fake }).__fake;

// 2026-10-12 é segunda-feira, 08:00 (horário local do teste).
const TODAY = "2026-10-12";
const NOW_CLOCK = { date: TODAY, hm: "08:00" };

async function occurrences(from: string, to: string): Promise<AgendaOccurrence[]> {
  const [goals, seriesState] = await Promise.all([fetchGoalsState(), fetchSeriesState()]);
  return buildOccurrences({
    executions: goals.executions,
    series: seriesState.series,
    exceptions: seriesState.exceptions,
    from,
    to,
    now: NOW_CLOCK,
  });
}

const academia = {
  title: "Academia",
  category: "saude",
  startDate: TODAY,
  startTime: "18:00",
  endTime: "19:00",
  rule: { freq: "weekly" as const, interval: 1, byWeekday: [1, 3] },
};

function ref(o: AgendaOccurrence): OccurrenceRef {
  return o;
}

beforeEach(() => {
  fake.reset();
  fake.setUser("user-a");
  setTestClockOverride(new Date(2026, 9, 12, 8, 0).getTime());
});
afterEach(() => setTestClockOverride(null));

describe("criação e materialização", () => {
  it("cria a série e materializa só hoje, sem duplicar ao repetir", async () => {
    const id = await createSeries(academia);
    expect(fake.rows("agenda_series")).toHaveLength(1);
    const first = fake.rows("executions");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      series_id: id,
      series_occurrence_date: TODAY,
      status: "planejada",
    });

    await materializeUpcoming();
    await materializeUpcoming();
    expect(fake.rows("executions")).toHaveLength(1);
  });

  it("o resto das ocorrências continua só como regra (nada de linhas infinitas)", async () => {
    await createSeries({ ...academia, rule: { freq: "daily", interval: 1 } });
    // hoje e amanhã viram compromissos; o futuro distante não
    expect(fake.rows("executions").length).toBeLessThanOrEqual(2);
    const list = await occurrences(TODAY, "2026-12-31");
    expect(list.length).toBeGreaterThan(70);
    expect(list.filter((o) => o.kind === "virtual").length).toBeGreaterThan(70);
  });

  it("série com contagem para depois do total", async () => {
    await createSeries({ ...academia, rule: { freq: "weekly", interval: 1, count: 3 } });
    const list = await occurrences(TODAY, "2027-12-31");
    expect(list).toHaveLength(3);
  });

  it("desfazer uma série recém-criada não deixa ocorrências materializadas", async () => {
    const id = await createSeries({ ...academia, rule: { freq: "daily", interval: 1 } });
    expect(fake.rows("executions").length).toBeGreaterThan(0);
    await discardSeries(id);
    expect(fake.rows("agenda_series")).toHaveLength(0);
    expect(fake.rows("executions")).toHaveLength(0);
    expect(fake.rows("reminders")).toHaveLength(0);
  });
});

describe("agendamento de ações existentes", () => {
  it("o desfazer remove exatamente a sessão que acabou de ser criada", async () => {
    const id = await createExecution({
      title: "Preparar relatório",
      dueDate: "2026-10-20",
      category: "carreira",
    });
    const sessionId = await scheduleExecution(id, "2026-10-13", "14:00", "15:00");
    expect(fake.rows("executions")[0].agenda_sessions).toHaveLength(1);
    await removeAgendaSession(id, sessionId);
    expect(fake.rows("executions")[0]).toMatchObject({
      agenda_sessions: [],
      agenda_date: null,
      start_time: null,
      end_time: null,
    });
  });
});

describe("concluir e mover uma ocorrência", () => {
  it("concluir uma ocorrência futura (virtual) cria o registro concluído", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-14", "2026-10-14"))[0];
    expect(target.kind).toBe("virtual");
    const { undo } = await completeOccurrence(ref(target));
    const rows = fake.rows("executions").filter((r) => r.series_occurrence_date === "2026-10-14");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("concluida");
    await undo();
    expect(rows[0].status).toBe("planejada");
  });

  it("mover uma ocorrência vira exceção: a regra não a gera de novo e o desfazer volta", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-14", "2026-10-14"))[0];
    const { undo } = await moveOccurrence(ref(target), "2026-10-15", "07:00", "08:00");

    let list = (await occurrences("2026-10-12", "2026-10-20")).filter(
      (o) => o.title === "Academia",
    );
    expect(list.map((o) => `${o.date} ${o.startTime}`)).toEqual([
      "2026-10-12 18:00",
      "2026-10-15 07:00",
      "2026-10-19 18:00",
    ]);
    expect(fake.rows("agenda_changes").some((c) => c.kind === "moved")).toBe(true);

    await undo();
    list = (await occurrences("2026-10-12", "2026-10-20")).filter((o) => o.title === "Academia");
    expect(list.find((o) => o.occurrenceDate === "2026-10-14")!.date).toBe("2026-10-14");
  });
});

describe("editar com escopo", () => {
  it("somente esta ocorrência não mexe nas demais", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-14", "2026-10-14"))[0];
    await editOccurrence(ref(target), "this", { title: "Academia (especial)", labelId: null });
    const list = await occurrences(TODAY, "2026-10-21");
    expect(list.map((o) => o.title)).toEqual([
      "Academia",
      "Academia (especial)",
      "Academia",
      "Academia",
    ]);
    expect(fake.rows("agenda_series")[0].title).toBe("Academia");
  });

  it("esta e as próximas: a série se divide sem duplicar nada", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-19", "2026-10-19"))[0];
    await editOccurrence(ref(target), "following", {
      title: "Treino B",
      startTime: "19:00",
      endTime: "20:00",
    });

    expect(fake.rows("agenda_series")).toHaveLength(2);
    const list = await occurrences(TODAY, "2026-11-04");
    const summary = list.map((o) => `${o.date} ${o.startTime} ${o.title}`);
    expect(summary).toEqual([
      "2026-10-12 18:00 Academia",
      "2026-10-14 18:00 Academia",
      "2026-10-19 19:00 Treino B",
      "2026-10-21 19:00 Treino B",
      "2026-10-26 19:00 Treino B",
      "2026-10-28 19:00 Treino B",
      "2026-11-02 19:00 Treino B",
      "2026-11-04 19:00 Treino B",
    ]);
    // nenhuma data aparece duas vezes
    expect(new Set(list.map((o) => `${o.date}`)).size).toBe(list.length);
  });

  it("esta e as próximas na primeira ocorrência equivale a editar toda a série", async () => {
    await createSeries(academia);
    const target = (await occurrences(TODAY, TODAY))[0];
    await editOccurrence(ref(target), "following", { title: "Outro nome" });
    expect(fake.rows("agenda_series")).toHaveLength(1);
    expect(fake.rows("agenda_series")[0].title).toBe("Outro nome");
  });

  it("toda a série atualiza o modelo; exceções individuais ficam como estão", async () => {
    await createSeries(academia);
    const special = (await occurrences("2026-10-14", "2026-10-14"))[0];
    await editOccurrence(ref(special), "this", { title: "Só nesta" });

    const any = (await occurrences("2026-10-19", "2026-10-19"))[0];
    await editOccurrence(ref(any), "all", { title: "Novo nome", location: "Smart Fit" });

    const list = await occurrences(TODAY, "2026-10-21");
    const names = Object.fromEntries(list.map((o) => [o.date, o.title]));
    expect(names["2026-10-12"]).toBe("Novo nome"); // materializada, sem mexida: acompanha
    expect(names["2026-10-14"]).toBe("Só nesta"); // exceção da pessoa: preservada
    expect(names["2026-10-19"]).toBe("Novo nome");
    expect(list.find((o) => o.date === "2026-10-19")!.location).toBe("Smart Fit");
  });

  it("mudar a recorrência da série inteira", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-19", "2026-10-19"))[0];
    await editOccurrence(ref(target), "all", { rule: { freq: "daily", interval: 1 } });
    const list = await occurrences("2026-10-19", "2026-10-22");
    expect(list).toHaveLength(4);
  });

  it("desfazer a edição restaura a série", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-19", "2026-10-19"))[0];
    const { undo } = await editOccurrence(ref(target), "following", { title: "Treino B" });
    await undo();
    expect(fake.rows("agenda_series")).toHaveLength(1);
    const list = await occurrences("2026-10-19", "2026-10-28");
    expect(list.every((o) => o.title === "Academia")).toBe(true);
  });

  it("desfazer uma edição individual preserva outras ocorrências removidas", async () => {
    await createSeries(academia);
    const removed = (await occurrences("2026-10-14", "2026-10-14"))[0];
    await removeOccurrence(ref(removed), "this");
    const edited = (await occurrences("2026-10-19", "2026-10-19"))[0];
    const { undo } = await editOccurrence(ref(edited), "this", { title: "Só hoje" });
    await undo();
    expect(await occurrences("2026-10-14", "2026-10-14")).toHaveLength(0);
    expect((await occurrences("2026-10-19", "2026-10-19"))[0].title).toBe("Academia");
  });

  it("desfazer a edição da série restaura ocorrências reais e seus alertas", async () => {
    await createSeries({ ...academia, alerts: [30] });
    const target = (await occurrences(TODAY, TODAY))[0];
    const { undo } = await editOccurrence(ref(target), "all", {
      title: "Treino novo",
      startTime: "20:00",
      endTime: "21:00",
      alerts: [10],
    });
    expect(fake.rows("executions")[0]).toMatchObject({ title: "Treino novo", start_time: "20:00" });
    expect((await fetchAgendaAlerts()).map((alert) => alert.offsetMinutes)).toContain(10);
    await undo();
    expect(fake.rows("executions")[0]).toMatchObject({ title: "Academia", start_time: "18:00" });
    expect((await fetchAgendaAlerts()).map((alert) => alert.offsetMinutes)).toContain(30);
  });
});

describe("cancelar e remover", () => {
  it("cancelar uma ocorrência a mantém esmaecida e a regra não a recria", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-14", "2026-10-14"))[0];
    await cancelOccurrence(ref(target), "this");
    const list = await occurrences("2026-10-14", "2026-10-14");
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("cancelada");
  });

  it("remover uma ocorrência a tira da Agenda; desfazer a traz de volta", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-14", "2026-10-14"))[0];
    const { undo } = await removeOccurrence(ref(target), "this");
    expect(await occurrences("2026-10-14", "2026-10-14")).toHaveLength(0);
    expect(await occurrences("2026-10-19", "2026-10-19")).toHaveLength(1);
    await undo();
    expect(await occurrences("2026-10-14", "2026-10-14")).toHaveLength(1);
  });

  it("remover a de hoje (já materializada) a apaga de vez", async () => {
    await createSeries(academia);
    const today = (await occurrences(TODAY, TODAY))[0];
    expect(today.kind).toBe("execution");
    await removeOccurrence(ref(today), "this");
    expect(await occurrences(TODAY, TODAY)).toHaveLength(0);
    expect(fake.rows("executions")).toHaveLength(0);
  });

  it("cancelar esta e as próximas encerra a série e mantém o passado", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-21", "2026-10-21"))[0];
    const { undo } = await cancelOccurrence(ref(target), "following");
    const list = await occurrences(TODAY, "2026-11-30");
    expect(list.map((o) => o.date)).toEqual(["2026-10-12", "2026-10-14", "2026-10-19"]);
    await undo();
    expect((await occurrences(TODAY, "2026-10-31")).length).toBe(6);
  });

  it("remover toda a série", async () => {
    await createSeries(academia);
    const target = (await occurrences("2026-10-14", "2026-10-14"))[0];
    await removeOccurrence(ref(target), "all");
    expect(await occurrences(TODAY, "2026-12-31")).toEqual([]);
  });
});

describe("alertas acompanham o compromisso", () => {
  it("alertas da série viram lembretes das próximas ocorrências e saem do cartão de lembretes", async () => {
    await createSeries({ ...academia, alerts: [30, 1440] });
    const alerts = await fetchAgendaAlerts();
    expect(alerts.length).toBeGreaterThan(6);
    expect(fake.rows("reminders").every((r) => r.origin === "agenda_alert")).toBe(true);
    // a ocorrência de hoje (materializada) herdou os alertas
    const exec = fake.rows("executions")[0];
    expect(alerts.some((a) => a.executionId === exec.id)).toBe(true);
  });

  it("reagendar o compromisso desloca o horário do alerta", async () => {
    const id = await createExecution({
      title: "Dentista",
      dueDate: "2026-10-20",
      agendaDate: "2026-10-20",
      startTime: "15:00",
      endTime: "16:00",
      category: "saude",
    });
    await setExecutionAlerts(
      { id, title: "Dentista", date: "2026-10-20", startTime: "15:00" },
      [60],
    );
    const before = fake.rows("reminders")[0];
    expect(before.offset_minutes).toBe(60);
    const firstRemind = new Date(before.remind_at as string).getTime();

    await updateAgendaSession(id, undefined, "2026-10-21", "16:00", "17:00");
    const after = fake.rows("reminders")[0];
    expect(after.date).toBe("2026-10-21");
    // um dia e uma hora depois, com o mesmo antecedente de 60 min
    expect(new Date(after.remind_at as string).getTime() - firstRemind).toBe(25 * 3_600_000);
    expect(after.offset_minutes).toBe(60);
  });

  it("concluir ou cancelar o compromisso retira o alerta", async () => {
    const id = await createExecution({
      title: "Dentista",
      dueDate: "2026-10-20",
      agendaDate: "2026-10-20",
      startTime: "15:00",
      category: "saude",
    });
    await setExecutionAlerts(
      { id, title: "Dentista", date: "2026-10-20", startTime: "15:00" },
      [10],
    );
    expect(fake.rows("reminders")).toHaveLength(1);
    const { setExecutionStatus } = await import("./goals-store");
    await setExecutionStatus(id, "cancelada");
    expect(fake.rows("reminders")).toHaveLength(0);
  });
});

describe("rótulos", () => {
  it("oferece o conjunto padrão só quando ainda não há rótulos", async () => {
    await createDefaultLabels();
    expect((await fetchLabels()).map((l) => l.name)).toEqual([
      "Trabalho",
      "Família",
      "Saúde",
      "Pessoal",
    ]);
    await createDefaultLabels();
    expect(await fetchLabels()).toHaveLength(4);
  });

  it("criar, renomear, arquivar e reativar sem apagar", async () => {
    const id = await createLabel({ name: "Empresa A", color: "#7cb8ff" });
    await updateLabel(id, { name: "Empresa Alfa", color: "#f0b867", icon: "briefcase" });
    await archiveLabel(id);
    let label = (await fetchLabels())[0];
    expect(label).toMatchObject({ name: "Empresa Alfa", archived: true, color: "#f0b867" });
    await restoreLabel(id);
    label = (await fetchLabels())[0];
    expect(label.archived).toBe(false);
  });

  it("rótulo vazio é recusado", async () => {
    await expect(createLabel({ name: "  ", color: "#7cb8ff" })).rejects.toThrow();
  });

  it("associar e remover o rótulo de um compromisso, sem perder o histórico", async () => {
    const labelId = await createLabel({ name: "Trabalho", color: "#7cb8ff" });
    const id = await createExecution({
      title: "Reunião",
      dueDate: "2026-10-20",
      agendaDate: "2026-10-20",
      startTime: "10:00",
      category: "carreira",
    });
    await updateExecutionDetails(id, { labelId });
    expect(fake.rows("executions")[0].label_id).toBe(labelId);
    await updateExecutionDetails(id, { labelId: null });
    expect(fake.rows("executions")[0].label_id).toBeNull();
    expect(fake.rows("agenda_changes").filter((c) => c.kind === "label_changed")).toHaveLength(2);
  });

  it("arquivar um rótulo não apaga os compromissos que o usam", async () => {
    const labelId = await createLabel({ name: "Trabalho", color: "#7cb8ff" });
    await createExecution({
      title: "Reunião",
      dueDate: "2026-10-20",
      agendaDate: "2026-10-20",
      startTime: "10:00",
      category: "carreira",
      labelId,
    });
    await archiveLabel(labelId);
    expect(fake.rows("executions")[0].label_id).toBe(labelId);
  });
});

describe("dados são de cada pessoa", () => {
  it("rótulos, séries e compromissos de uma pessoa não aparecem para outra", async () => {
    await createLabel({ name: "Só da A", color: "#7cb8ff" });
    await createSeries(academia);
    expect(await fetchLabels()).toHaveLength(1);
    expect((await fetchSeriesState()).series).toHaveLength(1);

    fake.setUser("user-b");
    expect(await fetchLabels()).toHaveLength(0);
    expect((await fetchSeriesState()).series).toHaveLength(0);
    expect((await fetchGoalsState()).executions).toHaveLength(0);
  });

  it("outra pessoa não consegue alterar nem apagar o que não é dela", async () => {
    const id = await createLabel({ name: "Da A", color: "#7cb8ff" });
    fake.setUser("user-b");
    await updateLabel(id, { name: "Invadido" }).catch(() => undefined);
    await archiveLabel(id).catch(() => undefined);
    fake.setUser("user-a");
    expect((await fetchLabels())[0]).toMatchObject({ name: "Da A", archived: false });
  });

  it("não é possível gravar uma linha em nome de outra pessoa", async () => {
    const { supabase } = await import("./supabase/client");
    const res = await supabase
      .from("agenda_labels")
      .insert({ user_id: "user-b", name: "x" })
      .select();
    expect(res.error).not.toBeNull();
  });
});

describe("dados antigos", () => {
  it("compromissos antigos (sem rótulo, série ou alerta) seguem válidos", async () => {
    fake.seed("executions", {
      user_id: "user-a",
      title: "Legado",
      due_date: "2026-10-12",
      agenda_date: "2026-10-12",
      start_time: "09:00",
      end_time: "10:00",
      category: "generico",
    });
    const list = await occurrences(TODAY, TODAY);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Legado", labelId: undefined, recurring: false });
  });

  it("execuções geradas por rotina continuam aparecendo como recorrentes", async () => {
    fake.seed("executions", {
      user_id: "user-a",
      title: "Treino A",
      due_date: "2026-10-13",
      agenda_date: "2026-10-13",
      start_time: "07:00",
      category: "academia",
      routine_id: "routine-1",
    });
    const [item] = await occurrences("2026-10-13", "2026-10-13");
    expect(item.recurring).toBe(true);
    expect(item.routineId).toBe("routine-1");
  });

  it("rotina pode alterar esta e as próximas pela Agenda e desfazer por inteiro", async () => {
    const routineId = await createRoutine({
      category: "academia",
      title: "Treino A",
      weekday: 1,
      time: "18:00",
    });
    const { undo } = await updateRoutineAndFutureExecutions(
      routineId,
      { title: "Treino B", time: "19:00", endTime: "20:00", alerts: [30] },
      TODAY,
    );
    expect(fake.rows("routines")[0]).toMatchObject({ title: "Treino B", time: "19:00" });
    expect(
      fake
        .rows("executions")
        .every((row) => row.title === "Treino B" && row.start_time === "19:00"),
    ).toBe(true);
    expect(fake.rows("reminders").length).toBeGreaterThan(0);
    await undo();
    expect(fake.rows("routines")[0]).toMatchObject({ title: "Treino A", time: "18:00" });
    expect(
      fake
        .rows("executions")
        .every((row) => row.title === "Treino A" && row.start_time === "18:00"),
    ).toBe(true);
    expect(fake.rows("reminders")).toHaveLength(0);
  });
});
