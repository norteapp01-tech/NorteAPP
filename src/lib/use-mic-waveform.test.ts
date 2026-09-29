import { expect, it } from "vitest";
import { reduceToBars } from "./use-mic-waveform";

it("reduz bytes de frequência a barras normalizadas 0-1, uma por faixa", () => {
  const data = new Uint8Array(120).fill(255); // amplitude máxima em tudo
  const bars = reduceToBars(data, 12);
  expect(bars).toHaveLength(12);
  bars.forEach((b) => expect(b).toBeCloseTo(1, 5));
});

it("silêncio total ainda mostra um piso visível (nunca barra em 0px)", () => {
  const data = new Uint8Array(120).fill(0);
  const bars = reduceToBars(data, 12);
  bars.forEach((b) => expect(b).toBe(0.08));
});

it("cada barra reflete só o pedaço de frequência que lhe cabe, não a média geral", () => {
  const data = new Uint8Array(4);
  data[0] = 0;
  data[1] = 255; // barra 0 (chunk de 2) fica no meio
  data[2] = 0;
  data[3] = 0; // barra 1 fica no piso
  const bars = reduceToBars(data, 2);
  expect(bars[0]).toBeCloseTo(0.5, 5);
  expect(bars[1]).toBe(0.08);
});

it("array vazio não quebra — devolve o piso em todas as barras", () => {
  expect(reduceToBars(new Uint8Array(0), 12)).toEqual(Array(12).fill(0.08));
});
