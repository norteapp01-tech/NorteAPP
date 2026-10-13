// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../test/fake-supabase";
import { FakeGoogle } from "../../test/fake-google";
import type { GoogleCalendarApi } from "../../../supabase/functions/_shared/google/api.ts";
import {
  enqueueBackfill,
  pullCalendar,
  pushOutbox,
  resolveConflict,
  type Cal,
  type Ctx,
} from "../../../supabase/functions/_shared/google/engine.ts";
import type { GoogleEvent } from "../../../supabase/functions/_shared/google/mapping.ts";

const SP = "America/Sao_Paulo";
const CAL = "principal@example.com";
const RO = "feriados@example.com";

function setup() {
  const fake = createFakeSupabase("user-a");
  fake.setServiceRole(true);
  const google = new FakeGoogle();
  const conn = fake.seed("google_calendar_connections", {
    user_id: "user-a",
    google_account_id: "sub-a",
    google_email: "a@example.com",
    time_zone: SP,
  });
  const cal = fake.seed("google_calendars", {
    connection_id: conn.id,
    user_id: "user-a",
    google_calendar_id: CAL,
    summary: "Principal",
    background_color: "#7cb8ff",
    access_role: "owner",
    selected: true,
    push_new_events: true,
  }) as unknown as Cal;
  const ctx: Ctx = {
    db: fake.client,
    api: google.api as unknown as GoogleCalendarApi,
    conn: { id: String(conn.id), user_id: "user-a", time_zone: SP, push_routines: false },
    zone: SP,
    now: () => new Date("2026-10-12T12:00:00Z"), // 09:00 em São Paulo
    stats: {},
    newId: () => crypto.randomUUID(),
  };
  const pull = (c: Cal = cal, initial = false) => pullCalendar(ctx, c, { initial });
  const push = () => pushOutbox(ctx);
  const enqueue = async (type: "execution" | "series", id: unknown, op = "upsert") => {
    await fake.client
      .from("agenda_sync_outbox")
      .upsert(
        { user_id: "user-a", entity_type: type, entity_id: id, op },
        { onConflict: "entity_type,entity_id,op" },
      );
  };
  return { fake, google, conn, cal, ctx, pull, push, enqueue };
}

/** Evento do Google com hora, em horário de Brasília. */
const timed = (
  id: string,
  summary: string,
  date: string,
  start: string,
  end: string,
  extra: Partial<GoogleEvent> = {},
): GoogleEvent => ({
  id,
  summary,
  status: "confirmed",
  start: { dateTime: `${date}T${start}:00-03:00`, timeZone: SP },
  end: {
    dateTime: `${end.includes("+") ? end.split("+")[0] : date}T${end.replace("+", "")}:00-03:00`,
    timeZone: SP,
  },
  ...extra,
});

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

const execs = () => t.fake.rows("executions");
const links = () => t.fake.rows("agenda_external_links");

