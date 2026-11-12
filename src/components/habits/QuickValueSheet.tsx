import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { NumberField } from "@/components/ui/number-field";
import { InlineError } from "@/components/ui/inline-error";
import { todayISO } from "@/lib/goals-store";
import { logHabit, newKey, undoLog } from "@/lib/habits/store";
import { versionAt } from "@/lib/habits/engine";
import { formatAmount } from "@/lib/habits/units";
import type { Feeling, Habit } from "@/lib/habits/types";
import { stepsFor } from "@/lib/habits/format";
import type { LogDone } from "./HabitRow";

const FEELINGS: { value: Feeling; label: string }[] = [
  { value: "leve", label: "Leve" },
  { value: "neutro", label: "Neutro" },
  { value: "pesado", label: "Pesado" },
];

/** Informar um valor (ou várias sessões do dia) com nota, sensação e checklist. */
export function QuickValueSheet({
  habit,
  date: initialDate,
  onClose,
  onDone,
}: {
  habit: Habit;
  date: string;
  onClose: () => void;
  onDone: LogDone;
}) {
  const today = todayISO();
  const unit = habit.measure === "duration" ? "min" : habit.unit;
  const version = versionAt(habit, initialDate) ?? habit.versions[habit.versions.length - 1];
  const [date, setDate] = useState(initialDate);
  const [value, setValue] = useState<number | null>(
    habit.measure === "binary" ? 1 : stepsFor(habit)[0],
  );
  const [note, setNote] = useState("");
  const [feeling, setFeeling] = useState<Feeling | undefined>();
  const [checks, setChecks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [key] = useState(newKey); // a mesma tentativa repetida não duplica

  const reduction = habit.intent !== "build";
  const canZero = reduction;
  const valid = value !== null && value >= 0 && (canZero || value > 0);

  const save = async () => {
    if (!valid || saving || value === null) return;
    setSaving(true);
    setError(null);
    try {
      const log = await logHabit({ habitId: habit.id, date, value, note, feeling, checks, key });
      onDone(
        log.pending
          ? "Guardado neste aparelho. Aguardando conexão."
          : `${habit.name}: ${formatAmount(value, unit)} registrado.`,
        () => undoLog(log.id),
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar. Tente de novo.");
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      title={habit.name}
      footer={
        <button
          type="button"
          onClick={save}
          disabled={!valid || saving}
          className="interactive-press min-h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Registrando…" : "Registrar"}
        </button>
      }
    >
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            Dia
          </span>
          <input
            type="date"
            value={date}
            min={habit.startDate}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
          {date !== today && (
            <span className="mt-1 block text-[11px] text-primary">
              Registrando em um dia anterior.
            </span>
          )}
        </label>

        {habit.measure !== "binary" && (
          <div>
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              {reduction ? "Quanto" : "Quanto você fez"}
              {unit ? ` (${unit})` : ""}
            </span>
            <NumberField
              value={value ?? 0}
              onValue={(v) => setValue(v)}
              onEmpty={() => setValue(null)}
              aria-label={`Valor${unit ? ` em ${unit}` : ""}`}
              className="min-h-14 w-full rounded-2xl border border-border bg-background/55 px-4 text-center font-mono text-2xl font-bold tabular-nums outline-none focus:border-primary"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {stepsFor(habit).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue((v) => Math.round(((v ?? 0) + s) * 100) / 100)}
                  className="interactive-press min-h-10 rounded-full border border-border px-3.5 text-xs font-semibold text-muted-foreground"
                >
                  +{String(s).replace(".", ",")}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Vários registros no mesmo dia se somam — cada um fica guardado separado.
            </p>
          </div>
        )}

        {version && version.checklist.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Checklist
            </legend>
            <div className="space-y-1.5">
              {version.checklist.map((item) => (
                <label
                  key={item.id}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3"
                >
                  <input
                    type="checkbox"
                    checked={checks.includes(item.id)}
                    onChange={(e) =>
                      setChecks((c) =>
                        e.target.checked ? [...c, item.id] : c.filter((x) => x !== item.id),
                      )
                    }
                    className="h-5 w-5 accent-primary"
                  />
                  <span className="text-sm">{item.title}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <details className="rounded-xl border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Nota e como foi (opcional)
          </summary>
          <div className="mt-3 space-y-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Alguma observação"
              aria-label="Nota"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div role="group" aria-label="Como foi?" className="flex gap-2">
              {FEELINGS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={feeling === f.value}
                  onClick={() => setFeeling((cur) => (cur === f.value ? undefined : f.value))}
                  className={`interactive-press min-h-10 rounded-full border px-4 text-xs font-semibold ${
                    feeling === f.value
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </details>

        {error && <InlineError message={error} />}
      </div>
    </Modal>
  );
}
