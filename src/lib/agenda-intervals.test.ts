import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  conflictingIds,
  crossesMidnight,
  dayLoad,
  durationMinutes,
  eventInterval,
  findConflicts,
  layoutColumns,
  mergeIntervals,
  suggestFreeSlots,
  type Conflictable,
} from "./agenda-intervals";

const ev = (
  id: string,
  startTime: string,
  endTime: string,
  extra: Partial<Conflictable> = {},
): Conflictable => ({ id, title: id, date: "2026-10-12", startTime, endTime, ...extra });

describe("tempo ocupado e livre do dia", () => {
  it("dia vazio: tudo livre", () => {
    const load = dayLoad([], "2026-10-12");
    expect(load.busy).toBe(0);
    expect(load.free).toBe(1440);
  });

  it("dois eventos sem conflito somam as duas durações", () => {
    const load = dayLoad([ev("a", "09:00", "10:00"), ev("b", "14:00", "15:30")], "2026-10-12");
    expect(load.busy).toBe(150);
    expect(load.free).toBe(1440 - 150);
  });

  it("dois eventos parcialmente sobrepostos não contam o mesmo minuto duas vezes", () => {
    const load = dayLoad([ev("a", "09:00", "11:00"), ev("b", "10:00", "12:00")], "2026-10-12");
    expect(load.busy).toBe(180);
    expect(load.blocks).toEqual([{ start: 540, end: 720 }]);
  });

  it("evento totalmente dentro de outro", () => {
    const load = dayLoad([ev("a", "09:00", "13:00"), ev("b", "10:00", "11:00")], "2026-10-12");
    expect(load.busy).toBe(240);
  });

  it("três eventos encadeados formam um bloco só", () => {
    const load = dayLoad(
      [ev("a", "09:00", "10:30"), ev("b", "10:00", "11:30"), ev("c", "11:00", "12:00")],
      "2026-10-12",
    );
    expect(load.busy).toBe(180);
    expect(load.blocks).toHaveLength(1);
  });

  it("evento que atravessa a meia-noite conta só a parte do dia consultado", () => {
    const night = ev("n", "23:00", "01:00");
    expect(dayLoad([night], "2026-10-12").busy).toBe(60);
    expect(dayLoad([night], "2026-10-13").busy).toBe(60);
  });

  it("continuação do dia anterior entra no começo do dia seguinte", () => {
    const yesterday = ev("n", "22:00", "02:00", { date: "2026-10-11" });
    const load = dayLoad([yesterday, ev("b", "01:00", "03:00")], "2026-10-12");
    // 00:00–02:00 (continuação) unido a 01:00–03:00 = 00:00–03:00
    expect(load.busy).toBe(180);
    expect(load.timedCount).toBe(2);
  });

  it("evento que termina à meia-noite não vaza para o dia seguinte", () => {
    const e = ev("n", "22:30", "00:00");
    expect(dayLoad([e], "2026-10-12").busy).toBe(90);
    expect(dayLoad([e], "2026-10-13").busy).toBe(0);
  });

  it("cancelado e reagendado não ocupam tempo", () => {
    const load = dayLoad(
      [
        ev("a", "09:00", "10:00", { status: "cancelada" }),
        ev("b", "11:00", "12:00", { status: "reagendada" }),
        ev("c", "13:00", "14:00", { status: "planejada" }),
      ],
      "2026-10-12",
    );
    expect(load.busy).toBe(60);
  });

  it("sem horário ou dia inteiro contam à parte", () => {
    const load = dayLoad(
      [
        { id: "x", title: "x", date: "2026-10-12" },
        { id: "y", title: "y", date: "2026-10-12", allDay: true },
        ev("c", "13:00", "14:00"),
      ],
      "2026-10-12",
    );
    expect(load.untimedCount).toBe(2);
    expect(load.busy).toBe(60);
  });
});

describe("duração e meia-noite", () => {
  it("23:00–01:00 dura 2h e atravessa a meia-noite", () => {
    expect(durationMinutes("23:00", "01:00")).toBe(120);
    expect(crossesMidnight("23:00", "01:00")).toBe(true);
  });
  it("22:30–00:00 dura 90 min e não é 'virada' adicional", () => {
    expect(durationMinutes("22:30", "00:00")).toBe(90);
    expect(crossesMidnight("22:30", "00:00")).toBe(false);
  });
  it("00:00–02:00 dura 2h", () => {
    expect(durationMinutes("00:00", "02:00")).toBe(120);
    expect(crossesMidnight("00:00", "02:00")).toBe(false);
  });
  it("nunca dá duração negativa", () => {
    expect(durationMinutes("10:00", "10:00")).toBeGreaterThan(0);
  });
  it("sem fim assume uma hora", () => {
    expect(eventInterval({ date: "2026-10-12", startTime: "10:00" })!.end).toBe(
      eventInterval({ date: "2026-10-12", startTime: "11:00" })!.start,
    );
  });
});

