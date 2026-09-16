import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  currentBodyWeight,
  maxWeightAtReps,
  useWorkoutStore,
  volumeForLineage,
} from "@/lib/workout-store";
import {
  createCycleGoal,
  cycleGoalKindLabel,
  finishedSessionsHint,
  type CycleBlock,
  type CycleGoalKind,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";

// ---------------------------------------------------------------------------
// Criação de meta. O ponto de partida é PRÉ-PREENCHIDO com o dado real quando
// ele existe — uma meta cujo início é chutado mede uma evolução que não houve.
// ---------------------------------------------------------------------------

const KINDS: CycleGoalKind[] = ["carga", "peso_corporal", "series_reps", "frequencia"];

export function CycleGoalModal({
  cycle,
  blocks,
  onClose,
}: {
  cycle: WorkoutCycle;
  blocks: CycleBlock[];
  onClose: () => void;
}) {
  const exercises = useWorkoutStore((s) => s.exercises);
  const sessions = useWorkoutStore((s) => s.sessions);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);

  const [kind, setKind] = useState<CycleGoalKind>("carga");
  const [blockId, setBlockId] = useState<string>("");
  const [lineageId, setLineageId] = useState("");
  const [referenceReps, setReferenceReps] = useState(8);
  const [target, setTarget] = useState("");
  const [startOverride, setStartOverride] = useState<string | null>(null);
  const action = useAsyncAction();

  // Um exercício por linhagem: a mesma "Remada" copiada em três blocos é uma
  // opção só, não três.
  const options = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of [...exercises].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!seen.has(e.lineageId)) seen.set(e.lineageId, e.name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [exercises]);

  const exerciseLabel = options.find((o) => o.id === lineageId)?.name;

  const measured = useMemo(() => {
    if (kind === "peso_corporal") return currentBodyWeight(bodyWeights)?.weight ?? 0;
    if (kind === "carga" && lineageId)
      return maxWeightAtReps(sessions, exercises, lineageId, referenceReps);
    if (kind === "series_reps" && lineageId)
      return volumeForLineage(sessions, exercises, lineageId).sets;
    if (kind === "frequencia") return 0;
    return 0;
  }, [kind, lineageId, referenceReps, sessions, exercises, bodyWeights]);

  const startValue = startOverride !== null ? Number(startOverride) || 0 : measured;
  const unit =
    kind === "carga" || kind === "peso_corporal"
      ? "kg"
      : kind === "series_reps"
        ? "séries"
        : "treinos";
  const needsExercise = kind === "carga" || kind === "series_reps";
  const canSave = target.trim() !== "" && (!needsExercise || Boolean(lineageId));

  return (
    <Modal
      onClose={onClose}
      title="Nova meta"
      footer={
        <div className="space-y-2">
          {action.error && <InlineError message={action.error} onRetry={action.clearError} />}
          <button
            disabled={!canSave || action.pending}
            onClick={() =>
              action.run(async () => {
                await createCycleGoal({
                  cycleId: cycle.id,
                  blockId: blockId || undefined,
                  kind,
                  exerciseLineageId: needsExercise ? lineageId : undefined,
                  exerciseLabel: needsExercise ? exerciseLabel : undefined,
                  referenceReps: kind === "carga" ? referenceReps : undefined,
                  startValue,
                  targetValue: Number(target) || 0,
                  unit,
                  deadline: blockId ? blocks.find((b) => b.id === blockId)?.endDate : cycle.endDate,
                });
                onClose();
              })
            }
            className="interactive-press w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {action.pending ? "Salvando…" : "Salvar meta"}
          </button>
        </div>
      }
    >
      <fieldset>
        <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          O que medir
        </legend>
        <div className="grid grid-cols-2 gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setStartOverride(null);
              }}
              aria-pressed={kind === k}
              className={`interactive-press rounded-lg border px-2 py-2 text-[11px] font-semibold ${
                kind === k
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface-2"
              }`}
            >
              {cycleGoalKindLabel[k]}
            </button>
          ))}
        </div>
      </fieldset>

      {needsExercise && (
        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Exercício
          </span>
          <select
            value={lineageId}
            onChange={(e) => {
              setLineageId(e.target.value);
              setStartOverride(null);
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Escolha…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Cadastre um exercício antes de criar uma meta de carga.
            </span>
          )}
        </label>
      )}

      {kind === "carga" && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Repetições de referência
          </span>
          <input
            type="number"
            min={1}
            value={referenceReps}
            onChange={(e) => {
              setReferenceReps(Math.max(1, Number(e.target.value) || 1));
              setStartOverride(null);
            }}
            className="w-24 rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums outline-none focus:border-primary"
          />
          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
            80kg×3 e 80kg×10 não são o mesmo resultado. Só séries com pelo menos {referenceReps}{" "}
            repetições contam para esta meta.
          </span>
        </label>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ponto de partida
          </span>
          <input
            type="number"
            value={startOverride !== null ? startOverride : String(measured)}
            onChange={(e) => setStartOverride(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Alvo ({unit})
          </span>
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {measured > 0
          ? `Ponto de partida vem do seu registro real (${measured}${unit === "kg" ? "kg" : ` ${unit}`}).`
          : finishedSessionsHint(kind)}
      </p>

      {blocks.length > 0 && (
        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Vale para
          </span>
          <select
            value={blockId}
            onChange={(e) => setBlockId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">O ciclo inteiro</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </Modal>
  );
}
