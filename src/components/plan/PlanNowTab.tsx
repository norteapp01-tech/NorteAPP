import { useMemo, useState } from "react";
import { AlertCircle, CalendarClock, ChevronRight, Clock3, GitBranch, Play } from "lucide-react";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";
import {
  daysBetweenISO,
  dependencyFor,
  formatDateShortBR,
  isExecutionBlocked,
  isScheduled,
  nextPlanAction,
  procrastinationSignal,
  rescheduleExecution,
  scheduleExecution,
  setExecutionWorkStatus,
  todayISO,
  type Execution,
  type Goal,
  type Step,
} from "@/lib/goals-store";

export function PlanNowTab({
  goal,
  steps,
  executions,
  onCreateAction,
  onCreateStage,
  onOpenStep,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
  onCreateAction: (stepId: string) => void;
  onCreateStage: () => void;
  onOpenStep: (stepId: string) => void;
}) {
  const action = nextPlanAction(goal, steps, executions);
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState("");
  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: todayISO(),
    startTime: "",
    endTime: "",
  });

  const following = useMemo(() => {
    if (action.kind !== "action") return undefined;
    return (
      executions.find(
        (execution) =>
          execution.dependsOnExecutionId === action.execution.id &&
          execution.status !== "concluida" &&
          execution.status !== "cancelada" &&
          execution.status !== "reagendada",
      ) ??
      executions
        .filter(
          (execution) =>
            execution.id !== action.execution.id &&
            execution.status !== "concluida" &&
            execution.status !== "cancelada" &&
            execution.status !== "reagendada" &&
            execution.dueDate >= action.execution.dueDate,
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    );
  }, [action, executions]);

  if (action.kind !== "action") {
    return (
      <div className="plan-now mt-5">
        <div className="plan-next-card card-surface-featured border-l-2 border-l-primary p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Agora
          </p>
          <p className="mt-2 text-lg font-semibold">Defina o próximo passo</p>
          <button
            onClick={() =>
              action.kind === "define" ? onCreateAction(action.step.id) : onCreateStage()
            }
            className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {action.kind === "define" ? "Criar ação" : "Criar primeira etapa"}
          </button>
        </div>
      </div>
    );
  }

  const execution = action.execution;
  const dependency = dependencyFor(execution, executions);
  const blocked = isExecutionBlocked(execution, executions);
  const signal = procrastinationSignal(execution, executions);
  const days = daysBetweenISO(todayISO(), execution.dueDate);
  const scheduled = isScheduled(execution);
  const validSchedule = scheduleTimesValid(schedule);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  const confirmSchedule = () =>
    run(async () => {
      if (!validSchedule) return;
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
    });

  return (
    <div className="plan-now mt-5 space-y-3">
      <section className="plan-next-card card-surface-featured border-l-2 border-l-primary p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Próximo passo
        </p>
        <h2 className="mt-2 text-[22px] font-bold leading-tight">{execution.title}</h2>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span
            className={`flex items-center gap-1.5 font-semibold ${days < 0 ? "text-danger" : "text-primary"}`}
          >
            <Clock3 className="h-4 w-4" />
            {days < 0
              ? `${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"} de atraso`
              : days === 0
                ? "Termina hoje"
                : `Faltam ${days} ${days === 1 ? "dia" : "dias"}`}
          </span>
          <span className="text-muted-foreground">Até {formatDateShortBR(execution.dueDate)}</span>
        </div>

        {blocked && (
          <button
            onClick={() =>
              dependency
                ? onOpenStep(dependency.stepId ?? action.step.id)
                : void run(() => setExecutionWorkStatus(execution.id, "next"))
            }
            className="mt-4 flex w-full items-center gap-3 rounded-xl border border-danger/25 bg-danger/8 p-3 text-left"
          >
            <GitBranch className="h-5 w-5 shrink-0 text-danger" />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-danger">
                Bloqueada
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium">
                {dependency
                  ? `Conclua “${dependency.title}” primeiro`
                  : execution.blockedReason || "Resolva o bloqueio para continuar"}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}

        {signal && !blocked && (
          <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              Possível procrastinação · há {signal.daysWithoutProgress} dias
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Reagendada {signal.rescheduleCount} vezes · sem avanço desde{" "}
              {formatDateShortBR(signal.sinceISO)}
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-[11px] text-danger">{error}</p>}

        {!blocked && (
          <div className="mt-4 grid gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => setExecutionWorkStatus(execution.id, "in_progress"))}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {execution.planWorkStatus === "in_progress" ? "Continuar agora" : "Começar agora"}
            </button>
            <button
              onClick={() => setScheduling((current) => !current)}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/45 text-sm font-semibold text-primary"
            >
              <CalendarClock className="h-4 w-4" /> {scheduled ? "Reagendar" : "Agendar"}
            </button>
          </div>
        )}

        {scheduling && !blocked && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-3">
            <ScheduleFields value={schedule} onChange={setSchedule} disabled={busy} size="md" />
            <button
              disabled={!validSchedule || busy}
              onClick={confirmSchedule}
              className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              Confirmar
            </button>
          </div>
        )}
      </section>

      {following && (
        <button
          onClick={() => following.stepId && onOpenStep(following.stepId)}
          className="card-surface flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Depois
            </span>
            <span className="mt-1 block truncate text-sm font-semibold">{following.title}</span>
            {following.dependsOnExecutionId === execution.id && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                liberada ao concluir esta ação
              </span>
            )}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
