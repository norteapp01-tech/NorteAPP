import { useState } from "react";
import { X } from "lucide-react";
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
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-md rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Rotina de leitura</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{book.title}</p>

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
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              Horário
            </span>
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
      </div>
    </div>
  );
}
