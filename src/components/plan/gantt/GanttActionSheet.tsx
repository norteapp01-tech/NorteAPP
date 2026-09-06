import { useState } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";
import {
  cancelExecution,
  formatDateBR,
  isScheduled,
  patchExecution,
  redistributeExecution,
  scheduleExecution,
  setPlannedRange,
  toggleExecutionDone,
  todayISO,
  updateGoalDeadline,
  useGoalsStore,
  type Execution,
  type Goal,
} from "@/lib/goals-store";

/** Detalhe/edição de uma ação a partir do Cronograma — mesmas mutations de
 * sempre (nada de lógica nova): concluir, editar prazo, mover o intervalo
 * planejado, colocar/reagendar na Agenda (sem nunca sobrescrever o
 * intervalo planejado), redistribuir, descartar com confirmação. */
export function GanttActionSheet({
  execution,
  goal,
  onClose,
}: {
  execution: Execution;
  goal: Goal;
  onClose: () => void;
}) {
  const allExecutions = useGoalsStore((s) => s.executions);
  const e = allExecutions.find((x) => x.id === execution.id) ?? execution;
  const [title, setTitle] = useState(e.title);
  const [dueDate, setDueDate] = useState(e.dueDate);
  const [plannedStart, setPlannedStart] = useState(e.plannedStartDate ?? "");
  const [plannedEnd, setPlannedEnd] = useState(e.plannedEndDate ?? "");
  const [savingRange, setSavingRange] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: e.agendaDate ?? todayISO(),
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
  });
  const [scheduleError, setScheduleError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const scheduled = isScheduled(e);
  const done = e.status === "concluida";

  const saveTitleAndDue = async () => {
    if (!title.trim() || !dueDate) return;
    setBusy(true);
    try {
      await patchExecution(e.id, { title: title.trim(), dueDate });
    } finally {
      setBusy(false);
    }
  };

  const rangeValid = !!plannedStart && !!plannedEnd && plannedStart <= plannedEnd;
  const saveRange = async () => {
    if (!rangeValid) {
      setRangeError("O fim não pode ser antes do início.");
      return;
    }
    setRangeError("");
    if (goal.deadlineISO && plannedEnd > goal.deadlineISO) {
      const accepted = window.confirm(
        `Essa alteração fará o plano ultrapassar o prazo atual. O novo prazo será ${formatDateBR(plannedEnd)}. Deseja continuar?`,
      );
      if (!accepted) return;
    }
    setSavingRange(true);
    try {
      if (goal.deadlineISO && plannedEnd > goal.deadlineISO) {
        await updateGoalDeadline(goal.id, plannedEnd);
      }
      await setPlannedRange(e.id, plannedStart, plannedEnd);
    } catch (err) {
      setRangeError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSavingRange(false);
    }
  };

  const timesValid = scheduleTimesValid(schedule);
  const confirmSchedule = async () => {
    if (!timesValid) return;
    setScheduleError("");
    setBusy(true);
    try {
      await scheduleExecution(e.id, schedule.date, schedule.startTime, schedule.endTime);
      setScheduling(false);
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Ação">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await toggleExecutionDone(e.id);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            aria-label={done ? "Reabrir ação" : "Concluir ação"}
            className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border disabled:opacity-50 ${done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2"}`}
          >
            {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </button>
          <input
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            onBlur={saveTitleAndDue}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            Prazo
          </span>
          <DateField
            value={dueDate}
            onChange={(v) => {
              setDueDate(v);
              patchExecution(e.id, { dueDate: v });
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm outline-none focus:border-primary"
          />
        </label>

        <div>
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            Intervalo no cronograma
          </span>
          <div className="grid grid-cols-2 gap-2">
            <DateField
              value={plannedStart}
              onChange={setPlannedStart}
              placeholder="Início"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2.5 text-left text-xs outline-none focus:border-primary"
            />
            <DateField
              value={plannedEnd}
              onChange={setPlannedEnd}
              placeholder="Fim"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2.5 text-left text-xs outline-none focus:border-primary"
            />
          </div>
          {rangeError && <p className="mt-1 text-[11px] text-danger">{rangeError}</p>}
          <button
            disabled={
              savingRange ||
              (plannedStart === (e.plannedStartDate ?? "") &&
                plannedEnd === (e.plannedEndDate ?? ""))
            }
            onClick={saveRange}
            className="mt-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {savingRange ? "Salvando…" : "Salvar intervalo"}
          </button>
        </div>

        <div>
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            Agenda
          </span>
          {!scheduling ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-2.5">
              <p className="text-xs text-muted-foreground">
                {scheduled
                  ? `${formatDateBR(e.agendaDate!)} · ${e.startTime}–${e.endTime}`
                  : "Não agendada"}
              </p>
              <button
                onClick={() => setScheduling(true)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold text-primary ${scheduled ? "border-primary/50" : "border-dashed border-primary/80 bg-primary/5"}`}
              >
                {scheduled ? "Agendar outra sessão" : "Colocar na agenda"}
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-2 p-2.5">
              <ScheduleFields value={schedule} onChange={setSchedule} disabled={busy} size="md" />
              {scheduleError && <p className="mt-1.5 text-[11px] text-danger">{scheduleError}</p>}
              <div className="mt-2 flex gap-1.5">
                <button
                  disabled={!timesValid || busy}
                  onClick={confirmSchedule}
                  className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
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

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await redistributeExecution(e.id, allExecutions);
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/40 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Redistribuir
          </button>
          {!confirmDiscard ? (
            <button
              onClick={() => setConfirmDiscard(true)}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" /> Descartar
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await cancelExecution(e.id, "descartado no cronograma");
                    onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-lg bg-danger px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmDiscard(false)}
                className="text-[11px] text-muted-foreground"
              >
                cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
