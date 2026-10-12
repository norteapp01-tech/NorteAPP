import { describe, expect, it } from "vitest";
import {
  countBefore,
  describeRule,
  expandRule,
  nextOccurrence,
  presetRules,
  splitSeries,
  weekdayOf,
} from "./agenda-recurrence";

// 2026-10-12 é uma segunda-feira.
const MON = "2026-10-12";

describe("expandRule", () => {
  it("diariamente", () => {
    expect(expandRule({ freq: "daily", interval: 1 }, MON, MON, "2026-10-15")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
    ]);
  });

  it("a cada 3 dias", () => {
    expect(expandRule({ freq: "daily", interval: 3 }, MON, MON, "2026-10-20")).toEqual([
      "2026-10-12",
      "2026-10-15",
      "2026-10-18",
    ]);
  });

  it("semanalmente repete o dia da semana do início", () => {
    expect(expandRule({ freq: "weekly", interval: 1 }, MON, MON, "2026-10-27")).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
  });

  it("dias específicos da semana", () => {
    const dates = expandRule(
      { freq: "weekly", interval: 1, byWeekday: [1, 3, 5] },
      MON,
      MON,
      "2026-10-18",
    );
    expect(dates).toEqual(["2026-10-12", "2026-10-14", "2026-10-16"]);
    expect(dates.map(weekdayOf)).toEqual([1, 3, 5]);
  });

  it("a cada duas semanas mantém a paridade, mesmo consultando depois", () => {
    const rule = { freq: "weekly" as const, interval: 2, byWeekday: [1] };
    expect(expandRule(rule, MON, "2026-11-01", "2026-11-30")).toEqual(["2026-11-09", "2026-11-23"]);
  });

  it("não gera nada antes do início, mesmo com dia da semana anterior na primeira semana", () => {
    // Início numa quarta; segunda e terça da mesma semana ficam de fora.
    const dates = expandRule(
      { freq: "weekly", interval: 1, byWeekday: [1, 2, 3] },
      "2026-10-14",
      "2026-10-01",
      "2026-10-21",
    );
    expect(dates).toEqual(["2026-10-14", "2026-10-19", "2026-10-20", "2026-10-21"]);
  });

  it("mensalmente repete o dia do mês", () => {
    expect(
      expandRule({ freq: "monthly", interval: 1 }, "2026-01-15", "2026-01-01", "2026-04-30"),
    ).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("dia 31 usa o último dia dos meses curtos", () => {
    expect(
      expandRule({ freq: "monthly", interval: 1 }, "2026-01-31", "2026-01-01", "2026-04-30"),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("anualmente; 29 de fevereiro cai em 28 nos anos comuns", () => {
    expect(
      expandRule({ freq: "yearly", interval: 1 }, "2024-02-29", "2024-01-01", "2026-12-31"),
    ).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
  });

  it("até uma data (inclusive)", () => {
    expect(
      expandRule({ freq: "daily", interval: 1, until: "2026-10-14" }, MON, MON, "2026-12-31"),
    ).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
  });

  it("por quantidade de ocorrências, contadas desde o início", () => {
    const rule = { freq: "weekly" as const, interval: 1, count: 3 };
    expect(expandRule(rule, MON, MON, "2027-01-01")).toHaveLength(3);
    // Consultar só o fim não pode 'renovar' a contagem.
    expect(expandRule(rule, MON, "2026-10-20", "2027-01-01")).toEqual(["2026-10-26"]);
  });

  it("sem fim, limitado pela janela consultada", () => {
    expect(
      expandRule({ freq: "daily", interval: 1 }, MON, "2030-01-01", "2030-01-03"),
    ).toHaveLength(3);
  });

  it("janela antes do início devolve vazio", () => {
    expect(expandRule({ freq: "daily", interval: 1 }, MON, "2026-01-01", "2026-01-31")).toEqual([]);
  });
});

describe("séries divididas e contagem", () => {
  it("countBefore conta as ocorrências anteriores", () => {
    expect(countBefore({ freq: "weekly", interval: 1 }, MON, "2026-11-02")).toBe(3);
    expect(countBefore({ freq: "weekly", interval: 1 }, MON, MON)).toBe(0);
  });

  it("splitSeries: a antiga termina na véspera e a nova herda o resto da contagem", () => {
    const { oldRule, newRule } = splitSeries(
      { startDate: MON, rule: { freq: "weekly", interval: 1, count: 6 } },
      "2026-11-02",
    );
    expect(oldRule.until).toBe("2026-11-01");
    expect(oldRule.count).toBe(3);
    expect(newRule.count).toBe(3);
    expect(expandRule(oldRule, MON, MON, "2027-12-31")).toHaveLength(3);
    expect(expandRule(newRule, "2026-11-02", "2026-11-02", "2027-12-31")).toHaveLength(3);
  });

  it("splitSeries em série sem fim só encerra a antiga", () => {
    const { oldRule, newRule } = splitSeries(
      { startDate: MON, rule: { freq: "daily", interval: 1 } },
      "2026-10-20",
    );
    expect(oldRule.until).toBe("2026-10-19");
    expect(oldRule.count).toBeUndefined();
    expect(newRule.until).toBeUndefined();
  });

  it("nextOccurrence", () => {
    expect(nextOccurrence({ freq: "weekly", interval: 1 }, MON, MON)).toBe("2026-10-19");
    expect(nextOccurrence({ freq: "daily", interval: 1, until: MON }, MON, MON)).toBeNull();
  });
});

describe("texto", () => {
  it("descreve regras", () => {
    expect(describeRule({ freq: "daily", interval: 1 })).toBe("Todos os dias");
    expect(describeRule({ freq: "weekly", interval: 2, byWeekday: [1] })).toBe(
      "A cada 2 semanas (seg)",
    );
    expect(describeRule({ freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] })).toBe(
      "Toda semana (dias úteis)",
    );
    expect(describeRule({ freq: "monthly", interval: 1 }, "2026-01-15")).toBe("Todo mês, dia 15");
    expect(describeRule({ freq: "daily", interval: 1, count: 5 })).toBe("Todos os dias · 5 vezes");
  });

  it("os atalhos acompanham o dia de início", () => {
    const presets = presetRules(MON);
    expect(presets.find((p) => p.id === "weekly")!.label).toBe("Toda segunda");
  });
});
