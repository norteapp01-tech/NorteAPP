// Dados puramente apresentacionais/reference — nunca dados de domínio.
// Objetivos, etapas, execuções e compromissos vivem em goals-store.ts (fonte única de verdade).

export type TaskStatus = "green" | "yellow" | "white" | "red";

export const categoryMeta: Record<string, { label: string; emoji: string; accent: string }> = {
  academia: { label: "Academia", emoji: "💪", accent: "oklch(0.82 0.18 145)" },
  leitura: { label: "Leitura", emoji: "📚", accent: "oklch(0.78 0.14 250)" },
  alimentacao: { label: "Alimentação", emoji: "🥗", accent: "oklch(0.82 0.16 85)" },
  financas: { label: "Finanças", emoji: "💰", accent: "oklch(0.75 0.12 200)" },
  fe: { label: "Fé", emoji: "🕊️", accent: "oklch(0.8 0.06 260)" },
  trabalho: { label: "Trabalho", emoji: "💼", accent: "oklch(0.7 0.14 310)" },
  generico: { label: "Geral", emoji: "✦", accent: "oklch(0.78 0.02 260)" },
};

export const statusDot: Record<TaskStatus, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  white: "bg-muted-foreground/60",
  red: "bg-danger",
};

export const statusLabel: Record<TaskStatus, string> = {
  green: "você sempre cumpre",
  yellow: "cumprimento irregular",
  white: "nova — sem histórico",
  red: "você costuma pular",
};

export const lifeAreas = [
  "Corpo",
  "Mente",
  "Carreira",
  "Relações",
  "Arte",
  "Finanças",
  "Fé",
] as const;

export const lifeAreaColor: Record<string, string> = {
  Corpo: "oklch(0.82 0.18 145)",
  Mente: "oklch(0.78 0.14 250)",
  Carreira: "oklch(0.7 0.14 310)",
  Relações: "oklch(0.82 0.16 85)",
  Arte: "oklch(0.7 0.18 25)",
  Finanças: "oklch(0.75 0.12 200)",
  Fé: "oklch(0.8 0.06 260)",
};

export const catByArea: Record<string, string> = {
  Corpo: "academia",
  Mente: "leitura",
  Carreira: "trabalho",
  Relações: "generico",
  Arte: "generico",
  Finanças: "financas",
  Fé: "fe",
};
