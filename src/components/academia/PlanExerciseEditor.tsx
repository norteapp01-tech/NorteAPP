import { useState } from "react";
import { ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  useWorkoutStore,
  exercisesForPlan,
  addExercise,
  removeExercise,
  reorderExercise,
  type SetTarget,
} from "@/lib/workout-store";

/** Editor de exercícios de um treino: ordem, exclusão e configuração por série
 * (kg, reps e descanso de CADA série, não um valor só pro exercício inteiro).
 *
 * Vive fora da rota porque o ciclo de treino edita os treinos dos blocos com o
 * mesmo editor — duas cópias divergiriam na primeira mudança. */
export function PlanExerciseEditor({ planId }: { planId: string }) {
  const exercises = useWorkoutStore((s) => exercisesForPlan(s.exercises, planId));
  const [showAdd, setShowAdd] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [form, setForm] = useState({
    name: "",
    setsTarget: "4",
    setTargets: Array.from({ length: 4 }, () => ({
      reps: 10,
      weight: 20,
      restSeconds: 90,
    })) as SetTarget[],
  });

  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
      {exercises.map((ex, i) => (
        <div key={ex.id} className="flex items-center gap-2 rounded-lg bg-surface p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{ex.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {ex.setsTarget}x{ex.repsTarget} · {ex.loadTarget}kg · desc. {ex.restSeconds}s
            </p>
          </div>
          <button
            disabled={i === 0}
            onClick={async () => {
              await reorderExercise(ex.id, "up", exercises);
            }}
            className="text-muted-foreground hover:text-primary disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            disabled={i === exercises.length - 1}
            onClick={async () => {
              await reorderExercise(ex.id, "down", exercises);
            }}
            className="text-muted-foreground hover:text-primary disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={async () => {
              await removeExercise(ex.id);
            }}
            className="text-muted-foreground hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-3 w-3" /> exercício
        </button>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-border bg-surface p-2">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome do exercício"
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <div className="grid grid-cols-1 gap-1.5">
            <NumField
              label="séries"
              value={form.setsTarget}
              onChange={(v) => {
                const count = Math.max(1, Math.min(12, parseInt(v, 10) || 1));
                setForm({
                  ...form,
                  setsTarget: v,
                  setTargets: Array.from(
                    { length: count },
                    (_, i) =>
                      form.setTargets[i] ??
                      form.setTargets.at(-1) ?? { reps: 10, weight: 20, restSeconds: 90 },
                  ),
                });
              }}
            />
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-[44px_1fr_1fr_1fr] gap-1 text-[9px] uppercase text-muted-foreground">
              <span></span>
              <span>kg</span>
              <span>reps</span>
              <span>desc.</span>
            </div>
            {form.setTargets.map((target, index) => (
              <div key={index} className="grid grid-cols-[44px_1fr_1fr_1fr] items-center gap-1">
                <span className="text-[10px] text-muted-foreground">Série {index + 1}</span>
                {(["weight", "reps", "restSeconds"] as const).map((field) => (
                  <input
                    key={field}
                    type="number"
                    value={target[field]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        setTargets: form.setTargets.map((item, i) =>
                          i === index ? { ...item, [field]: Number(e.target.value) } : item,
                        ),
                      })
                    }
                    className="min-w-0 rounded-md border border-border bg-surface-2 px-1.5 py-1.5 text-xs outline-none focus:border-primary"
                  />
                ))}
              </div>
            ))}
          </div>
          <button
            disabled={addingExercise}
            onClick={async () => {
              if (addingExercise || !form.name.trim()) return;
              setAddingExercise(true);
              try {
                await addExercise(planId, {
                  name: form.name.trim(),
                  setsTarget: parseInt(form.setsTarget, 10) || 1,
                  repsTarget: form.setTargets[0]?.reps ?? 1,
                  loadTarget: form.setTargets[0]?.weight ?? 0,
                  restSeconds: form.setTargets[0]?.restSeconds ?? 60,
                  setTargets: form.setTargets,
                });
                setForm({
                  name: "",
                  setsTarget: "4",
                  setTargets: Array.from({ length: 4 }, () => ({
                    reps: 10,
                    weight: 20,
                    restSeconds: 90,
                  })),
                });
                setShowAdd(false);
              } finally {
                setAddingExercise(false);
              }
            }}
            className="w-full rounded-md bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-primary"
      />
    </label>
  );
}
