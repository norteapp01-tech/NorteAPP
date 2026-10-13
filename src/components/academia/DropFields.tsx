import { ArrowDownToLine } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";

export type DropDraft = { weight: string; reps: string };

/** Sugestão de drop a partir da série que está sendo feita: um peso mais leve
 * e metade das repetições. É só ponto de partida; a pessoa ajusta. */
export function suggestDrop(weight: number, reps: number): DropDraft {
  return {
    weight: String(Math.max(0, Math.round(weight * 0.75))),
    reps: String(Math.max(1, Math.round(reps / 2))),
  };
}

/** "Com drop": liga o drop DESTA série. Os campos do drop aparecem logo abaixo
 * e o mesmo check que registra a série registra também o drop — um registro
 * só, na cor do Norte (sem um segundo check nem uma segunda cor). */
export function DropToggle({
  on,
  onToggle,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      disabled={disabled}
      className={`interactive-press inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-semibold disabled:opacity-40 ${
        on
          ? "border-primary/60 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/50"
      }`}
    >
      <ArrowDownToLine className="h-3.5 w-3.5" /> {on ? "Com drop" : "Drop"}
    </button>
  );
}

export function DropInputs({
  value,
  onChange,
  compact,
}: {
  value: DropDraft;
  onChange: (next: DropDraft) => void;
  compact?: boolean;
}) {
  const input = compact
    ? "w-16 rounded-xl border border-border bg-background/45 px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
    : "w-full min-w-0 rounded-xl border border-border bg-background/55 px-2 py-2.5 text-center font-mono text-lg font-bold tabular-nums outline-none focus:border-primary";
  return (
    <div
      className={`flex items-end justify-center gap-2.5 rounded-2xl border border-primary/30 bg-primary/5 ${compact ? "mt-1 px-3 py-2" : "mt-2 p-3"}`}
    >
      <label className="flex-1">
        <span className="mb-1 block text-center text-[11px] font-semibold text-primary">
          Drop · peso (kg)
        </span>
        <NumberField
          value={parseFloat(value.weight) || 0}
          onValue={(v) => onChange({ ...value, weight: String(v) })}
          onEmpty={() => onChange({ ...value, weight: "0" })}
          aria-label="Peso do drop"
          className={input}
        />
      </label>
      <label className="flex-1">
        <span className="mb-1 block text-center text-[11px] text-muted-foreground">Repetições</span>
        <NumberField
          integer
          value={parseInt(value.reps, 10) || 0}
          onValue={(v) => onChange({ ...value, reps: String(v) })}
          onEmpty={() => onChange({ ...value, reps: "0" })}
          aria-label="Repetições do drop"
          className={input}
        />
      </label>
    </div>
  );
}
