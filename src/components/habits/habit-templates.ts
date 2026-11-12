import type { GoalPeriod, Intent, Measure } from "@/lib/habits/types";

// Modelos editáveis. Nada aqui é recomendação clínica: são só pontos de partida
// que a pessoa ajusta (ou descarta) antes de salvar.
export type HabitTemplate = {
  id: string;
  name: string;
  icon: string;
  intent: Intent;
  measure: Measure;
  unit?: string;
  value: number;
  period: GoalPeriod;
  area?: string;
  module?: "academia" | "esportes" | "leitura" | "agua";
  moduleMetric?: "sessions" | "minutes" | "pages" | "km" | "ml";
};

export const HABIT_TEMPLATES: HabitTemplate[] = [
  {
    id: "agua",
    name: "Beber água",
    icon: "droplet",
    intent: "build",
    measure: "quantity",
    unit: "ml",
    value: 2000,
    period: "day",
    area: "Saúde",
    module: "agua",
    moduleMetric: "ml",
  },
  {
    id: "leitura",
    name: "Ler",
    icon: "book",
    intent: "build",
    measure: "quantity",
    unit: "páginas",
    value: 20,
    period: "day",
    area: "Mente",
    module: "leitura",
    moduleMetric: "pages",
  },
  {
    id: "caminhada",
    name: "Caminhar",
    icon: "footprints",
    intent: "build",
    measure: "quantity",
    unit: "km",
    value: 3,
    period: "day",
    area: "Saúde",
    module: "esportes",
    moduleMetric: "km",
  },
  {
    id: "estudo",
    name: "Estudar",
    icon: "graduation",
    intent: "build",
    measure: "duration",
    value: 30,
    period: "day",
    area: "Mente",
  },
  {
    id: "meditacao",
    name: "Meditar",
    icon: "sparkles",
    intent: "build",
    measure: "duration",
    value: 10,
    period: "day",
    area: "Mente",
  },
  {
    id: "treino",
    name: "Treinar",
    icon: "dumbbell",
    intent: "build",
    measure: "count",
    unit: "treinos",
    value: 3,
    period: "week",
    area: "Saúde",
    module: "academia",
    moduleMetric: "sessions",
  },
  {
    id: "oracao",
    name: "Orar",
    icon: "heart",
    intent: "build",
    measure: "binary",
    value: 1,
    period: "day",
    area: "Fé",
  },
  {
    id: "tela",
    name: "Reduzir tempo de tela",
    icon: "smartphone",
    intent: "limit",
    measure: "duration",
    value: 120,
    period: "day",
    area: "Mente",
  },
  {
    id: "cafe",
    name: "Reduzir café",
    icon: "coffee",
    intent: "limit",
    measure: "count",
    unit: "xícaras",
    value: 2,
    period: "day",
    area: "Saúde",
  },
];