describe("Google → Norte: criar, editar e excluir", () => {
  it("cria o compromisso com título, horário, local, nota e Meet", async () => {
    t.google.put(CAL, {
      ...timed("g1", "Reunião", "2026-10-14", "14:00", "15:30"),
      location: "Sala 3",
      description: "Pauta",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    });
    await t.pull();
    expect(execs()).toHaveLength(1);
    expect(execs()[0]).toMatchObject({
      title: "Reunião",
      agenda_date: "2026-10-14",
      start_time: "14:00",
      end_time: "15:30",
      location: "Sala 3",
      notes: "Pauta",
      link: "https://meet.google.com/abc-defg-hij",
      source: "external",
      due_date: "2026-10-14",
      status: "planejada",
    });
    expect(links()[0]).toMatchObject({
      external_event_id: "g1",
      external_calendar_id: CAL,
      kind: "event",
      origin: "external",
      access_role: "write",
      sync_state: "synced",
      external_color: "#7cb8ff",
    });
  });

  it("sincronizar de novo não duplica", async () => {
    t.google.put(CAL, timed("g1", "Reunião", "2026-10-14", "14:00", "15:00"));
    await t.pull();
    await t.pull();
    await t.pull(t.cal, true);
    expect(execs()).toHaveLength(1);
    expect(links()).toHaveLength(1);
  });

  it("edição no Google chega ao Norte (horário, título, local)", async () => {
    t.google.put(CAL, timed("g1", "Reunião", "2026-10-14", "14:00", "15:00"));
    await t.pull();
    t.google.put(CAL, {
      ...timed("g1", "Reunião de equipe", "2026-10-15", "10:00", "11:00"),
      location: "Sala 9",
    });
    await t.pull();
    expect(execs()).toHaveLength(1);
    expect(execs()[0]).toMatchObject({
      title: "Reunião de equipe",
      agenda_date: "2026-10-15",
      start_time: "10:00",
      end_time: "11:00",
      location: "Sala 9",
      due_date: "2026-10-15", // o prazo acompanha o dia
    });
    expect(
      t.fake.rows("agenda_changes").some((c) => c.kind === "moved" && c.note === "google"),
    ).toBe(true);
  });

  it("exclusão no Google apaga no Norte", async () => {
    t.google.put(CAL, timed("g1", "Reunião", "2026-10-14", "14:00", "15:00"));
    await t.pull();
    t.google.remove(CAL, "g1");
    await t.pull();
    expect(execs()).toHaveLength(0);
    expect(links()).toHaveLength(0);
    expect(t.fake.rows("agenda_changes").some((c) => c.kind === "removed")).toBe(true);
  });

  it("evento já excluído que nunca chegou ao Norte é ignorado", async () => {
    t.google.put(CAL, { id: "g9", status: "cancelled" });
    await t.pull();
    expect(execs()).toHaveLength(0);
  });

  it("dia inteiro e vários dias", async () => {
    t.google.put(CAL, {
      id: "a",
      summary: "Feriado",
      status: "confirmed",
      start: { date: "2026-11-02" },
      end: { date: "2026-11-03" },
    });
    t.google.put(CAL, {
      id: "b",
      summary: "Viagem",
      status: "confirmed",
      start: { date: "2026-11-10" },
      end: { date: "2026-11-13" },
    });
    await t.pull();
    const feriado = execs().find((e) => e.title === "Feriado")!;
    expect(feriado).toMatchObject({ all_day: true, agenda_date: "2026-11-02" });
    const viagem = execs().find((e) => e.title === "Viagem")!;
    expect((viagem.agenda_sessions as unknown[]).length).toBe(3);
    const viagemLink = links().find((l) => l.execution_id === viagem.id)!;
    // vários dias: o Norte não representa por inteiro → só leitura
    expect(viagemLink.read_only_reason).toBe("multi_day");
  });

  it("evento que atravessa a meia-noite", async () => {
    t.google.put(CAL, {
      id: "n",
      summary: "Plantão",
      status: "confirmed",
      start: { dateTime: "2026-10-14T23:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-15T01:00:00-03:00", timeZone: SP },
    });
    await t.pull();
    expect(execs()[0]).toMatchObject({
      agenda_date: "2026-10-14",
      start_time: "23:00",
      end_time: "01:00",
    });
  });

  it("converte fusos: evento marcado em Nova York aparece no horário de Brasília", async () => {
    t.google.put(CAL, {
      id: "ny",
      summary: "Call NY",
      status: "confirmed",
      start: { dateTime: "2026-10-14T09:00:00-04:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-10-14T10:00:00-04:00", timeZone: "America/New_York" },
    });
    await t.pull();
    expect(execs()[0]).toMatchObject({
      agenda_date: "2026-10-14",
      start_time: "10:00",
      end_time: "11:00",
    });
  });
});

