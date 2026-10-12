import { useMemo, useState } from "react";
import { DateField } from "@/components/ui/date-wheel-picker";
import { NumberField } from "@/components/ui/number-field";
import {
  describeRule,
  normalizeRule,
  presetRules,
  weekdayOf,
  weekdayShortLabel,
  type RecurrenceFreq,
  type RecurrenceRule,
} from "@/lib/agenda-recurrence";
import "./agenda-ui.css";

type EndMode = "never" | "until" | "count";

const FREQ_LABEL: Record<RecurrenceFreq, string> = {
  daily: "dia(s)",
  weekly: "semana(s)",
  monthly: "mês(es)",
  yearly: "ano(s)",
};

function samePreset(a: RecurrenceRule, b: RecurrenceRule) {
  const na = normalizeRule(a);
  const nb = normalizeRule(b);
  return (
    na.freq === nb.freq &&
    na.interval === nb.interval &&
    JSON.stringify(na.byWeekday ?? []) === JSON.stringify(nb.byWeekday ?? []) &&
    !na.until &&
    !na.count
  );
}

/** "Repetir": nunca, atalhos comuns ou personalizado (intervalo, dias da
 * semana, fim por data ou por quantidade). */
export function RecurrenceEditor({
  startDate,
  value,
  onChange,
}: {
  startDate: string;
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
}) {
  const presets = useMemo(() => presetRules(startDate), [startDate]);
  const matched = value ? presets.find((p) => samePreset(p.rule, value)) : undefined;
  const [custom, setCustom] = useState(Boolean(value && !matched));
  const endMode: EndMode = value?.until ? "until" : value?.count ? "count" : "never";

  const update = (patch: Partial<RecurrenceRule>) =>
    onChange(normalizeRule({ ...(value ?? { freq: "weekly", interval: 1 }), ...patch }));

  const setEnd = (mode: EndMode) => {
    if (!value) return;
    const next: RecurrenceRule = { ...value, until: undefined, count: undefined };
    if (mode === "until") next.until = startDate;
    if (mode === "count") next.count = 10;
    onChange(normalizeRule(next));
  };

  return (
    <div className="space-y-3">
      <div className="agenda-chips" role="radiogroup" aria-label="Repetição">
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          aria-pressed={!value}
          className="agenda-chip"
          onClick={() => {
            setCustom(false);
            onChange(null);
          }}
        >
          Não repete
        </button>
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={matched?.id === p.id && !custom}
            aria-pressed={matched?.id === p.id && !custom}
            className="agenda-chip"
            onClick={() => {
              setCustom(false);
              onChange(normalizeRule({ ...p.rule, until: value?.until, count: value?.count }));
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          aria-pressed={custom}
          className="agenda-chip"
          onClick={() => {
            setCustom(true);
            if (!value)
              onChange({ freq: "weekly", interval: 1, byWeekday: [weekdayOf(startDate)] });
          }}
        >
          Personalizado
        </button>
      </div>

      {value && custom && (
        <div className="card-surface-quiet space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>A cada</span>
            <NumberField
              integer
              value={value.interval}
              min={1}
              max={99}
              aria-label="Intervalo"
              onValue={(n) => update({ interval: Math.max(1, n) })}
              className="w-16 rounded-lg border border-border bg-surface px-2 py-2 text-center text-sm outline-none focus:border-primary"
            />
            <select
              value={value.freq}
              aria-label="Unidade"
              onChange={(e) => {
                const freq = e.target.value as RecurrenceFreq;
                update({
                  freq,
                  byWeekday: freq === "weekly" ? [weekdayOf(startDate)] : undefined,
                  byMonthDay: undefined,
                });
              }}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-primary"
            >
              {(Object.keys(FREQ_LABEL) as RecurrenceFreq[]).map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </div>

          {value.freq === "weekly" && (
            <div className="flex gap-1.5" role="group" aria-label="Dias da semana">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const on = (value.byWeekday ?? [weekdayOf(startDate)]).includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const current = value.byWeekday ?? [weekdayOf(startDate)];
                      const next = on ? current.filter((x) => x !== d) : [...current, d];
                      if (next.length > 0) update({ byWeekday: next });
                    }}
                    className={`flex h-10 flex-1 items-center justify-center rounded-lg border text-[11px] font-semibold ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {weekdayShortLabel(d)}
                  </button>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Termina
            </p>
            <div className="agenda-chips" role="radiogroup" aria-label="Fim da repetição">
              {(
                [
                  ["never", "Nunca"],
                  ["until", "Em uma data"],
                  ["count", "Depois de N vezes"],
                ] as [EndMode, string][]
              ).map(([mode, text]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={endMode === mode}
                  aria-pressed={endMode === mode}
                  className="agenda-chip"
                  onClick={() => setEnd(mode)}
                >
                  {text}
                </button>
              ))}
            </div>
            {endMode === "until" && (
              <DateField
                label="Até"
                value={value.until ?? startDate}
                minISO={startDate}
                onChange={(iso) => update({ until: iso })}
              />
            )}
            {endMode === "count" && (
              <label className="flex items-center gap-2 text-sm">
                <NumberField
                  integer
                  value={value.count ?? 10}
                  min={1}
                  aria-label="Quantidade de ocorrências"
                  onValue={(n) => update({ count: Math.max(1, n) })}
                  className="w-20 rounded-lg border border-border bg-surface px-2 py-2 text-center text-sm outline-none focus:border-primary"
                />
                vezes
              </label>
            )}
          </div>
        </div>
      )}

      {value && (
        <p className="text-[11px] text-muted-foreground">{describeRule(value, startDate)}</p>
      )}
    </div>
  );
}