describe("mergeIntervals", () => {
  it("une intervalos que se tocam", () => {
    expect(
      mergeIntervals([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 30, end: 40 },
      ]),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ]);
  });
});

describe("conflitos", () => {
  const list = [ev("a", "09:00", "10:00"), ev("b", "09:30", "10:30"), ev("c", "12:00", "13:00")];

  it("encontra quem se sobrepõe ao candidato", () => {
    const found = findConflicts({ date: "2026-10-12", startTime: "09:45", endTime: "10:15" }, list);
    expect(found.map((f) => f.id).sort()).toEqual(["a", "b"]);
  });

  it("ignora o próprio compromisso e os cancelados", () => {
    const withCancelled = [...list, ev("d", "09:00", "10:00", { status: "cancelada" })];
    const found = findConflicts(
      { date: "2026-10-12", startTime: "09:00", endTime: "10:00" },
      withCancelled,
      "a",
    );
    expect(found.map((f) => f.id)).toEqual(["b"]);
  });

  it("conflictingIds marca os dois lados e deixa o isolado em paz", () => {
    expect([...conflictingIds(list)].sort()).toEqual(["a", "b"]);
  });

  it("compromissos colados (fim = início) não conflitam", () => {
    expect(conflictingIds([ev("a", "09:00", "10:00"), ev("b", "10:00", "11:00")]).size).toBe(0);
  });
});

describe("layout de sobreposição", () => {
  it("dois eventos simultâneos ficam lado a lado", () => {
    const out = layoutColumns([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 540, end: 600 },
    ]);
    expect(out.map((o) => o.columns)).toEqual([2, 2]);
    expect(new Set(out.map((o) => o.column))).toEqual(new Set([0, 1]));
  });

  it("evento sem vizinhos ocupa a largura toda", () => {
    expect(layoutColumns([{ id: "a", start: 60, end: 120 }])).toEqual([
      { id: "a", column: 0, columns: 1 },
    ]);
  });

  it("reaproveita a coluna quando o primeiro já terminou", () => {
    const out = layoutColumns([
      { id: "a", start: 0, end: 120 },
      { id: "b", start: 30, end: 90 },
      { id: "c", start: 100, end: 180 },
    ]);
    const byId = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(byId.a.columns).toBe(2);
    expect(byId.c.column).toBe(1);
  });

  it("blocos curtos e seguidos não se pisam por causa da altura mínima", () => {
    const out = layoutColumns([
      { id: "a", start: 600, end: 610 },
      { id: "b", start: 615, end: 630 },
    ]);
    expect(out.every((o) => o.columns === 2)).toBe(true);
  });

  it("grupos separados não dividem a largura entre si", () => {
    const out = layoutColumns([
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 0, end: 60 },
      { id: "c", start: 300, end: 360 },
    ]);
    expect(out.find((o) => o.id === "c")!.columns).toBe(1);
  });
});

describe("horários livres", () => {
  it("sugere o primeiro intervalo livre depois do compromisso", () => {
    const slots = suggestFreeSlots({
      date: "2026-10-12",
      duration: 60,
      items: [ev("a", "07:00", "09:00")],
      windowStart: "07:00",
      windowEnd: "22:00",
      limit: 1,
    });
    expect(slots[0]).toEqual({ date: "2026-10-12", start: "09:00", end: "10:00" });
  });

  it("respeita a duração necessária", () => {
    const slots = suggestFreeSlots({
      date: "2026-10-12",
      duration: 120,
      items: [ev("a", "07:00", "09:00"), ev("b", "10:00", "22:00")],
      limit: 1,
    });
    // O vão 09:00–10:00 é curto demais: vai para o dia seguinte.
    expect(slots[0].date).toBe("2026-10-13");
  });

  it("não sugere antes de agora", () => {
    const slots = suggestFreeSlots({
      date: "2026-10-12",
      duration: 30,
      items: [],
      notBeforeMinute: 12 * 60 + 5,
      limit: 1,
    });
    expect(slots[0].start).toBe("12:15");
  });

  it("não passa do prazo", () => {
    const slots = suggestFreeSlots({
      date: "2026-10-12",
      duration: 60,
      items: [ev("a", "07:00", "22:00")],
      lastDate: "2026-10-12",
    });
    expect(slots).toEqual([]);
  });

  it("addDaysISO atravessa mês e ano", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });
});