describe("recorrência vinda do Google", () => {
  const master = (extra: Partial<GoogleEvent> = {}): GoogleEvent => ({
    ...timed("m1", "Academia", "2026-10-12", "18:00", "19:00"),
    recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "EXDATE;TZID=America/Sao_Paulo:20261014T180000"],
    ...extra,
  });

  it("vira uma série no Norte, com regra e exceções", async () => {
    t.google.put(CAL, master());
    await t.pull();
    const [series] = t.fake.rows("agenda_series");
    expect(series).toMatchObject({
      title: "Academia",
      start_date: "2026-10-12",
      start_time: "18:00",
      end_time: "19:00",
      source: "external",
    });
    expect(series.rule).toEqual({ freq: "weekly", interval: 1, byWeekday: [1, 3] });
    expect(t.fake.rows("agenda_series_exceptions").map((e) => e.occurrence_date)).toEqual([
      "2026-10-14",
    ]);
    expect(execs()).toHaveLength(0); // as ocorrências são calculadas, não gravadas
    expect(links()[0]).toMatchObject({ kind: "series", external_event_id: "m1" });
  });

  it("exceção de uma ocorrência (outro horário) vira compromisso ligado à série", async () => {
    t.google.put(CAL, master());
    t.google.put(CAL, {
      id: "m1_20261019",
      summary: "Academia (especial)",
      status: "confirmed",
      recurringEventId: "m1",
      originalStartTime: { dateTime: "2026-10-19T18:00:00-03:00", timeZone: SP },
      start: { dateTime: "2026-10-19T07:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-19T08:00:00-03:00", timeZone: SP },
    });
    await t.pull();
    const [series] = t.fake.rows("agenda_series");
    const [override] = execs();
    expect(override).toMatchObject({
      series_id: series.id,
      series_occurrence_date: "2026-10-19",
      series_overridden: true,
      title: "Academia (especial)",
      agenda_date: "2026-10-19",
      start_time: "07:00",
    });
    expect(links().find((l) => l.kind === "instance")).toMatchObject({
      original_start: "2026-10-19",
    });
  });

  it("ocorrência cancelada vira exceção (removida) e some do Norte", async () => {
    t.google.put(CAL, master());
    await t.pull();
    t.google.put(CAL, {
      id: "m1_20261019",
      status: "cancelled",
      recurringEventId: "m1",
      originalStartTime: { dateTime: "2026-10-19T18:00:00-03:00", timeZone: SP },
    });
    await t.pull();
    expect(
      t.fake
        .rows("agenda_series_exceptions")
        .map((e) => e.occurrence_date)
        .sort(),
    ).toEqual(["2026-10-14", "2026-10-19"]);
  });

  it("exceção que chega antes do mestre ainda é aplicada", async () => {
    t.google.put(CAL, {
      id: "m1_20261019",
      summary: "Academia (especial)",
      status: "confirmed",
      recurringEventId: "m1",
      originalStartTime: { dateTime: "2026-10-19T18:00:00-03:00", timeZone: SP },
      start: { dateTime: "2026-10-19T07:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-19T08:00:00-03:00", timeZone: SP },
    });
    t.google.put(CAL, master());
    await t.pull();
    expect(t.fake.rows("agenda_series")).toHaveLength(1);
    expect(execs()).toHaveLength(1);
  });

  it("mudar a regra no Google atualiza a série", async () => {
    t.google.put(CAL, master());
    await t.pull();
    t.google.put(CAL, master({ recurrence: ["RRULE:FREQ=DAILY;COUNT=5"] }));
    await t.pull();
    expect(t.fake.rows("agenda_series")).toHaveLength(1);
    expect(t.fake.rows("agenda_series")[0].rule).toEqual({ freq: "daily", interval: 1, count: 5 });
    expect(t.fake.rows("agenda_series_exceptions")).toHaveLength(0);
  });

  it("excluir a série no Google apaga a série no Norte", async () => {
    t.google.put(CAL, master());
    await t.pull();
    t.google.remove(CAL, "m1");
    await t.pull();
    expect(t.fake.rows("agenda_series")).toHaveLength(0);
  });

  it("repetição que o Norte não representa entra como um evento somente leitura", async () => {
    t.google.put(CAL, master({ recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=2MO"] }));
    await t.pull();
    expect(t.fake.rows("agenda_series")).toHaveLength(0);
    expect(execs()).toHaveLength(1);
    expect(links()[0].read_only_reason).toBe("recorrencia_nao_suportada");
  });
});

describe("agenda somente leitura", () => {
  it("aparece no Norte, marcada como leitura, e nada é enviado de volta", async () => {
    const ro = t.fake.seed("google_calendars", {
      connection_id: t.conn.id,
      user_id: "user-a",
      google_calendar_id: RO,
      summary: "Feriados",
      access_role: "reader",
      selected: true,
    }) as unknown as Cal;
    t.google.put(RO, {
      id: "f1",
      summary: "Natal",
      status: "confirmed",
      start: { date: "2026-12-25" },
      end: { date: "2026-12-26" },
    });
    await t.pull(ro);
    const link = links().find((l) => l.external_event_id === "f1")!;
    expect(link).toMatchObject({ access_role: "read", read_only_reason: "agenda_somente_leitura" });

    // mesmo que algo mexa na fila, o evento de leitura nunca é enviado
    await t.enqueue("execution", link.execution_id);
    await t.push();
    expect(t.google.callsOf("patch")).toHaveLength(0);
    expect(t.google.callsOf("insert")).toHaveLength(0);
    expect(t.google.callsOf("delete")).toHaveLength(0);
  });

  it("o Google continua mandando nele (sem conflito)", async () => {
    const ro = t.fake.seed("google_calendars", {
      connection_id: t.conn.id,
      user_id: "user-a",
      google_calendar_id: RO,
      summary: "Feriados",
      access_role: "reader",
      selected: true,
    }) as unknown as Cal;
    t.google.put(RO, {
      id: "f1",
      summary: "Natal",
      status: "confirmed",
      start: { date: "2026-12-25" },
      end: { date: "2026-12-26" },
    });
    await t.pull(ro);
    t.google.put(RO, { id: "f1", summary: "Natal (ponto facultativo)" });
    await t.pull(ro);
    expect(execs()[0].title).toBe("Natal (ponto facultativo)");
    expect(links()[0].sync_state).toBe("synced");
  });
});

describe("sincronização incremental", () => {
  it("só pede o que mudou depois da primeira vez", async () => {
    t.google.put(CAL, timed("g1", "A", "2026-10-14", "10:00", "11:00"));
    await t.pull();
    t.google.resetCalls();
    await t.pull();
    expect(t.google.callsOf("listEvents:incremental")).toHaveLength(1);
    expect(t.google.callsOf("listEvents:full")).toHaveLength(0);
    expect(t.fake.rows("google_calendar_sync_state")[0].sync_token).toMatch(/^T/);
  });

  it("token vencido (410) refaz do zero e percebe o que foi apagado", async () => {
    t.google.put(CAL, timed("g1", "Fica", "2026-10-14", "10:00", "11:00"));
    t.google.put(CAL, timed("g2", "Some", "2026-10-15", "10:00", "11:00"));
    await t.pull();
    // g2 some do Google SEM o Norte ver a exclusão (token vai vencer)
    t.google.calendar(CAL).events.delete("g2");
    t.google.expireSyncToken = true;
    await t.pull();
    expect(execs().map((e) => e.title)).toEqual(["Fica"]);
    expect(t.google.callsOf("listEvents:full").length).toBeGreaterThan(0);
  });
});

describe("Norte → Google", () => {
  const createExec = (extra: Record<string, unknown> = {}) =>
    t.fake.seed("executions", {
      user_id: "user-a",
      title: "Dentista",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "15:00",
      end_time: "16:00",
      category: "saude",
      rigid: true,
      weight: "leve",
      location: "Clínica",
      ...extra,
    });

  it("compromisso novo vira evento na agenda escolhida, com horário e fuso", async () => {
    const e = createExec();
    await t.enqueue("execution", e.id);
    await t.push();
    const [ev] = t.google.live(CAL);
    expect(ev).toMatchObject({
      summary: "Dentista",
      location: "Clínica",
      start: { dateTime: "2026-10-14T15:00:00", timeZone: SP },
      end: { dateTime: "2026-10-14T16:00:00", timeZone: SP },
    });
    expect(ev.extendedProperties?.private?.norteId).toBe(e.id);
    expect(links()[0]).toMatchObject({
      execution_id: e.id,
      external_event_id: ev.id,
      origin: "norte",
      kind: "event",
    });
    expect(t.fake.rows("agenda_sync_outbox")).toHaveLength(0);
  });

  it("evento que vira o dia e dia inteiro saem corretos", async () => {
    const night = createExec({ title: "Plantão", start_time: "23:00", end_time: "01:00" });
    const allDay = createExec({
      title: "Aniversário",
      all_day: true,
      start_time: "",
      end_time: null,
    });
    await t.enqueue("execution", night.id);
    await t.enqueue("execution", allDay.id);
    await t.push();
    const byTitle = Object.fromEntries(t.google.live(CAL).map((e) => [e.summary, e]));
    expect(byTitle["Plantão"].end?.dateTime).toBe("2026-10-15T01:00:00");
    expect(byTitle["Aniversário"].start).toEqual({ date: "2026-10-14" });
    expect(byTitle["Aniversário"].end).toEqual({ date: "2026-10-15" });
  });

  it("editar no Norte atualiza o MESMO evento (sem duplicar)", async () => {
    const e = createExec();
    await t.enqueue("execution", e.id);
    await t.push();
    e.start_time = "16:00";
    e.end_time = "17:00";
    e.title = "Dentista (retorno)";
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(1);
    expect(t.google.live(CAL)[0]).toMatchObject({
      summary: "Dentista (retorno)",
      start: { dateTime: "2026-10-14T16:00:00", timeZone: SP },
    });
    expect(t.google.callsOf("insert")).toHaveLength(1);
    expect(t.google.callsOf("patch")).toHaveLength(1);
  });

  it("enviar de novo sem mudança não chama o Google (evita ciclos)", async () => {
    const e = createExec();
    await t.enqueue("execution", e.id);
    await t.push();
    t.google.resetCalls();
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.callsOf("patch")).toHaveLength(0);
    expect(t.google.callsOf("insert")).toHaveLength(0);
  });

  it("o eco do que o Norte enviou não vira mudança quando volta", async () => {
    const e = createExec();
    await t.enqueue("execution", e.id);
    await t.push();
    const before = JSON.stringify(execs()[0]);
    await t.pull();
    expect(JSON.stringify(execs()[0])).toBe(before);
    expect(execs()).toHaveLength(1);
    expect(links()[0].sync_state).toBe("synced");
    // e o contrário: o que veio do Google não é reenviado
    t.google.put(CAL, timed("gx", "Vindo de lá", "2026-10-20", "09:00", "10:00"));
    await t.pull();
    const imported = execs().find((x) => x.title === "Vindo de lá")!;
    await t.enqueue("execution", imported.id);
    t.google.resetCalls();
    await t.push();
    expect(t.google.callsOf("patch")).toHaveLength(0);
    expect(t.google.callsOf("insert")).toHaveLength(0);
  });

  it("cancelar no Norte tira do Google; reabrir recria", async () => {
    const e = createExec();
    await t.enqueue("execution", e.id);
    await t.push();
    e.status = "cancelada";
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(0);
    e.status = "planejada";
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(1);
    expect(links()).toHaveLength(1);
  });

  it("excluir no Norte exclui no Google (pela fila de exclusão)", async () => {
    const e = createExec();
    await t.enqueue("execution", e.id);
    await t.push();
    const snapshot = links().map((l) => ({ ...l }));
    t.fake.rows("executions").splice(0, 1);
    t.fake.rows("agenda_external_links").splice(0);
    await t.enqueue("execution", e.id, "delete");
    t.fake.rows("agenda_sync_outbox").find((r) => r.op === "delete")!.snapshot = snapshot;
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(0);
  });

  it("rotinas do Norte não vão ao Google, a menos que a pessoa peça", async () => {
    const routine = createExec({ title: "Treino A", routine_id: "r1" });
    await t.enqueue("execution", routine.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(0);
    t.ctx.conn.push_routines = true;
    await t.enqueue("execution", routine.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(1);
  });

  it("sem agenda de destino escolhida, avisa em vez de falhar calado", async () => {
    t.cal.push_new_events = false;
    t.fake.rows("google_calendars")[0].push_new_events = false;
    const e = createExec();
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(0);
    expect(t.fake.rows("agenda_sync_outbox")[0].last_error).toMatch(/Escolha uma agenda/);
    expect(t.ctx.stats.precisa_escolher_agenda).toBe(1);
  });

  it("várias sessões viram vários eventos; remover uma sessão remove o evento", async () => {
    const e = createExec({
      agenda_sessions: [
        { id: "s1", date: "2026-10-14", startTime: "09:00", endTime: "10:00" },
        { id: "s2", date: "2026-10-16", startTime: "09:00", endTime: "10:00" },
      ],
    });
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(2);
    e.agenda_sessions = [{ id: "s1", date: "2026-10-14", startTime: "09:00", endTime: "10:00" }];
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(1);
    expect(links()).toHaveLength(1);
  });

  it("recria o vínculo (sem duplicar) se ele se perder, usando o norteId", async () => {
    const e = createExec();
    await t.enqueue("execution", e.id);
    await t.push();
    t.fake.rows("agenda_external_links").splice(0);
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(1);
    expect(links()).toHaveLength(1);
  });
});

describe("séries do Norte no Google", () => {
  const seed = () =>
    t.fake.seed("agenda_series", {
      user_id: "user-a",
      title: "Academia",
      category: "saude",
      start_date: "2026-10-12",
      start_time: "18:00",
      end_time: "19:00",
      rule: { freq: "weekly", interval: 1, byWeekday: [1, 3] },
      all_day: false,
    });

  it("vira um evento mestre com RRULE, e a ocorrência removida vira EXDATE", async () => {
    const s = seed();
    await t.enqueue("series", s.id);
    await t.push();
    const [master] = t.google.live(CAL);
    expect(master.recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"]);
    expect(links()[0]).toMatchObject({ kind: "series", series_id: s.id });

    t.fake.seed("agenda_series_exceptions", {
      user_id: "user-a",
      series_id: s.id,
      occurrence_date: "2026-10-14",
      kind: "removed",
    });
    await t.enqueue("series", s.id);
    await t.push();
    expect(t.google.get(CAL, master.id)?.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
      "EXDATE;TZID=America/Sao_Paulo:20261014T180000",
    ]);
    expect(t.google.live(CAL)).toHaveLength(1);
  });

  it("ocorrência editada vira exceção da série no Google", async () => {
    const s = seed();
    await t.enqueue("series", s.id);
    await t.push();
    const master = t.google.live(CAL)[0];
    // o Google gera a instância (sem alteração)
    t.google.put(CAL, {
      id: `${master.id}_20261019`,
      status: "confirmed",
      summary: "Academia",
      recurringEventId: master.id,
      originalStartTime: { dateTime: "2026-10-19T18:00:00-03:00", timeZone: SP },
      start: { dateTime: "2026-10-19T18:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-19T19:00:00-03:00", timeZone: SP },
    });
    const occurrence = t.fake.seed("executions", {
      user_id: "user-a",
      title: "Academia",
      due_date: "2026-10-19",
      agenda_date: "2026-10-19",
      start_time: "07:00",
      end_time: "08:00",
      series_id: s.id,
      series_occurrence_date: "2026-10-19",
      series_overridden: true,
      category: "saude",
    });
    await t.enqueue("execution", occurrence.id);
    await t.push();
    expect(t.google.get(CAL, `${master.id}_20261019`)?.start).toEqual({
      dateTime: "2026-10-19T07:00:00",
      timeZone: SP,
    });
    expect(links().find((l) => l.kind === "instance")).toMatchObject({
      original_start: "2026-10-19",
    });
  });

  it("cópias ainda intocadas das ocorrências NÃO viram eventos soltos", async () => {
    const s = seed();
    const copy = t.fake.seed("executions", {
      user_id: "user-a",
      title: "Academia",
      due_date: "2026-10-12",
      agenda_date: "2026-10-12",
      start_time: "18:00",
      end_time: "19:00",
      series_id: s.id,
      series_occurrence_date: "2026-10-12",
      series_overridden: false,
      category: "saude",
    });
    await t.enqueue("execution", copy.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(0);
  });

  it("arquivar a série tira o evento mestre do Google", async () => {
    const s = seed();
    await t.enqueue("series", s.id);
    await t.push();
    s.archived_at = "2026-10-13T00:00:00Z";
    await t.enqueue("series", s.id);
    await t.push();
    expect(t.google.live(CAL)).toHaveLength(0);
  });
});

describe("robustez da sincronização", () => {
  const exec = () =>
    t.fake.seed("executions", {
      user_id: "user-a",
      title: "Reunião",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "15:00",
      end_time: "16:00",
      category: "generico",
    });

  it("trocar de 'com hora' para 'dia inteiro' limpa os campos do formato antigo no PATCH", async () => {
    const e = exec();
    await t.enqueue("execution", e.id);
    await t.push();
    e.all_day = true;
    e.start_time = "";
    e.end_time = null;
    await t.enqueue("execution", e.id);
    await t.push();
    const patch = t.google.callsOf("patch")[0].body as {
      start: Record<string, unknown>;
      end: Record<string, unknown>;
    };
    expect(patch.start).toEqual({ date: "2026-10-14", dateTime: null, timeZone: null });
    expect(patch.end).toEqual({ date: "2026-10-15", dateTime: null, timeZone: null });
    // e de volta: o dia inteiro deixa de valer
    e.all_day = false;
    e.start_time = "09:00";
    e.end_time = "10:00";
    await t.enqueue("execution", e.id);
    await t.push();
    const back = t.google.callsOf("patch")[1].body as { start: Record<string, unknown> };
    expect(back.start).toMatchObject({ date: null, dateTime: "2026-10-14T09:00:00" });
  });

  it("evento que falha ao ser aplicado não faz o token avançar: a mudança não se perde", async () => {
    t.google.put(CAL, timed("g1", "Bom", "2026-10-14", "10:00", "11:00"));
    await t.pull();
    const tokenBefore = t.fake.rows("google_calendar_sync_state")[0].sync_token;
    t.google.put(CAL, { ...timed("g2", "Vai falhar", "2026-10-15", "10:00", "11:00") });
    // o banco recusa a criação deste evento
    const original = t.fake.client.from.bind(t.fake.client);
    let failing = true;
    t.fake.client.from = (name: string) => {
      const q = original(name);
      if (name === "executions" && failing) {
        const insert = q.insert.bind(q);
        q.insert = () => {
          throw new Error("falha simulada do banco");
        };
        void insert;
      }
      return q;
    };
    await t.pull();
    expect(t.fake.rows("google_calendar_sync_state")[0].sync_token).toBe(tokenBefore);
    expect(t.ctx.stats.erros).toBe(1);
    // o banco volta ao normal: a próxima rodada recupera o evento
    failing = false;
    await t.pull();
    expect(
      execs()
        .map((x) => x.title)
        .sort(),
    ).toEqual(["Bom", "Vai falhar"]);
  });

  it("sem token do Google, a sincronização completa ainda percebe o que foi apagado", async () => {
    t.google.put(CAL, timed("g1", "Fica", "2026-10-14", "10:00", "11:00"));
    t.google.put(CAL, timed("g2", "Some", "2026-10-15", "10:00", "11:00"));
    // um Google que nunca devolve syncToken
    const real = t.google.api.listEvents;
    t.google.api.listEvents = async (...args: Parameters<typeof real>) => {
      const page = await real(...args);
      return { events: page.events, nextSyncToken: undefined } as never;
    };
    await t.pull();
    t.google.calendar(CAL).events.delete("g2");
    await t.pull();
    expect(execs().map((e) => e.title)).toEqual(["Fica"]);
  });

  it("falha que exige ação não some: fica visível e continua na fila para nova tentativa", async () => {
    const e = exec();
    t.cal.push_new_events = false;
    await t.enqueue("execution", e.id);
    await t.push();
    const queued = t.fake.rows("agenda_sync_outbox")[0];
    expect(queued).toMatchObject({ attempts: 1 });
    expect(queued.failed_at).toBeTruthy();
    expect(queued.next_attempt_at).toBeTruthy();
    expect(t.conn).toMatchObject({ pending_sync_errors: 1 });
    expect(String(t.conn.last_push_error)).toMatch(/Escolha uma agenda/);
  });
});

describe("conflitos: ninguém sobrescreve ninguém em silêncio", () => {
  async function conflicted() {
    const e = t.fake.seed("executions", {
      user_id: "user-a",
      title: "Dentista",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "15:00",
      end_time: "16:00",
      category: "saude",
    });
    await t.enqueue("execution", e.id);
    await t.push();
    const id = t.google.live(CAL)[0].id;
    // os DOIS lados mudam, em coisas diferentes
    e.title = "Dentista (Norte)";
    t.google.put(CAL, { id, summary: "Dentista (Google)" });
    return { e, id };
  }

  it("mudança dos dois lados vira conflito, com os dois conteúdos guardados", async () => {
    const { e, id } = await conflicted();
    await t.pull();
    expect(e.title).toBe("Dentista (Norte)"); // o Norte não foi sobrescrito
    expect(t.google.get(CAL, id)?.summary).toBe("Dentista (Google)"); // nem o Google
    const link = links()[0];
    expect(link.sync_state).toBe("conflict");
    expect((link.remote_snapshot as { title: string }).title).toBe("Dentista (Google)");
    expect((link.local_snapshot as { title: string }).title).toBe("Dentista (Norte)");
    expect(t.ctx.stats.conflitos).toBe(1);
  });

  it("enquanto há conflito, o Norte não empurra por cima", async () => {
    const { e } = await conflicted();
    await t.pull();
    t.google.resetCalls();
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.callsOf("patch")).toHaveLength(0);
  });

  it("escolher o Google aplica a versão do Google ao Norte", async () => {
    const { e } = await conflicted();
    await t.pull();
    await resolveConflict(t.ctx, String(links()[0].id), "google");
    expect(e.title).toBe("Dentista (Google)");
    expect(links()[0]).toMatchObject({ sync_state: "synced", remote_snapshot: null });
  });

  it("escolher o Norte atualiza o Google com a versão do Norte", async () => {
    const { e, id } = await conflicted();
    await t.pull();
    await resolveConflict(t.ctx, String(links()[0].id), "norte");
    expect(t.google.get(CAL, id)?.summary).toBe("Dentista (Norte)");
    expect(e.title).toBe("Dentista (Norte)");
    expect(links()[0].sync_state).toBe("synced");
  });

  it("apagado no Google enquanto o Norte editou: conflito, e a pessoa decide", async () => {
    const e = t.fake.seed("executions", {
      user_id: "user-a",
      title: "Dentista",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "15:00",
      end_time: "16:00",
      category: "saude",
    });
    await t.pull(); // já existe um ponto de sincronização (token)
    await t.enqueue("execution", e.id);
    await t.push();
    await t.pull();
    const id = t.google.live(CAL)[0].id;
    e.title = "Dentista (editado)";
    t.google.remove(CAL, id);
    await t.pull();
    expect(execs()).toHaveLength(1); // não apagou o que a pessoa editou
    expect(links()[0]).toMatchObject({ sync_state: "conflict", remote_deleted: true });
    // manter o Norte recria no Google
    await resolveConflict(t.ctx, String(links()[0].id), "norte");
    expect(t.google.live(CAL)).toHaveLength(1);
    expect(t.google.live(CAL)[0].summary).toBe("Dentista (editado)");
  });

  it("apagado no Google enquanto o Norte editou → escolher o Google apaga no Norte", async () => {
    const e = t.fake.seed("executions", {
      user_id: "user-a",
      title: "Dentista",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "15:00",
      end_time: "16:00",
      category: "saude",
    });
    await t.pull();
    await t.enqueue("execution", e.id);
    await t.push();
    await t.pull();
    e.title = "Dentista (editado)";
    t.google.remove(CAL, t.google.live(CAL)[0].id);
    await t.pull();
    await resolveConflict(t.ctx, String(links()[0].id), "google");
    expect(execs()).toHaveLength(0);
  });

  it("etag velho (412): se só o etag andou, tenta de novo; se o conteúdo mudou, é conflito", async () => {
    const e = t.fake.seed("executions", {
      user_id: "user-a",
      title: "Dentista",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "15:00",
      end_time: "16:00",
      category: "saude",
    });
    await t.enqueue("execution", e.id);
    await t.push();
    const id = t.google.live(CAL)[0].id;
    // 1) só o etag mudou no Google (ex.: alguém aceitou o convite)
    t.google.put(CAL, { id });
    e.title = "Dentista 2";
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.get(CAL, id)?.summary).toBe("Dentista 2");
    expect(links()[0].sync_state).toBe("synced");
    // 2) o conteúdo mudou no Google ANTES de o Norte enviar
    t.google.put(CAL, { id, summary: "Mudou lá" });
    e.title = "Dentista 3";
    await t.enqueue("execution", e.id);
    await t.push();
    expect(t.google.get(CAL, id)?.summary).toBe("Mudou lá");
    expect(links()[0].sync_state).toBe("conflict");
  });
});

describe("sem duplicação na primeira sincronização", () => {
  it("o mesmo compromisso (título, dia e hora) existente nos dois lados é ligado, não duplicado", async () => {
    t.fake.seed("executions", {
      user_id: "user-a",
      title: "Dentista",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "15:00",
      end_time: "16:00",
      category: "saude",
    });
    t.google.put(CAL, timed("g1", "Dentista", "2026-10-14", "15:00", "16:00"));
    await t.pull(t.cal, true);
    expect(execs()).toHaveLength(1);
    expect(links()).toHaveLength(1);
    expect(links()[0].sync_state).toBe("synced");
  });

  it("o backfill coloca na fila só o que já deve ir ao Google", async () => {
    const mk = (extra: Record<string, unknown>) =>
      t.fake.seed("executions", {
        user_id: "user-a",
        title: "x",
        due_date: "2026-10-14",
        agenda_date: "2026-10-14",
        start_time: "10:00",
        category: "generico",
        ...extra,
      });
    mk({ title: "normal" });
    mk({ title: "rotina", routine_id: "r" });
    mk({ title: "cópia de série", series_id: "s", series_overridden: false });
    mk({ title: "cancelado", status: "cancelada" });
    mk({ title: "antigo", agenda_date: "2025-01-01" });
    const queued = await enqueueBackfill(t.ctx);
    expect(queued).toBe(1);
  });
});

describe("isolamento entre pessoas", () => {
  it("sincronizar uma pessoa não toca os dados da outra", async () => {
    // A outra pessoa: conexão, agenda, compromisso e vínculo próprios
    const otherConn = t.fake.seed("google_calendar_connections", {
      user_id: "user-b",
      google_account_id: "sub-b",
      google_email: "b@example.com",
    });
    const otherCal = t.fake.seed("google_calendars", {
      connection_id: otherConn.id,
      user_id: "user-b",
      google_calendar_id: "b@example.com",
      summary: "B",
      access_role: "owner",
      selected: true,
      push_new_events: true,
    });
    const bExec = t.fake.seed("executions", {
      user_id: "user-b",
      title: "Do B",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "10:00",
      category: "generico",
    });
    t.fake.seed("agenda_sync_outbox", {
      user_id: "user-b",
      entity_type: "execution",
      entity_id: bExec.id,
      op: "upsert",
    });

    t.google.put(CAL, timed("g1", "Do A", "2026-10-14", "09:00", "10:00"));
    await t.pull();
    await t.push();

    expect(
      execs()
        .filter((e) => e.user_id === "user-a")
        .map((e) => e.title),
    ).toEqual(["Do A"]);
    expect(execs().find((e) => e.user_id === "user-b")?.title).toBe("Do B");
    expect(links().every((l) => l.user_id === "user-a")).toBe(true);
    // a fila da outra pessoa continua intacta, e nada dela foi enviado
    expect(t.fake.rows("agenda_sync_outbox").filter((r) => r.user_id === "user-b")).toHaveLength(1);
    expect(t.google.live(CAL).find((e) => e.summary === "Do B")).toBeUndefined();
    expect(otherCal.sync_status).toBe("idle");
  });

  it("um evento do Google com norteId de OUTRA pessoa não religa nada dela", async () => {
    const bExec = t.fake.seed("executions", {
      user_id: "user-b",
      title: "Do B",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "10:00",
      category: "generico",
    });
    t.google.put(CAL, {
      ...timed("g1", "Forjado", "2026-10-14", "10:00", "11:00"),
      extendedProperties: { private: { norteId: String(bExec.id) } },
    });
    await t.pull();
    expect(links().some((l) => l.execution_id === bExec.id)).toBe(false);
    expect(execs().filter((e) => e.user_id === "user-a")).toHaveLength(1);
    expect(bExec.title).toBe("Do B");
  });
});
