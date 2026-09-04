import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { weekVisualLabels, weekVisualOrder } from "@/components/sub-agenda-shared";
import {
  createSpiritualActivity,
  updateSpiritualActivity,
  kindLabel,
  type SpiritualActivity,
  type SpiritualActivityKind,
} from "@/lib/fe-store";

/** Compartilhado por Momento com Deus, Oração, Leitura bíblica, Culto, Célula, Discipulado, Serviço e Propósito. */
export function SpiritualActivitySetup({
  kind,
  existing,
  initialTitle,
  onClose,
  onSaved,
}: {
  kind: SpiritualActivityKind;
  existing?: SpiritualActivity;
  initialTitle?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? kindLabel[kind]);
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? [1, 2, 3, 4, 5]);
  const [time, setTime] = useState(existing?.time ?? "07:30");
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleDay = (d: number) => {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  };

  const save = async () => {
    if (weekdays.length === 0 || !title.trim() || saving) return;
    setSaving(true);
    setError("");
    const input = {
      title: title.trim(),
      weekdays,
      time,
      durationMinutes: parseInt(duration, 10) || undefined,
    };
    try {
      if (existing) {
        await updateSpiritualActivity(existing.id, input);
        onSaved?.(existing.id);
      } else {
        const id = await createSpiritualActivity({ kind, ...input });
        onSaved?.(id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={kindLabel[kind]}>
      <label className="block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Nome</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {weekVisualOrder.map((d, i) => (
          <button
            key={d}
            onClick={() => toggleDay(d)}
            className={`rounded-lg py-2 text-[11px] font-bold ${weekdays.includes(d) ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
          >
            {weekVisualLabels[i]}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Horário</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Duração (min)
          </span>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      <button
        onClick={save}
        disabled={weekdays.length === 0 || !title.trim() || saving}
        className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </Modal>
  );
}
