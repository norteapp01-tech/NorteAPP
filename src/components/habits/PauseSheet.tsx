import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { todayISO } from "@/lib/goals-store";
import { createPause, resumePause } from "@/lib/habits/store";
import type { Habit, Pause } from "@/lib/habits/types";

type Scope = "habit" | "area" | "global";

/** Pausar uma rotina, uma área ou tudo — sem falha artificial. */
export function PauseSheet({
  habits,
  pauses,
  habit,
  onClose,
}: {
  habits: Habit[];
  pauses: Pause[];
  /** Rotina pré-selecionada (a partir do detalhe). */
  habit?: Habit;
  onClose: () => void;
}) {
  const today = todayISO();
  const areas = [
    ...new Set(habits.filter((h) => !h.archivedAt && h.area).map((h) => h.area as string)),
  ];
  const [scope, setScope] = useState<Scope>(habit ? "habit" : "global");
  const [area, setArea] = useState(areas[0] ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const active = pauses.filter((p) => !p.endDate || p.endDate >= today);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (scope === "habit" && !habit) throw new Error("Escolha a rotina.");
      if (scope === "area" && !area) throw new Error("Escolha a área.");
      await createPause({
        scope,
        habitId: habit?.id,
        area,
        startDate: start,
        endDate: end || undefined,
        reason,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível pausar.");
      setSaving(false);
    }
  };

  const nameOf = (p: Pause) =>
    p.scope === "global"
      ? "Todas as rotinas"
      : p.scope === "area"
        ? `Área ${p.area}`
        : (habits.find((h) => h.id === p.habitId)?.name ?? "Rotina");

  return (
    <Modal
      onClose={onClose}
      title="Pausar"
      footer={
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="interactive-press min-h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Pausando…" : "Pausar"}
        </button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Dias em pausa não contam como falha nem como sucesso, e os lembretes ficam quietos. Seus
          compromissos da Agenda e eventos externos não são alterados.
        </p>

        {active.length > 0 && (
          <section aria-label="Pausas em andamento">
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Em andamento
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {active.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nameOf(p)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      desde {p.startDate.split("-").reverse().join("/")}
                      {p.endDate
                        ? ` até ${p.endDate.split("-").reverse().join("/")}`
                        : " · sem data final"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void resumePause(p, today)}
                    className="interactive-press min-h-10 rounded-full border border-primary/50 px-3 text-xs font-semibold text-primary"
                  >
                    Retomar agora
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div role="radiogroup" aria-label="O que pausar" className="grid grid-cols-3 gap-2">
          {(
            [
              ["global", "Tudo"],
              ["area", "Uma área"],
              ["habit", "Esta rotina"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={scope === id}
              disabled={id === "habit" && !habit}
              onClick={() => setScope(id)}
              className={`interactive-press min-h-11 rounded-xl border text-xs font-semibold disabled:opacity-40 ${
                scope === id
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {scope === "area" &&
          (areas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma rotina tem área definida ainda.</p>
          ) : (
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              aria-label="Área"
              className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
            >
              {areas.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          ))}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted-foreground">
            De
            <input
              type="date"
              value={start}
              onChange={(e) => e.target.value && setStart(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Até (opcional)
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
            />
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">
          Motivo (opcional)
          <input
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Viagem, recuperação…"
            className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
          />
        </label>
        {error && <InlineError message={error} />}
      </div>
    </Modal>
  );
}
