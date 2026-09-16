import { useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { addExerciseToPlans } from "@/lib/workout-cycle-store";
import type { SetTarget, WorkoutPlan } from "@/lib/workout-store";

// ---------------------------------------------------------------------------
// Adicionar o MESMO exercício a vários treinos de uma vez — "duas séries de
// abdominal nos treinos A até E".
//
// Os destinos ficam à vista antes de gravar, e um treino que já tem um
// exercício com esse nome é deixado como está e reportado depois: acrescentar
// em silêncio criaria duplicata que ninguém pediu.
// ---------------------------------------------------------------------------

export function BulkExerciseModal({
  plans,
  onClose,
}: {
  plans: WorkoutPlan[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>(plans.map((p) => p.id));
  const [sets, setSets] = useState(2);
  const [targets, setTargets] = useState<SetTarget[]>([
    { reps: 15, weight: 0, restSeconds: 45 },
    { reps: 15, weight: 0, restSeconds: 45 },
  ]);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const action = useAsyncAction();

  const setCount = (next: number) => {
    const count = Math.max(1, Math.min(12, next));
    setSets(count);
    setTargets((list) =>
      Array.from(
        { length: count },
        (_, i) => list[i] ?? list.at(-1) ?? { reps: 15, weight: 0, restSeconds: 45 },
      ),
    );
  };

  const toggle = (id: string) =>
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <Modal
      onClose={onClose}
      title="Exercício em vários treinos"
      footer={
        <div className="space-y-2">
          {action.error && <InlineError message={action.error} onRetry={action.clearError} />}
          {result && (
            <p className="text-center text-[11px] text-muted-foreground">
              {result.added > 0
                ? `Adicionado em ${result.added} ${result.added === 1 ? "treino" : "treinos"}.`
                : "Nenhum treino recebeu o exercício."}
              {result.skipped > 0 &&
                ` ${result.skipped} já tinha um exercício com esse nome e ficou como estava.`}
            </p>
          )}
          <button
            disabled={action.pending || !name.trim() || selected.length === 0}
            onClick={() =>
              action.run(async () => {
                const res = await addExerciseToPlans(selected, {
                  name: name.trim(),
                  setsTarget: sets,
                  repsTarget: targets[0]?.reps ?? 10,
                  loadTarget: targets[0]?.weight ?? 0,
                  restSeconds: targets[0]?.restSeconds ?? 60,
                  setTargets: targets,
                });
                setResult({ added: res.added, skipped: res.skipped.length });
              })
            }
            className="interactive-press w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {action.pending
              ? "Adicionando…"
              : `Adicionar em ${selected.length} ${selected.length === 1 ? "treino" : "treinos"}`}
          </button>
        </div>
      }
    >
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Exercício
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setResult(null);
          }}
          placeholder="Ex: Abdominal infra"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="mt-3">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Séries
        </span>
        <input
          type="number"
          min={1}
          max={12}
          value={sets}
          onChange={(e) => setCount(Number(e.target.value) || 1)}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-primary"
        />
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="grid grid-cols-[44px_1fr_1fr_1fr] gap-1 text-[9px] uppercase text-muted-foreground">
          <span />
          <span>kg</span>
          <span>reps</span>
          <span>desc.</span>
        </div>
        {targets.map((target, index) => (
          <div key={index} className="grid grid-cols-[44px_1fr_1fr_1fr] items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Série {index + 1}</span>
            {(["weight", "reps", "restSeconds"] as const).map((field) => (
              <input
                key={field}
                type="number"
                value={target[field]}
                onChange={(e) =>
                  setTargets((list) =>
                    list.map((item, i) =>
                      i === index ? { ...item, [field]: Number(e.target.value) } : item,
                    ),
                  )
                }
                className="min-w-0 rounded-md border border-border bg-surface-2 px-1.5 py-1.5 text-xs outline-none focus:border-primary"
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Em quais treinos
        </span>
        <ul className="space-y-1">
          {plans.map((plan) => {
            const on = selected.includes(plan.id);
            return (
              <li key={plan.id}>
                <button
                  onClick={() => toggle(plan.id)}
                  aria-pressed={on}
                  className={`interactive-press flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs ${
                    on ? "border-primary/50 bg-primary/10" : "border-border bg-surface-2"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="font-bold text-primary">{plan.letter}</span>
                  <span className="min-w-0 flex-1 truncate">{plan.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Cada treino recebe a sua própria linha, editável separadamente. Os registros de todos eles
        alimentam a mesma curva de evolução deste exercício.
      </p>
    </Modal>
  );
}
