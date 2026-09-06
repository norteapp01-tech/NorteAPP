import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";
import {
  createExecution,
  formatDateBR,
  scheduleExecution,
  todayISO,
  type Goal,
  type Step,
  type TaskWeight,
} from "@/lib/goals-store";

const weightOptions: { value: TaskWeight; label: string }[] = [
  { value: "leve", label: "~30 min" },
  { value: "medio", label: "~1h30" },
  { value: "pesado", label: "~2h30" },
];

/** Nova ação dentro de uma etapa — sempre cria com `goalId`+`stepId` (nunca
 * vira etapa independente); depois de criar, oferece agendar sem sair do
 * modal ou deixar pra depois. Mesma `createExecution` de sempre. */
export function CreateActionSheet({
  step,
  goal,
  onClose,
}: {
  step: Step;
  goal: Goal;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    dueDate: "",
    weight: undefined as TaskWeight | undefined,
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: todayISO(),
    startTime: "",
    endTime: "",
  });
  const [scheduleError, setScheduleError] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const dueLimit = step.targetDate ?? goal.deadlineISO;
  const dueLimitLabel = step.targetDate
    ? `a etapa (${formatDateBR(step.targetDate)})`
    : goal.deadlineISO
      ? `o plano (${formatDateBR(goal.deadlineISO)})`
      : "";

  const save = async () => {
    if (!form.title || !form.dueDate || saving) return;
    if (dueLimit && form.dueDate > dueLimit) {
      setFormError(`O prazo da ação não pode ser depois do prazo d${dueLimitLabel}.`);
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const id = await createExecution({
        title: form.title,
        dueDate: form.dueDate,
        category: goal.category,
        weight: form.weight ?? "medio",
        goalId: goal.id,
        stepId: step.id,
      });
      setCreatedId(id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível criar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const valid = scheduleTimesValid(schedule);
  const confirmSchedule = async () => {
    if (!createdId || !valid || scheduling) return;
    setScheduleError("");
    setScheduling(true);
    try {
      await scheduleExecution(createdId, schedule.date, schedule.startTime, schedule.endTime);
      onClose();
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.",
      );
    } finally {
      setScheduling(false);
    }
  };

  if (createdId) {
    return (
      <Modal onClose={onClose} title="Ação criada">
        <p className="text-sm text-balance-tight">
          "{form.title}" criada. Prazo: {formatDateBR(form.dueDate)}.
        </p>
        {!scheduleOpen ? (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setScheduleOpen(true)}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Adicionar à agenda
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold text-muted-foreground"
            >
              Deixar para depois
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <ScheduleFields
              value={schedule}
              onChange={setSchedule}
              disabled={scheduling}
              size="md"
            />
            {scheduleError && <p className="mt-2 text-[11px] text-danger">{scheduleError}</p>}
            <button
              disabled={!valid || scheduling}
              onClick={confirmSchedule}
              className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {scheduling ? "Agendando…" : "Confirmar na agenda"}
            </button>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Nova ação">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          O que precisa ser feito?
        </span>
        <input
          autoFocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Ex: Pesquisar três concorrentes"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
        />
      </label>
      <div className="mt-3">
        <DateField
          label="Realizar até"
          value={form.dueDate}
          onChange={(v) => {
            setForm({ ...form, dueDate: v });
            setFormError("");
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-left text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="mt-3">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Duração estimada (opcional)
        </span>
        <div className="flex gap-1.5">
          {weightOptions.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() =>
                setForm({ ...form, weight: form.weight === w.value ? undefined : w.value })
              }
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${form.weight === w.value ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
      {formError && <p className="mt-2 text-[11px] text-danger">{formError}</p>}
      <button
        disabled={!form.title || !form.dueDate || saving}
        onClick={save}
        className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Criando…" : "Criar ação"}
      </button>
    </Modal>
  );
}
