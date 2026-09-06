import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import { createExecution, formatDateBR, type Goal, type Step } from "@/lib/goals-store";

/** Criar ação a partir de um toque em espaço vazio do cronograma — etapa e
 * período já vêm preenchidos pela posição tocada (editáveis); prazo por
 * padrão coincide com o fim do intervalo, mas pode ser ajustado. Insere
 * tudo de uma vez (goalId+stepId+intervalo planejado) num único `createExecution`. */
export function CreateActionOnGanttSheet({
  step,
  goal,
  startISO,
  endISO,
  onClose,
}: {
  step: Step;
  goal: Goal;
  startISO: string;
  endISO: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [plannedStart, setPlannedStart] = useState(startISO);
  const [plannedEnd, setPlannedEnd] = useState(endISO);
  const [dueDate, setDueDate] = useState(endISO);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const valid = title.trim() && plannedStart && plannedEnd && plannedStart <= plannedEnd && dueDate;

  const save = async () => {
    if (!valid || saving) return;
    if (goal.deadlineISO && dueDate > goal.deadlineISO) {
      setError(
        `O prazo não pode ser depois do prazo do plano (${formatDateBR(goal.deadlineISO)}).`,
      );
      return;
    }
    setError("");
    setSaving(true);
    try {
      await createExecution({
        title: title.trim(),
        dueDate,
        plannedStartDate: plannedStart,
        plannedEndDate: plannedEnd,
        category: goal.category,
        weight: "medio",
        goalId: goal.id,
        stepId: step.id,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Nova ação">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{step.title}</p>
      <label className="mt-2 block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          O que precisa ser feito?
        </span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Pesquisar três concorrentes"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
        />
      </label>
      <div className="mt-3">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Intervalo no cronograma
        </span>
        <div className="grid grid-cols-2 gap-2">
          <DateField
            value={plannedStart}
            onChange={setPlannedStart}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-3 text-left text-xs outline-none focus:border-primary"
          />
          <DateField
            value={plannedEnd}
            onChange={setPlannedEnd}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-3 text-left text-xs outline-none focus:border-primary"
          />
        </div>
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Prazo
        </span>
        <DateField
          value={dueDate}
          onChange={setDueDate}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-left text-sm outline-none focus:border-primary"
        />
      </label>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      <button
        disabled={!valid || saving}
        onClick={save}
        className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Criando…" : "Criar ação"}
      </button>
    </Modal>
  );
}
