import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  dateAndTimeInZone,
  zonedTimeToUtc,
} from "../../../supabase/functions/_shared/google/time.ts";
import {
  formatRecurrence,
  parseRecurrence,
} from "../../../supabase/functions/_shared/google/rrule.ts";
import {
  contentHash,
  executionToNormal,
  googleToNormal,
  normalHash,
  normalToGoogle,
  seriesToNormal,
  sessionsOfExecution,
  type GoogleEvent,
} from "../../../supabase/functions/_shared/google/mapping.ts";

const SP = "America/Sao_Paulo";

describe("tempo e fusos", () => {
  it("converte hora local de um fuso para o instante certo", () => {
    // São Paulo é UTC-3 (sem horário de verão desde 2019)
    expect(zonedTimeToUtc("2026-10-12", "14:00", SP).toISOString()).toBe(
      "2026-10-12T17:00:00.000Z",
    );
    expect(zonedTimeToUtc("2026-07-01", "09:30", "America/New_York").toISOString()).toBe(
      "2026-07-01T13:30:00.000Z",
    );
  });
  it("lê um instante no fuso pedido, mudando o dia quando preciso", () => {
    expect(dateAndTimeInZone(new Date("2026-10-13T02:30:00Z"), SP)).toEqual({
      date: "2026-10-12",
      time: "23:30",
    });
  });
  it("soma dias atravessando mês e ano", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("recorrência: RRULE ↔ regra do Norte", () => {
  const ctx = { startDate: "2026-10-12", zone: SP };

  it("semanal com dias, intervalo e fim por data", () => {
    const r = parseRecurrence(
      ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T235959Z"],
      ctx,
    );
    expect(r.rule).toEqual({ freq: "weekly", interval: 2, byWeekday: [1, 3], until: "2026-12-31" });
    expect(r.unsupported).toBeUndefined();
  });

  it("diária com contagem, mensal e anual", () => {
    expect(parseRecurrence(["RRULE:FREQ=DAILY;COUNT=5"], ctx).rule).toEqual({
      freq: "daily",
      interval: 1,
      count: 5,
    });
    expect(parseRecurrence(["RRULE:FREQ=MONTHLY;BYMONTHDAY=15"], ctx).rule).toMatchObject({
      freq: "monthly",
      byMonthDay: 15,
    });
    expect(parseRecurrence(["RRULE:FREQ=YEARLY"], ctx).rule).toMatchObject({ freq: "yearly" });
  });

  it("lê as datas excluídas (EXDATE) com hora, em UTC e dia inteiro", () => {
    const r = parseRecurrence(
      [
        "RRULE:FREQ=DAILY",
        "EXDATE;TZID=America/Sao_Paulo:20261014T090000,20261015T090000",
        "EXDATE:20261017T120000Z",
        "EXDATE;VALUE=DATE:20261020",
      ],
      ctx,
    );
    expect(r.exdates).toEqual(["2026-10-14", "2026-10-15", "2026-10-17", "2026-10-20"]);
  });

  it("o que o Norte não representa NÃO é adivinhado", () => {
    for (const line of [
      "RRULE:FREQ=MONTHLY;BYDAY=2TU",
      "RRULE:FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO",
      "RRULE:FREQ=HOURLY",
      "RRULE:FREQ=MONTHLY;BYMONTHDAY=-1",
    ]) {
      const r = parseRecurrence([line], ctx);
      expect(r.rule).toBeNull();
      expect(r.unsupported).toBeTruthy();
    }
    expect(parseRecurrence(["RDATE:20261012T090000Z"], ctx).unsupported).toBeTruthy();
  });

  it("formata a regra de volta, com UNTIL do tipo certo", () => {
    expect(
      formatRecurrence({
        rule: { freq: "weekly", interval: 1, byWeekday: [1, 3] },
        startDate: "2026-10-12",
        startTime: "09:00",
        allDay: false,
        zone: SP,
        exdates: ["2026-10-14"],
      }),
    ).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "EXDATE;TZID=America/Sao_Paulo:20261014T090000"]);
    expect(
      formatRecurrence({
        rule: { freq: "daily", interval: 1, until: "2026-10-20" },
        startDate: "2026-10-12",
        allDay: true,
        zone: SP,
        exdates: ["2026-10-14"],
      }),
    ).toEqual(["RRULE:FREQ=DAILY;UNTIL=20261020", "EXDATE;VALUE=DATE:20261014"]);
    // hora marcada → UNTIL em UTC (09:00 em SP = 12:00Z)
    expect(
      formatRecurrence({
        rule: { freq: "daily", interval: 1, until: "2026-10-20" },
        startDate: "2026-10-12",
        startTime: "09:00",
        allDay: false,
        zone: SP,
      })[0],
    ).toBe("RRULE:FREQ=DAILY;UNTIL=20261020T120000Z");
  });

  it("ida e volta preserva a regra", () => {
    const rule = { freq: "weekly" as const, interval: 2, byWeekday: [2, 4], count: 6 };
    const lines = formatRecurrence({
      rule,
      startDate: "2026-10-13",
      startTime: "10:00",
      allDay: false,
      zone: SP,
    });
    expect(parseRecurrence(lines, { startDate: "2026-10-13", zone: SP }).rule).toEqual(rule);
  });

  it("evento em outro fuso: o BYDAY acompanha o dia que muda", () => {
    // Segunda 23:00 em Los Angeles = terça 03:00 em São Paulo (UTC-7/-3 em outubro)
    const ev: GoogleEvent = {
      id: "r1",
      summary: "Standup",
      start: { dateTime: "2026-10-12T23:00:00-07:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-10-12T23:30:00-07:00", timeZone: "America/Los_Angeles" },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
    };
    const { normal } = googleToNormal(ev, SP);
    expect(normal.startDate).toBe("2026-10-13");
    expect(normal.startTime).toBe("03:00");
    expect(normal.rule?.byWeekday).toEqual([2]);
  });
});

describe("Google → Norte", () => {
  it("evento com hora, fuso e Meet", () => {
    const { normal, sessions, multiDay } = googleToNormal(
      {
        id: "e1",
        summary: "Reunião",
        location: "Sala 3",
        description: " Pauta ",
        start: { dateTime: "2026-10-12T14:00:00-03:00", timeZone: SP },
        end: { dateTime: "2026-10-12T15:30:00-03:00", timeZone: SP },
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      },
      SP,
    );
    expect(normal).toMatchObject({
      title: "Reunião",
      allDay: false,
      startDate: "2026-10-12",
      startTime: "14:00",
      endDate: "2026-10-12",
      endTime: "15:30",
      location: "Sala 3",
      notes: "Pauta",
      link: "https://meet.google.com/abc-defg-hij",
    });
    expect(sessions).toEqual([{ date: "2026-10-12", start: "14:00", end: "15:30" }]);
    expect(multiDay).toBe(false);
  });

  it("converte do fuso do evento para o do Norte", () => {
    const { normal } = googleToNormal(
      {
        id: "e1",
        summary: "Call",
        start: { dateTime: "2026-10-12T09:00:00-04:00", timeZone: "America/New_York" },
        end: { dateTime: "2026-10-12T10:00:00-04:00", timeZone: "America/New_York" },
      },
      SP,
    );
    expect(normal.startTime).toBe("10:00"); // NY (UTC-4) → SP (UTC-3)
  });

  it("dia inteiro: o fim exclusivo do Google vira inclusivo", () => {
    const one = googleToNormal(
      { id: "a", summary: "Feriado", start: { date: "2026-11-02" }, end: { date: "2026-11-03" } },
      SP,
    );
    expect(one.normal).toMatchObject({
      allDay: true,
      startDate: "2026-11-02",
      endDate: "2026-11-02",
    });
    expect(one.multiDay).toBe(false);
    expect(one.sessions).toEqual([{ date: "2026-11-02", start: "", end: null }]);

    const three = googleToNormal(
      { id: "b", summary: "Viagem", start: { date: "2026-11-02" }, end: { date: "2026-11-05" } },
      SP,
    );
    expect(three.multiDay).toBe(true);
    expect(three.sessions.map((s) => s.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });

  it("evento que atravessa a meia-noite continua sendo UMA sessão", () => {
    const { sessions, multiDay, normal } = googleToNormal(
      {
        id: "n",
        summary: "Plantão",
        start: { dateTime: "2026-10-12T23:00:00-03:00", timeZone: SP },
        end: { dateTime: "2026-10-13T01:00:00-03:00", timeZone: SP },
      },
      SP,
    );
    expect(multiDay).toBe(false);
    expect(sessions).toEqual([{ date: "2026-10-12", start: "23:00", end: "01:00" }]);
    expect(normal.endDate).toBe("2026-10-13");
  });

  it("evento de mais de 24 horas vira uma sessão por dia", () => {
    const { sessions, multiDay } = googleToNormal(
      {
        id: "m",
        summary: "Congresso",
        start: { dateTime: "2026-10-12T20:00:00-03:00", timeZone: SP },
        end: { dateTime: "2026-10-14T10:00:00-03:00", timeZone: SP },
      },
      SP,
    );
    expect(multiDay).toBe(true);
    expect(sessions).toEqual([
      { date: "2026-10-12", start: "20:00", end: "00:00" },
      { date: "2026-10-13", start: "00:00", end: "00:00" },
      { date: "2026-10-14", start: "00:00", end: "10:00" },
    ]);
  });

  it("cancelado vem marcado, mesmo sem horário", () => {
    const { normal, sessions } = googleToNormal({ id: "x", status: "cancelled" }, SP);
    expect(normal.cancelled).toBe(true);
    expect(sessions).toEqual([]);
  });

  it("recorrência não suportada é avisada", () => {
    const r = googleToNormal(
      {
        id: "u",
        summary: "Mensal",
        start: { dateTime: "2026-10-12T09:00:00-03:00", timeZone: SP },
        end: { dateTime: "2026-10-12T10:00:00-03:00", timeZone: SP },
        recurrence: ["RRULE:FREQ=MONTHLY;BYDAY=2MO"],
      },
      SP,
    );
    expect(r.unsupported).toBeTruthy();
    expect(r.normal.rule).toBeNull();
  });
});

describe("Norte → Google", () => {
  const row = {
    title: "Dentista",
    location: "Clínica",
    notes: "Levar exames",
    link: "https://meet.example/x",
    status: "planejada",
    all_day: false,
  };

  it("compromisso com hora", () => {
    const n = executionToNormal(row, { date: "2026-10-12", start: "14:00", end: "15:00" });
    const g = normalToGoogle(n, SP, { norteId: "abc" });
    expect(g.start).toEqual({ dateTime: "2026-10-12T14:00:00", timeZone: SP });
    expect(g.end).toEqual({ dateTime: "2026-10-12T15:00:00", timeZone: SP });
    expect(g.location).toBe("Clínica");
    expect(g.source?.url).toBe("https://meet.example/x");
    expect(g.extendedProperties?.private.norteId).toBe("abc");
  });

  it("23:00–01:00 termina no dia seguinte; 22:30–00:00 também", () => {
    const night = normalToGoogle(
      executionToNormal(row, { date: "2026-10-12", start: "23:00", end: "01:00" }),
      SP,
    );
    expect(night.end.dateTime).toBe("2026-10-13T01:00:00");
    const midnight = normalToGoogle(
      executionToNormal(row, { date: "2026-10-12", start: "22:30", end: "00:00" }),
      SP,
    );
    expect(midnight.end.dateTime).toBe("2026-10-13T00:00:00");
    const early = normalToGoogle(
      executionToNormal(row, { date: "2026-10-12", start: "00:00", end: "02:00" }),
      SP,
    );
    expect(early.end.dateTime).toBe("2026-10-12T02:00:00");
  });

  it("dia inteiro usa fim exclusivo", () => {
    const n = executionToNormal(
      { ...row, all_day: true },
      { date: "2026-11-02", start: "", end: null },
    );
    const g = normalToGoogle(n, SP);
    expect(g.start).toEqual({ date: "2026-11-02" });
    expect(g.end).toEqual({ date: "2026-11-03" });
  });

  it("sem fim = uma hora", () => {
    const n = executionToNormal(row, { date: "2026-10-12", start: "10:00", end: null });
    expect(n.endTime).toBe("11:00");
  });

  it("série vira evento mestre com RRULE e EXDATE", () => {
    const n = seriesToNormal(
      {
        title: "Academia",
        start_date: "2026-10-12",
        start_time: "18:00",
        end_time: "19:00",
        all_day: false,
        rule: { freq: "weekly", interval: 1, byWeekday: [1, 3] },
      },
      ["2026-10-14"],
    );
    const g = normalToGoogle(n, SP, { norteId: "s1", norteKind: "series" });
    expect(g.recurrence).toEqual([
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
      "EXDATE;TZID=America/Sao_Paulo:20261014T180000",
    ]);
  });

  it("sessões: várias, legada ou nenhuma", () => {
    expect(
      sessionsOfExecution({
        agenda_sessions: [
          { id: "s1", date: "2026-10-12", startTime: "09:00", endTime: "10:00" },
          { id: "s2", date: "2026-10-13", startTime: "09:00" },
        ],
      }).map((s) => s.key),
    ).toEqual(["s1", "s2"]);
    expect(
      sessionsOfExecution({
        id: "e1",
        agenda_date: "2026-10-12",
        start_time: "09:00",
        end_time: "10:00",
      })[0].key,
    ).toBe("legacy-e1");
    expect(sessionsOfExecution({})).toEqual([]);
  });
});

describe("hash e ida e volta", () => {
  it("ida e volta Norte → Google → Norte mantém o hash (é o que evita ciclos)", () => {
    const original = executionToNormal(
      { title: "Dentista", location: "Clínica", notes: "x", link: null, status: "planejada" },
      { date: "2026-10-12", start: "23:00", end: "01:00" },
    );
    const payload = normalToGoogle(original, SP);
    const back = googleToNormal(
      {
        id: "g1",
        summary: payload.summary,
        description: payload.description,
        location: payload.location,
        start: { dateTime: `${payload.start.dateTime}-03:00`, timeZone: SP },
        end: { dateTime: `${payload.end.dateTime}-03:00`, timeZone: SP },
      },
      SP,
    ).normal;
    expect(normalHash(back)).toBe(normalHash(original));
  });

  it("muda quando muda o conteúdo, ignora espaços nas pontas", () => {
    const a = executionToNormal(
      { title: "A", status: "planejada" },
      { date: "2026-10-12", start: "10:00", end: "11:00" },
    );
    const b = { ...a, title: " A " };
    const c = { ...a, location: "Sala" };
    expect(normalHash(a)).toBe(normalHash(b));
    expect(normalHash(a)).not.toBe(normalHash(c));
    expect(contentHash({ a: 1 })).toBe(contentHash({ a: 1 }));
  });
});
