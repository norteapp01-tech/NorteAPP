import { describe, expect, it } from "vitest";
import { parseHabitPhrase } from "./parse-phrase";

describe("preencher com uma frase", () => {
  it("construir com quantidade e período", () => {
    expect(parseHabitPhrase("Quero ler 50 páginas por semana")).toMatchObject({
      name: "Ler",
      intent: "build",
      measure: "quantity",
      unit: "páginas",
      value: 50,
      period: "week",
    });
    expect(parseHabitPhrase("beber 2,5 litros de água por dia")).toMatchObject({
      unit: "L",
      value: 2.5,
      period: "day",
      intent: "build",
    });
  });
  it("duração", () => {
    expect(parseHabitPhrase("meditar 10 minutos todo dia")).toMatchObject({
      name: "Meditar",
      measure: "duration",
      unit: "min",
      value: 10,
      period: "day",
    });
  });
  it("reduzir e abandonar", () => {
    expect(parseHabitPhrase("reduzir café a 2 por dia")).toMatchObject({
      intent: "limit",
      value: 2,
      measure: "count",
      period: "day",
    });
    expect(parseHabitPhrase("parar de fumar")).toMatchObject({
      intent: "quit",
      value: 0,
      name: "Fumar",
    });
  });
  it("sem número vira 'feito / não feito'", () => {
    expect(parseHabitPhrase("orar todo dia")).toMatchObject({
      name: "Orar",
      measure: "binary",
      value: 1,
      period: "day",
    });
  });
  it("frase vazia ou sem assunto não inventa nada", () => {
    expect(parseHabitPhrase("")).toBeNull();
    expect(parseHabitPhrase("50 páginas por semana")).toBeNull();
  });
});
