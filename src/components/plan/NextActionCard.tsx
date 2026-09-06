import { useState } from "react";
import { CalendarClock, Check } from "lucide-react";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";
import {
  formatDateShortBR,
  isScheduled,
  nextPlanAction,
  rescheduleExecution,
  scheduleExecution,
  todayISO,
  toggleExecutionDone,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";

/**
 * "Próximo passo" — único card com destaque forte da tela. Referencia a
 * MESMA ação escolhida por `nextPlanAction` (nunca cria/copia registro):
 * concluir ou agendar aqui atualiza a linha original, que a etapa dona
 * também está lendo do mesmo cache.
 */
export function NextActionCard({
  goal,
  steps,
  executions,
  onCreateAction,
  onCreateStage,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
  onCreateAction: (stepId: string) => void;
  onCreateStage: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: todayISO(),
    startTime: "",
    endTime: "",
  });
  const [error, setError] = useState("");
  const action = nextPlanAction(goal, steps, executions);

  if (action.kind !== "action") {
    return (
      <div className="card-surface border-l-2 border-l-primary p-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Próximo passo</p>
        <p className="mt-2 text-[15px] font-medium text-balance-tight">
          Defina o primeiro passo deste plano
        </p>
        <button
          onClick={() =>
            action.kind === "define" ? onCreateAction(action.step.id) : onCreateStage()
          }
          className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Criar ação
        </button>
      </div>
    );
  }

  const execution = action.execution;
  const scheduled = isScheduled(execution);
  const valid = scheduleTimesValid(schedule);

  const confirmSchedule = async () => {
    if (!valid) return;
    setError("");
    try {
      if (scheduled) {
        await rescheduleExecution(
          execution.id,
          schedule.date,
          schedule.startTime,
          schedule.endTime,
          "reagendado no plano",
        );
      } else {
        await scheduleExecution(execution.id, schedule.date, schedule.startTime, schedule.endTime);
      }
      setScheduling(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.");
    }
  };

  return (
    <div className="card-surface border-l-2 border-l-primary p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Próximo passo</p>
      <div className="mt-2.5 flex items-start gap-3">
        <button
          disabled={completing}
          onClick={async () => {
            setCompleting(true);
            try {
              await toggleExecutionDone(execution.id);
            } finally {
              setCompleting(false);
            }
          }}
          aria-label="Concluir próximo passo"
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 disabled:opacity-60"
        >
          {completing && <Check className="h-3.5 w-3.5 opacity-40" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold leading-snug text-balance-tight">
            {execution.title}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Até {formatDateShortBR(execution.dueDate)} ·{" "}
            {scheduled
              ? `${formatDateShortBR(execution.agendaDate!)} ${execution.startTime}`
              : "Sem agenda"}
          </p>
        </div>
        {!scheduling && (
          <button
            onClick={() => setScheduling(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {scheduled ? "Reagendar" : "Agendar"}
          </button>
        )}
      </div>
      {scheduling && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-2.5">
          <ScheduleFields value={schedule} onChange={setSchedule} size="md" />
          {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
          <div className="mt-2 flex gap-1.5">
            <button
              disabled={!valid}
              onClick={confirmSchedule}
              className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              onClick={() => setScheduling(false)}
              className="text-[11px] text-muted-foreground"
            >
              cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
