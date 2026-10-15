import type { CompletionStatus } from "@/lib/muscle-analysis/types";

/** Cor de cada estado do modo Cumprimento (sempre acompanhada de forma e texto). */
export const STATUS_COLOR: Record<CompletionStatus, string> = {
  atencao: "#e8866a",
  abaixo: "#e8b56a",
  proximo: "#9ec5ff",
  quase: "#80e7c6",
  meta: "var(--color-primary)",
  progredir: "#f2c14e",
};
