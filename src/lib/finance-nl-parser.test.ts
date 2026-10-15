import { expect, it } from "vitest";
import { parseFinanceEntry } from "./finance-nl-parser";

it("descrição sem preposição sobrando", () => {
  expect(parseFinanceEntry("paguei 89,90 de farmácia")?.description).toBe("Farmácia");
  expect(parseFinanceEntry("gastei 32 reais no uber")?.description).toBe("Uber");
});

it("valor com vírgula e tipo de lançamento", () => {
  expect(parseFinanceEntry("paguei 89,90 de farmácia")).toMatchObject({ amount: 89.9, type: "expense" });
  expect(parseFinanceEntry("recebi 1200 de um freela")).toMatchObject({ amount: 1200, type: "income" });
});

it("lê o número inteiro em qualquer formato", () => {
  const cases: [string, number][] = [
    ["recebi 2500 de salário", 2500], ["gastei 1.200 no mercado", 1200], ["paguei R$ 2.500,00 de aluguel", 2500],
    ["uber 32", 32], ["r$8,50 café", 8.5], ["comprei tênis por 349,9", 349.9], ["recebi 15000", 15000], ["gastei 10.5 em pão", 10.5],
  ];
  for (const [text, value] of cases) expect(parseFinanceEntry(text)?.amount, text).toBe(value);
});

it("tira o valor inteiro da descrição", () => {
  expect(parseFinanceEntry("recebi 1200 de um freela")?.description).toBe("Um freela");
  expect(parseFinanceEntry("gastei 2.500,00 no aluguel")?.description).toBe("Aluguel");
});
