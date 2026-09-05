import { describe, it, expect } from "vitest";
import { parseISO, toISO, formatBR, daysInMonth } from "./date-wheel-picker";

describe("date-wheel-picker — matemática pura de data (sem Date/UTC pro parse)", () => {
  it("parseISO/toISO fazem round-trip por split de string", () => {
    expect(parseISO("2026-09-04")).toEqual({ y: 2026, m: 9, d: 4 });
    expect(toISO(2026, 9, 4)).toBe("2026-09-04");
    expect(parseISO("data inválida")).toBeNull();
  });

  it("formatBR formata DD/MM/AAAA sem passar por Date/UTC", () => {
    expect(formatBR("2026-09-04")).toBe("04/09/2026");
    expect(formatBR("2026-01-01")).toBe("01/01/2026");
  });

  describe("daysInMonth — fevereiro e anos bissextos", () => {
    it("meses de 31 dias", () => {
      expect(daysInMonth(2026, 1)).toBe(31); // janeiro
      expect(daysInMonth(2026, 3)).toBe(31); // março
    });
    it("meses de 30 dias", () => {
      expect(daysInMonth(2026, 4)).toBe(30); // abril
    });
    it("fevereiro em ano não bissexto", () => {
      expect(daysInMonth(2026, 2)).toBe(28);
    });
    it("fevereiro em ano bissexto (2028, divisível por 4)", () => {
      expect(daysInMonth(2028, 2)).toBe(29);
    });
    it("regra de século: 1900 não é bissexto (divisível por 100, não por 400)", () => {
      expect(daysInMonth(1900, 2)).toBe(28);
    });
    it("regra de século: 2000 é bissexto (divisível por 400)", () => {
      expect(daysInMonth(2000, 2)).toBe(29);
    });
  });
});
