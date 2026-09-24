import { afterEach, expect, it } from "vitest";
import {
  dateAndTimeInZone,
  getAppTimeZone,
  isValidTimeZone,
  setAppTimeZone,
  zonedTimeToUtcISO,
} from "./app-time-zone";

afterEach(() => localStorage.clear());

it("converte o mesmo instante para dia e hora locais em fusos diferentes", () => {
  const instant = new Date("2026-09-22T02:30:00.000Z");
  expect(dateAndTimeInZone(instant, "America/Sao_Paulo")).toEqual({
    date: "2026-09-21",
    time: "23:30",
  });
  expect(dateAndTimeInZone(instant, "Europe/Lisbon")).toEqual({
    date: "2026-09-22",
    time: "03:30",
  });
});

it("converte data e hora de um fuso pro instante UTC correto (inverso de dateAndTimeInZone)", () => {
  expect(zonedTimeToUtcISO("2026-09-21", "23:30", "America/Sao_Paulo")).toBe(
    "2026-09-22T02:30:00.000Z",
  );
  expect(zonedTimeToUtcISO("2026-09-22", "03:30", "Europe/Lisbon")).toBe(
    "2026-09-22T02:30:00.000Z",
  );
  // Ida e volta: formatar o resultado no mesmo fuso devolve a hora original.
  const roundTrip = zonedTimeToUtcISO("2026-12-25", "14:00", "America/Sao_Paulo");
  expect(dateAndTimeInZone(new Date(roundTrip), "America/Sao_Paulo")).toEqual({
    date: "2026-12-25",
    time: "14:00",
  });
});

it("salva apenas fusos válidos e permite voltar ao dispositivo", () => {
  expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
  expect(isValidTimeZone("Cidade/Inexistente")).toBe(false);
  setAppTimeZone("America/Sao_Paulo");
  expect(getAppTimeZone()).toBe("America/Sao_Paulo");
  setAppTimeZone(null);
  expect(getAppTimeZone()).toBeNull();
});
