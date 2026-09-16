import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { todayISO } from "@/lib/goals-store";
import {
  currentBodyWeight,
  maxWeightForSetsReps,
  useWorkoutStore,
  volumeForLineage,
} from "@/lib/workout-store";
import {
  addMeasurement,
  createCycleGoal,
  cycleGoalKindLabel,
  isManualGoal,
  useCycleStore,
  type CycleBlock,
  type CycleGoalKind,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";

// ---------------------------------------------------------------------------
// Criação de meta.
//
// O ponto de partida é pré-preenchido com o dado REAL quando existe. O que o
// app não consegue medir — circunferência, percentual de gordura, intenções —
// fica marcado como manual, com método e data da medição. Nada é deduzido: uma
// vontade de "reduzir gordura" não vira uma porcentagem inventada.
// ---------------------------------------------------------------------------

const KINDS: CycleGoalKind[] = [
  "carga",
  "series_reps",
  "peso_corporal",
  "frequencia",
  "medida_corporal",
  "descritiva",
];

const unitFor: Record<CycleGoalKind, string> = {
  carga: "kg",
  series_reps: "séries",
  peso_corporal: "kg",
  frequencia: "treinos",
  medida_corporal: "cm",
  descritiva: "",
};

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
  const measurements = useCycleStore((s) => s.measurements);

  const [kind, setKind] = useState<CycleGoalKind>("carga");
  const [title, setTitle] = useState("");
  const [blockId, setBlockId] = useState<string>("");
  const [lineageId, setLineageId] = useState("");
  const [measureLabel, setMeasureLabel] = useState("");
  const [method, setMethod] = useState("");
  const [measuredAt, setMeasuredAt] = useState(todayISO());
  const [referenceReps, setReferenceReps] = useState(10);
  const [referenceSets, setReferenceSets] = useState(3);
  const [unit, setUnit] = useState(unitFor.carga);
  const [target, setTarget] = useState("");
  const [startOverride, setStartOverride] = useState<string | null>(null);
  const action = useAsyncAction();

  // Um exercício por linhagem: a mesma "Remada" copiada em três etapas é uma
  // opção só, não três.
  const options = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of [...exercises].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!seen.has(e.lineageId)) seen.set(e.lineageId, e.name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [exercises]);

  const knownLabels = useMemo(() => [...new Set(measurements.map((m) => m.label))], [measurements]);
  const exerciseName = options.find((o) => o.id === lineageId)?.name;
  const needsExercise = kind === "carga" || kind === "series_reps";
  const manual = isManualGoal(kind);

  const measured = useMemo(() => {
    if (kind === "peso_corporal") return currentBodyWeight(bodyWeights)?.weight ?? 0;
    if (kind === "carga" && lineageId)
      return maxWeightForSetsReps(sessions, exercises, lineageId, referenceReps, referenceSets);
    if (kind === "series_reps" && lineageId)
      return volumeForLineage(sessions, exercises, lineageId).sets;
    return 0;
  }, [kind, lineageId, referenceReps, referenceSets, sessions, exercises, bodyWeights]);

  const startValue = startOverride !== null ? Number(startOverride) || 0 : measured;
  const canSave =
    title.trim() !== "" &&
    (kind === "descritiva" || target.trim() !== "") &&
    (!needsExercise || Boolean(lineageId)) &&
    (kind !== "medida_corporal" || measureLabel.trim() !== "");

  const changeKind = (next: CycleGoalKind) => {
    setKind(next);
    setUnit(unitFor[next]);
    setStartOverride(null);
  };

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
                // Uma medição informada aqui vira registro datado de verdade —
                // é o que permite comparar com a próxima.
                if (kind === "medida_corporal" && startOverride !== null && startValue > 0) {
                  await addMeasurement({
                    label: measureLabel.trim(),
                    value: startValue,
                    unit,
                    method: method.trim() || undefined,
                    measuredAt,
                  });
                }
                await createCycleGoal({
                  cycleId: cycle.id,
                  blockId: blockId || undefined,
                  title: title.trim(),
                  kind,
                  exerciseLineageId: needsExercise ? lineageId : undefined,
                  exerciseLabel:
                    kind === "medida_corporal" ? measureLabel.trim() : (exerciseName ?? undefined),
                  referenceReps: kind === "carga" ? referenceReps : undefined,
                  referenceSets: kind === "carga" ? referenceSets : undefined,
                  manualCurrent: manual ? startValue : undefined,
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
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Título
        </span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: 3×10 com 30kg na remada"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          O que medir
        </legend>
        <div className="grid grid-cols-2 gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => changeKind(k)}
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Séries
            </span>
            <input
              type="number"
              min={1}
              value={referenceSets}
              onChange={(e) => {
                setReferenceSets(Math.max(1, Number(e.target.value) || 1));
                setStartOverride(null);
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Repetições
            </span>
            <input
              type="number"
              min={1}
              value={referenceReps}
              onChange={(e) => {
                setReferenceReps(Math.max(1, Number(e.target.value) || 1));
                setStartOverride(null);
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums outline-none focus:border-primary"
            />
          </label>
          <p className="col-span-2 text-[11px] leading-relaxed text-muted-foreground">
            Só conta quando a carga for sustentada por {referenceSets} séries de pelo menos{" "}
            {referenceReps} repetições. Um pico isolado de peso não é a mesma conquista.
          </p>
        </div>
      )}

      {kind === "medida_corporal" && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              O que é medido
            </span>
            <input
              list="medidas-conhecidas"
              value={measureLabel}
              onChange={(e) => setMeasureLabel(e.target.value)}
              placeholder="Ex: cintura, % de gordura"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <datalist id="medidas-conhecidas">
              {knownLabels.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Método
              </span>
              <input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Ex: fita, bioimpedância"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Medido em
              </span>
              <input
                type="date"
                value={measuredAt}
                onChange={(e) => setMeasuredAt(e.target.value || todayISO())}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            O Norte não calcula gordura corporal a partir do peso. O valor é o que você mediu, e
            fica registrado com método e data para poder ser comparado depois.
          </p>
        </div>
      )}

      {kind === "descritiva" ? (
        <p className="mt-4 rounded-lg border border-border bg-surface-2 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Meta de acompanhamento manual: sem número. Você marca como cumprida quando considerar
          cumprida — o Norte não vai inventar uma medição para ela.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Início
              </span>
              <input
                type="number"
                value={startOverride !== null ? startOverride : String(measured)}
                onChange={(e) => setStartOverride(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-2 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Alvo
              </span>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-border bg-surface px-2 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Unidade
              </span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-2 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {manual
              ? "Valor informado por você — esta meta não é atualizada por registros do treino."
              : measured > 0
                ? `Início vem do seu registro real (${measured} ${unit}).`
                : "Nenhum registro para partir — informe o ponto de partida."}
          </p>
        </>
      )}

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
