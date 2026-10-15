import type { MuscleGroup } from "../workout-store";

export type CompletionStatus = "atencao" | "abaixo" | "proximo" | "quase" | "meta" | "progredir";
export type Confidence = "alta" | "media" | "baixa";

export type Volume = { sessions: number; exercises: number; sets: number; reps: number };

/** Exercício do músculo que não foi cumprido por inteiro. */
export type IncompleteExercise = {
  name: string;
  date: string;
  /** "nao_realizado": treino inteiro faltou; "pulado": exercício pulado; "parcial": séries/repetições a menos. */
  kind: "nao_realizado" | "pulado" | "parcial";
  setsDone: number;
  setsPlanned: number;
  repsDone: number;
  repsPlanned: number;
  completion: number;
};

/** Sugestão de progressão (estado dourado). Nada muda sem a pessoa confirmar. */
export type ProgressionSuggestion = {
  lineageId: string;
  exerciseId?: string;
  name: string;
  currentLoad: number;
  suggestedLoad?: number;
  repsTarget: number;
};

export type CompletionResult = {
  muscleId: MuscleGroup;
  muscleName: string;
  /** 0–10, ou null quando não há nada planejado para o músculo no período. */
  score: number | null;
  completionPercentage: number | null;
  status: CompletionStatus | null;
  confidence: Confidence;
  plannedVolume: Volume;
  completedVolume: Volume;
  eligibleForProgression: boolean;
  progression: ProgressionSuggestion[];
  incomplete: IncompleteExercise[];
  insufficientData: boolean;
  /** Nota do período anterior de mesma duração (para comparação). */
  previousScore: number | null;
  /** Aviso (não altera a nota): o próprio plano dá pouco espaço a este músculo. */
  planShareNote?: string;
  explanation: string;
};

export type ExerciseEvolution = {
  lineageId: string;
  name: string;
  metric: "forca_estimada" | "repeticoes";
  previous: number;
  current: number;
  percentage: number;
  weight: number;
};

export type EvolutionResult = {
  muscleId: MuscleGroup;
  muscleName: string;
  score: number | null;
  evolutionPercentage: number | null;
  label: string | null;
  confidence: Confidence;
  exercises: ExerciseEvolution[];
  insufficientData: boolean;
  explanation: string;
};
