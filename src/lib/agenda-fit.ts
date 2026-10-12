import { addDaysISO, suggestFreeSlots, type FreeSlot, type TimedLike } from "./agenda-intervals";
import type { AgendaSettings } from "./agenda-settings";
import { isGoalComplete, isScheduled, type Execution, type Goal, type Step } from "./goals-store";

// ---------------------------------------------------------------------------
// "Para encaixar": ações de planos ativos que têm prazo mas ainda não têm
// horário. É uma ponte — algo só entra na linha do tempo quando recebe horário.
// ---------------------------------------------------------------------------

export type FitItem = {
  execution: Execution;
  goal: Goal;
  /** Prazo efetivo: o da ação, ou o do plano se for mais cedo. */
  deadline: string;
  overdue: boolean;
  /** Vence nos próximos 3 dias (inclusive hoje). */
  soon: boolean;
};

export function fitCandidates(
  executions: Execution[],
  goals: Goal[],
  steps: Step[],
  today: string,
  limit = 30,
): FitItem[] {
  const out: FitItem[] = [];
  for (const execution of executions) {
    if (execution.status !== "planejada") continue;
    if (!execution.goalId) continue;
    const goal = goals.find((g) => g.id === execution.goalId);
    if (!goal || isGoalComplete(goal, steps, executions)) continue;
    // Já tem horário vigente? Então já está na Agenda.
    if (isScheduled(execution)) continue;
    // Ocorrência de série/rotina sem linha própria nunca chega aqui; ações
    // que já foram agendadas e ficaram no passado também não são "para encaixar".
    if (execution.agendaDate || execution.agendaSessions?.length) continue;
    const deadline =
      goal.deadlineISO && goal.deadlineISO < execution.dueDate
        ? goal.deadlineISO
        : execution.dueDate;
    out.push({
      execution,
      goal,
      deadline,
      overdue: deadline < today,
      soon: deadline >= today && deadline <= addDaysISO(today, 3),
    });
  }
  return out
    .sort(
      (a, b) =>
        a.deadline.localeCompare(b.deadline) || a.execution.title.localeCompare(b.execution.title),
    )
    .slice(0, limit);
}

/** Sugestões determinísticas de horário para uma ação, respeitando o prazo. */
export function suggestSlotsFor(
  item: FitItem,
  occupied: TimedLike[],
  settings: AgendaSettings,
  now: { date: string; minute: number },
  limit = 3,
): FreeSlot[] {
  return suggestFreeSlots({
    date: now.date,
    duration: settings.defaultDurationMin,
    items: occupied,
    windowStart: settings.dayStart,
    windowEnd: settings.dayEnd,
    notBeforeMinute: now.minute,
    // Prazo vencido: ainda dá para sugerir os próximos dias; só não há o que respeitar.
    lastDate: item.overdue ? undefined : item.deadline,
    daysToSearch: 14,
    limit,
  });
}
