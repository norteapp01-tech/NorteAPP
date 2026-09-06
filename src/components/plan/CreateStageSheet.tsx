import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import { addStep, formatDateBR, type Goal } from "@/lib/goals-store";

/** Nova etapa — modal centralizado, sem formulário permanente na tela.
 * Usa a mesma `addStep` de sempre; a ordenação já é feita pelo store. */
export function CreateStageSheet({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || saving) return;
    if (goal.deadlineISO && targetDate && targetDate > goal.deadlineISO) {
      setError(
        `Essa etapa não pode ter prazo depois do prazo do plano (${formatDateBR(goal.deadlineISO)}).`,
      );
      return;
    }
    setError("");
    setSaving(true);
    try {
      await addStep(goal.id, title.trim(), targetDate || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Nova etapa">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Nome da etapa
        </span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Terminar capítulo 3"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Realizar esta etapa até
        </span>
        <DateField
          value={targetDate}
          onChange={(v) => {
            setTargetDate(v);
            setError("");
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-left text-sm outline-none focus:border-primary"
        />
      </label>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold"
        >
          Cancelar
        </button>
        <button
          disabled={!title.trim() || saving}
          onClick={save}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Criando…" : "Criar"}
        </button>
      </div>
    </Modal>
  );
}
