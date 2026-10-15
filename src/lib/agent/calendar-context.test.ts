import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ validator: () => ({ handler: (h: unknown) => h }) }) }));
import { calendarContext } from "./chat.functions";

it("lista o dia da semana de hoje e dos próximos dias", () => {
  const ctx = calendarContext("America/Sao_Paulo", new Date("2026-10-15T15:00:00Z"));
  expect(ctx).toContain("quinta-feira, 2026-10-15");
  expect(ctx).toContain("sexta-feira = 2026-10-16");
  expect(ctx).toContain("quinta-feira = 2026-10-22");
});
