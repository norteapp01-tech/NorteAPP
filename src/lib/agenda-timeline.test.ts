import { describe, it, expect } from "vitest";

import { spanForDay } from "./agenda-timeline";

// ---------------------------------------------------------------------------
// Posição dos compromissos na linha do tempo de 00:00 a 24:00.
//
// Tudo em minutos desde a meia-noite: a agenda ia das 07:00 às 22:00, então
// quem treina, trabalha ou estuda de madrugada não tinha onde aparecer.
// ---------------------------------------------------------------------------

describe("spanForDay — parte principal", () => {
  it("horários de madrugada caem nos minutos certos", () => {
    expect(spanForDay("00:30", "01:30", "principal")).toEqual({ start: 30, end: 90 });
    expect(spanForDay("02:00", "03:00", "principal")).toEqual({ start: 120, end: 180 });
    expect(spanForDay("05:45", "06:30", "principal")).toEqual({ start: 345, end: 390 });
  });

  it("horários do dia e da noite também", () => {
    expect(spanForDay("11:00", "12:00", "principal")).toEqual({ start: 660, end: 720 });
    expect(spanForDay("22:30", "23:00", "principal")).toEqual({ start: 1350, end: 1380 });
    expect(spanForDay("23:50", "23:59", "principal")).toEqual({ start: 1430, end: 1439 });
  });

  it("evento que termina exatamente em 24:00 fecha no fim do dia", () => {
    // "24:00" e "00:00" significam o mesmo instante; o fim vira 1440.
    expect(spanForDay("23:00", "24:00", "principal")).toEqual({ start: 1380, end: 1440 });
    expect(spanForDay("23:00", "00:00", "principal")).toEqual({ start: 1380, end: 1440 });
  });

  it("sem hora de fim, assume uma hora — sem altura negativa", () => {
    const span = spanForDay("21:00", undefined, "principal")!;
    expect(span).toEqual({ start: 1260, end: 1320 });
    expect(span.end).toBeGreaterThan(span.start);
  });

  it("evento que atravessa a meia-noite é cortado em 24:00 no primeiro dia", () => {
    const span = spanForDay("23:00", "01:00", "principal")!;
    expect(span).toEqual({ start: 1380, end: 1440 });
    expect(span.end).toBeGreaterThan(span.start);
  });

  it("compromisso sem horário nenhum não vira bloco", () => {
    expect(spanForDay(undefined, "10:00", "principal")).toBeNull();
  });

  it("fim igual ao início é lido como virada de dia, fechando em 24:00", () => {
    expect(spanForDay("08:00", "08:00", "principal")!.end).toBe(1440);
  });

  it("nenhum bloco ultrapassa o fim do dia", () => {
    for (const [a, b] of [
      ["23:50", "23:59"],
      ["23:30", "24:00"],
      ["00:05", "00:10"],
    ] as const) {
      const span = spanForDay(a, b, "principal")!;
      expect(span.end).toBeLessThanOrEqual(1440);
      expect(span.start).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("spanForDay — continuação no dia seguinte", () => {
  it("a parte depois da meia-noite começa em 00:00", () => {
    expect(spanForDay("23:00", "01:00", "continuacao")).toEqual({ start: 0, end: 60 });
    expect(spanForDay("22:00", "02:30", "continuacao")).toEqual({ start: 0, end: 150 });
  });

  it("evento que não atravessa não deixa continuação", () => {
    expect(spanForDay("08:00", "09:00", "continuacao")).toBeNull();
    expect(spanForDay("23:50", "23:59", "continuacao")).toBeNull();
  });

  it("evento que termina em 24:00 não gera continuação vazia no dia seguinte", () => {
    expect(spanForDay("23:00", "24:00", "continuacao")).toBeNull();
    expect(spanForDay("23:00", "00:00", "continuacao")).toBeNull();
  });
});
