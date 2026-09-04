import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { weekVisualLabels, weekVisualOrder } from "@/components/sub-agenda-shared";
import { setReadingRoutine, routineFor, useReadingStore, type Book } from "@/lib/reading-store";

export function ReadingRoutineSetup({ book, onClose }: { book: Book; onClose: () => void }) {
  const existing = useReadingStore((s) => routineFor(s.routines, book.id));
  const [weekdays, setWeekdays] = useState<number[]>(existing?.weekdays ?? [1, 2, 3, 4, 5]);
  const [time, setTime] = useState(existing?.time ?? "21:00");
  const [duration, setDuration] = useState(String(existing?.desiredDurationMinutes ?? 20));
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) => {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  };

  const save = async () => {
    if (weekdays.length === 0 || saving) return;
    setSaving(true);
    try {
      await setReadingRoutine(book.id, {
        weekdays,
        time,
        desiredDurationMinutes: parseInt(duration, 10) || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Rotina de leitura">
      <p className="text-xs text-muted-foreground">{book.title}</p>

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
            Duração desejada (min)
          </span>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>

      <button
        onClick={save}
        disabled={weekdays.length === 0 || saving}
        className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Salvando…" : "Salvar rotina"}
      </button>
    </Modal>
  );
}
