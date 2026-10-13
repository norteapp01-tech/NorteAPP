import { PERIOD_LABELS, type Period, type PeriodKey } from "@/lib/mirror-analytics";

const KEYS: PeriodKey[] = ["7d", "30d", "3m", "custom"];

export function PeriodPicker({
  value,
  onChange,
  custom,
  onCustom,
  today,
}: {
  value: PeriodKey;
  onChange: (key: PeriodKey) => void;
  custom: Period;
  onCustom: (p: Period) => void;
  today: string;
}) {
  return (
    <div>
      <div role="tablist" aria-label="Período" className="flex flex-wrap gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={value === k}
            onClick={() => onChange(k)}
            className={`interactive-press min-h-9 shrink-0 rounded-full border px-3.5 text-xs font-semibold ${
              value === k
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {PERIOD_LABELS[k]}
          </button>
        ))}
      </div>
      {value === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            De
            <input
              type="date"
              value={custom.from}
              max={custom.to}
              onChange={(e) => e.target.value && onCustom({ from: e.target.value, to: custom.to })}
              className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Até
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              max={today}
              onChange={(e) =>
                e.target.value && onCustom({ from: custom.from, to: e.target.value })
              }
              className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-foreground"
            />
          </label>
        </div>
      )}
    </div>
  );
}
