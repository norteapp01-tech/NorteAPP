import { formatAmount } from "./units";
import type { DayEval, Outcome, PeriodEval } from "./engine";
import type {
  GoalPeriod,
  Habit,
  HabitVersion,
  Intent,
  Measure,
  Schedule,
  TimeOfDay,
} from "./types";

export const INTENT_LABEL: Record<Intent, string> = {
  build: "Construir",
  limit: "Reduzir",
  quit: "Abandonar",
};

export const MEASURE_LABEL: Record<Measure, string> = {
  binary: "Feito / não feito",
  count: "Contar vezes",
  quantity: "Quantidade",
  duration: "Tempo",
};

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  day: "por dia",
  week: "por semana",
  month: "por mês",
  year: "por ano",
};

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};

export const WEEKDAY_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
export const WEEKDAY_NAME = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAY_ABBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Faixas do dia usadas para agrupar (fixas: 5h–12h, 12h–18h, 18h–5h). */
export function timeOfDayOf(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  completed: "Cumprida",
  partial: "Parcial",
  skipped: "Pulada",
  missed: "Não realizada",
  paused: "Em pausa",
  none: "Sem registro",
  open: "Em andamento",
  within: "Dentro do limite até agora",
  unconfirmed: "Dentro do limite (não confirmado)",
  exceeded: "Passou do limite",
  not_scheduled: "Não programada",
  before_start: "Ainda não começou",
  future: "Futuro",
};

export function scheduleText(v: HabitVersion | undefined): string {
  if (!v) return "";
  if (v.flexible) return "Sem dia fixo";
  return describeSchedule(v.schedule);
}

export function describeSchedule(s: Schedule): string {
  switch (s.type) {
    case "daily":
      return "Todos os dias";
    case "weekdays": {
      const days = [...s.weekdays].sort((a, b) => a - b);
      if (days.length === 7) return "Todos os dias";
      if (days.join() === "1,2,3,4,5") return "Dias úteis";
      if (days.join() === "0,6") return "Fins de semana";
      return days.map((d) => WEEKDAY_ABBR[d]).join(", ");
    }
    case "monthdays":
      return `Dia ${[...s.days].sort((a, b) => a - b).join(", ")} do mês`;
    case "interval":
      return s.every === 1 ? "Todos os dias" : `A cada ${s.every} dias`;
  }
}

/** "1.500 / 2.000 ml" · "2 de 3 por semana" · "até 2 vezes". */
export function goalText(habit: Habit, v: HabitVersion | undefined): string {
  if (!v) return "";
  const unit = habit.measure === "duration" ? "min" : habit.unit;
  if (habit.intent === "quit") return "Meta: zero";
  const amount = habit.measure === "binary" ? "" : formatAmount(v.goalValue, unit);
  if (habit.intent === "limit")
    return `Limite: ${amount || v.goalValue} ${PERIOD_LABEL[v.goalPeriod]}`;
  if (habit.measure === "binary")
    return v.goalPeriod === "day"
      ? "Uma vez"
      : `${v.goalValue} ${v.goalValue === 1 ? "dia" : "dias"} ${PERIOD_LABEL[v.goalPeriod]}`;
  return `${amount} ${PERIOD_LABEL[v.goalPeriod]}`;
}

export function progressText(habit: Habit, day: DayEval, period: PeriodEval): string {
  const unit = habit.measure === "duration" ? "min" : habit.unit;
  const useP = period.period !== "day";
  const value = useP ? period.value : day.value;
  const goal = useP ? period.goal : day.goal;
  const per = useP ? ` ${PERIOD_LABEL[period.period]}` : "";
  if (habit.intent !== "build") {
    const shown = formatAmount(value, unit);
    if (habit.intent === "quit") return value > 0 ? `${shown} registrado` : "Sem registro hoje";
    return `${shown} de ${formatAmount(goal, unit)}${per}`;
  }
  if (habit.measure === "binary" && !useP)
    return day.outcome === "completed" ? "Feito" : "Pendente";
  if (habit.measure === "binary") return `${value} de ${goal} dias${per}`;
  return `${formatAmount(value, unit)} de ${formatAmount(goal, unit)}${per}`;
}

/** 0–1 para a barra de progresso. */
export function progressFraction(habit: Habit, day: DayEval, period: PeriodEval): number {
  const useP = period.period !== "day";
  const value = useP ? period.value : day.value;
  const goal = useP ? period.goal : day.goal;
  if (habit.intent !== "build") return goal > 0 ? Math.min(1, value / goal) : value > 0 ? 1 : 0;
  return goal > 0 ? Math.min(1, value / goal) : 0;
}

export function stepsFor(habit: Habit): number[] {
  if (habit.measure === "duration") return [5, 10, 15, 30];
  if (habit.measure === "quantity") {
    const u = (habit.unit ?? "").toLowerCase();
    if (u === "ml") return [100, 250, 500];
    if (u === "l") return [0.25, 0.5, 1];
    if (u === "km") return [1, 2, 5];
    if (u === "g") return [50, 100, 250];
    return [1, 5, 10];
  }
  return [1];
}

export function periodBounds(
  period: "30d" | "90d" | "1y",
  today: string,
): { from: string; to: string } {
  const days = period === "30d" ? 29 : period === "90d" ? 89 : 364;
  const [y, m, d] = today.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d - days));
  return { from: start.toISOString().slice(0, 10), to: today };
}
