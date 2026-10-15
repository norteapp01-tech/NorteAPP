import type { ExerciseEquipment, MuscleGroup } from "../workout-store";

// ---------------------------------------------------------------------------
// Análise por músculo — todos os pesos, limites e faixas num lugar só.
// ---------------------------------------------------------------------------

/** Participação de cada músculo no exercício. */
export const PARTICIPATION = { primary: 1, secondary: 0.5 } as const;

/** Músculos que aparecem no gráfico (grupo pai). Só entram os que tiverem
 * exercício planejado ou registro no período. */
export const CHART_MUSCLES: MuscleGroup[] = [
  "peito",
  "costas",
  "ombros",
  "biceps",
  "triceps",
  "antebraco",
  "quadriceps",
  "posteriores",
  "gluteos",
  "panturrilhas",
  "abdomen",
];

/** Faixas de status do modo Cumprimento (nota 0–10). */
export const COMPLETION_STATUS_BANDS = {
  atencao: { min: 0, max: 3.9 },
  abaixo: { min: 4, max: 6.9 },
  proximo: { min: 7, max: 8.9 },
  quase: { min: 9, max: 9.9 },
  meta: { min: 10, max: 10 },
} as const;

/** Estado dourado (pode progredir). */
export const PROGRESSION_RULES = {
  /** Sessões consecutivas do mesmo exercício batendo o topo da meta. */
  consecutiveSessions: 2,
  /** Fração das séries planejadas que precisam atingir o topo da meta de repetições. */
  minShareOfSetsAtTop: 0.8,
  /** Esforço percebido que bloqueia a sugestão de progressão. */
  blockingEffort: "pesado" as const,
} as const;

/** Incremento sugerido de carga por equipamento (kg). */
export const LOAD_INCREMENT: Partial<Record<ExerciseEquipment, number>> = {
  barra: 2.5,
  maquina: 2.5,
  cabo: 2.5,
  halteres: 1,
  kettlebell: 2,
};
export const DEFAULT_LOAD_INCREMENT = 2;

/** Equipamentos em que carga × repetições não mede força comparável. */
export const NON_LOAD_EQUIPMENT: ExerciseEquipment[] = ["assistido", "elastico"];
/** Peso do corpo: compara repetições (a carga registrada costuma ser 0). */
export const BODYWEIGHT_EQUIPMENT: ExerciseEquipment[] = ["peso_corporal"];

/** Evolução percentual → nota 0–10 (pontos de uma escala por partes). Cada par
 * é [evolução %, nota]. Entre os pontos a nota é interpolada. */
export const EVOLUTION_SCALE: [number, number][] = [
  [-15, 0], // queda relevante
  [-5, 3],
  [-2, 4], // estável / oscilação normal: 4–5
  [2, 5],
  [2.5, 6], // evolução leve: 6–7
  [5, 7],
  [10, 9], // boa evolução: 8–9
  [15, 10], // excelente
];
export const EVOLUTION_LABELS: { min: number; label: string }[] = [
  { min: 10, label: "Evolução excelente" },
  { min: 8, label: "Boa evolução" },
  { min: 6, label: "Evolução leve" },
  { min: 4, label: "Estável" },
  { min: 0, label: "Queda de desempenho" },
];

/** Aviso de plano leve: carga planejada do músculo (séries semanais ÷ tamanho)
 * abaixo desta fração da mediana dos músculos do próprio plano. Não altera a nota. */
export const PLAN_SHARE_LOW = 0.5;
export const MUSCLE_SIZE: Partial<Record<MuscleGroup, number>> = {
  costas: 1,
  peito: 1,
  quadriceps: 1,
  ombros: 0.75,
  posteriores: 0.75,
  gluteos: 0.75,
  biceps: 0.5,
  triceps: 0.5,
  panturrilhas: 0.5,
  abdomen: 0.5,
  antebraco: 0.4,
};
