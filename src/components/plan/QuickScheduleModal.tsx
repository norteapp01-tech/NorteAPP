import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";
import {
  isScheduled,
  scheduleExecution,
  rescheduleExecution,
  todayISO,
  type Execution,
} from "@/lib/goals-store";

/** Agendar/reagendar uma execução específica sem sair da lista de planejamento —
 * chama as MESMAS mutações usadas dentro do detalhe do plano (nunca duplica
 * lógica nem cria um registro novo pra representar o agendamento). */
export function QuickScheduleModal({
  execution,
  onClose,
}: {
  execution: Execution;
  onClose: () => void;
}) {
  const scheduled = isScheduled(execution);
  const [value, setValue] = useState<ScheduleValue>({
    date: execution.agendaDate ?? todayISO(),
    startTime: execution.startTime ?? "",
    endTime: execution.endTime ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = scheduleTimesValid(value);

  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      if (scheduled) {
        await rescheduleExecution(
          execution.id,
          value.date,
          value.startTime,
          value.endTime,
          "reagendado no plano",
        );
      } else {
        await scheduleExecution(execution.id, value.date, value.startTime, value.endTime);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={scheduled ? "Reagendar execução" : "Colocar na agenda"}>
      <p className="text-sm font-medium text-balance-tight">{execution.title}</p>
      <div className="mt-3">
        <ScheduleFields value={value} onChange={setValue} disabled={busy} size="md" />
      </div>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      <button
        disabled={!valid || busy}
        onClick={confirm}
        className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Agendando…" : "Confirmar"}
      </button>
    </Modal>
  );
}
