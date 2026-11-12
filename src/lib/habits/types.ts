// Rotinas e hábitos — tipos do domínio. Espelham as tabelas `habits*` (migração 0063).

export type Intent = "build" | "limit" | "quit";
export type Measure = "binary" | "count" | "quantity" | "duration";
export type GoalPeriod = "day" | "week" | "month" | "year";
export type TimeOfDay = "morning" | "afternoon" | "evening";

export type Schedule =
  | { type: "daily" }
  | { type: "weekdays"; weekdays: number[] } // 0 = domingo … 6 = sábado
  | { type: "monthdays"; days: number[] } // 1..31 (31 em mês curto = último dia)
  | { type: "interval"; every: number }; // a cada N dias

export type ChecklistItem = { id: string; title: string };

/** Meta + frequência vigentes a partir de `effectiveFrom`. */
export type HabitVersion = {
  id: string;
  habitId: string;
  effectiveFrom: string;
  goalValue: number;
  goalPeriod: GoalPeriod;
  schedule: Schedule;
  /** Meta do período inteiro, sem dia fixo. */
  flexible: boolean;
  timesOfDay: TimeOfDay[];
  checklist: ChecklistItem[];
};

export type EndCondition =
  | { type: "date"; date: string }
  | { type: "completions"; count: number }
  | { type: "total"; amount: number };

export type HabitModule = "academia" | "esportes" | "leitura" | "agua";
export type ModuleMetric = "sessions" | "minutes" | "pages" | "km" | "ml";

export type Habit = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  area?: string;
  intent: Intent;
  measure: Measure;
  unit?: string;
  startDate: string;
  endCondition?: EndCondition;
  goalId?: string;
  stepId?: string;
  labelId?: string;
  category?: string;
  module?: HabitModule;
  moduleMetric?: ModuleMetric;
  position: number;
  archivedAt?: string;
  createdAt: string;
  versions: HabitVersion[];
};

export type LogStatus = "recorded" | "skipped" | "missed" | "confirmed";
export type LogSource = "manual" | "timer" | "module" | "import" | "agent";
export type Feeling = "leve" | "neutro" | "pesado";

export type HabitLog = {
  id: string;
  habitId: string;
  localDate: string;
  occurredAt: string;
  timeZone?: string;
  status: LogStatus;
  value: number;
  durationSeconds?: number;
  note: string;
  reason?: string;
  feeling?: Feeling;
  checks: string[];
  source: LogSource;
  sourceRef?: string;
  deletedAt?: string;
};

export type Pause = {
  id: string;
  scope: "habit" | "area" | "global";
  habitId?: string;
  area?: string;
  startDate: string;
  endDate?: string;
  reason?: string;
};

export type TimerMode = "stopwatch" | "countdown" | "pomodoro";
export type PomodoroConfig = { focus: number; short: number; long: number; cycles: number };

export type HabitTimer = {
  id: string;
  habitId: string;
  mode: TimerMode;
  state: "running" | "paused";
  startedAt: string;
  accumulatedSeconds: number;
  targetSeconds?: number;
  pomodoro?: PomodoroConfig;
  deviceId?: string;
  /** Quando a sessão foi criada: é o dia em que ela conta. */
  createdAt?: string;
  revision: number;
};

export type Chain = {
  id: string;
  baseHabitId: string;
  targetHabitId: string;
  trigger: "done" | "skipped" | "missed";
  delayMinutes: number;
};

export type HabitReminder = {
  id: string;
  habitId: string;
  time: string;
  weekdays: number[];
  enabled: boolean;
};

export type Reflection = {
  id: string;
  localDate: string;
  habitId?: string;
  mood?: "muito_bem" | "bem" | "neutro" | "dificil" | "muito_dificil";
  note: string;
  createdAt: string;
};
