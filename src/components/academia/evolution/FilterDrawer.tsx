import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatDateShortBR } from "@/lib/goals-store";
import type { WorkoutPlan } from "@/lib/workout-store";
import {
  blocksForCycle,
  plansOfBlock,
  type BlockPlan,
  type CycleBlock,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";
import {
  muscleGroupLabel,
  UNCLASSIFIED,
  type FilteredData,
  type MuscleGroupFilter,
} from "@/lib/workout-evolution";

// ---------------------------------------------------------------------------
// Gaveta de filtros: planejamento, etapa, treino e grupo muscular.
//
// Nada aqui é obrigatório. A visão geral inclui treinos independentes, e
// escolher um planejamento é um recorte — não a condição para o painel
// funcionar.
// ---------------------------------------------------------------------------

export type FilterState = {
  cycleId: string;
  stageId: string;
  planLineageId: string;
  muscleGroup: MuscleGroupFilter | "";
};

export function FilterDrawer({
  cycles,
  blocks,
  blockPlans,
  plans,
  data,
  cycleId,
  stageId,
  planLineageId,
  muscleGroup,
  onChange,
  onClose,
}: {
  cycles: WorkoutCycle[];
  blocks: CycleBlock[];
  blockPlans: BlockPlan[];
  plans: WorkoutPlan[];
  data: FilteredData;
  cycleId: string;
  stageId: string;
  planLineageId: string;
  muscleGroup: MuscleGroupFilter | "";
  onChange: (next: FilterState) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FilterState>({
    cycleId,
    stageId,
    planLineageId,
    muscleGroup,
  });

  const stages = draft.cycleId ? blocksForCycle(blocks, draft.cycleId) : [];
  const stage = stages.find((b) => b.id === draft.stageId);
  // Treinos oferecidos: os da etapa quando há uma; senão, os que realmente
  // aparecem nos registros do período.
  const workoutOptions = stage
    ? plansOfBlock(blockPlans, plans, stage.id).map((p) => ({
        lineageId: p.lineageId,
        label: `${p.letter} · ${p.name}`,
      }))
    : [
        ...new Map(
          data.sessions
            .filter((s) => s.planLineageId)
            .map((s) => [s.planLineageId!, s.planLabel ?? "Treino"]),
        ),
      ].map(([lineageId, label]) => ({ lineageId, label }));

  const muscleOptions = [
    ...new Set(data.sets.map((s) => s.muscleGroup ?? UNCLASSIFIED)),
  ] as MuscleGroupFilter[];

  const apply = (next: FilterState) => {
    setDraft(next);
    onChange(next);
  };

  return (
    <Modal
      onClose={onClose}
      title="Filtrar"
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => {
              apply({ cycleId: "", stageId: "", planLineageId: "", muscleGroup: "" });
            }}
            className="interactive-press flex-1 rounded-xl border border-border py-2.5 text-xs font-semibold"
          >
            Limpar filtros
          </button>
          <button
            onClick={onClose}
            className="interactive-press flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground"
          >
            Ver resultados
          </button>
        </div>
      }
    >
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Planejamento
        </span>
        <select
          value={draft.cycleId}
          onChange={(e) =>
            apply({ ...draft, cycleId: e.target.value, stageId: "", planLineageId: "" })
          }
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="">Todos os treinos</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-muted-foreground">
          Sem planejamento escolhido, a visão inclui também os treinos independentes.
        </span>
      </label>

      {stages.length > 0 && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Etapa
          </span>
          <select
            value={draft.stageId}
            onChange={(e) => apply({ ...draft, stageId: e.target.value, planLineageId: "" })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Todas as etapas</option>
            {stages.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({formatDateShortBR(b.startDate)} — {formatDateShortBR(b.endDate)})
              </option>
            ))}
          </select>
          {stage && (
            <span className="mt-1 block text-[11px] text-muted-foreground">
              O período passa a ser o da etapa: {formatDateShortBR(stage.startDate)} —{" "}
              {formatDateShortBR(stage.endDate)}. Mudar o período depois continua limitado a este
              intervalo.
            </span>
          )}
        </label>
      )}

      {workoutOptions.length > 0 && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Treino
          </span>
          <select
            value={draft.planLineageId}
            onChange={(e) => apply({ ...draft, planLineageId: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Todos</option>
            {workoutOptions.map((w) => (
              <option key={w.lineageId} value={w.lineageId}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {muscleOptions.length > 0 && (
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Grupo muscular
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {muscleOptions.map((key) => (
              <button
                key={key}
                onClick={() =>
                  apply({ ...draft, muscleGroup: draft.muscleGroup === key ? "" : key })
                }
                aria-pressed={draft.muscleGroup === key}
                className={`interactive-press rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                  draft.muscleGroup === key
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border"
                }`}
              >
                {key === UNCLASSIFIED ? "Não classificado" : muscleGroupLabel[key]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        O exercício é escolhido dentro do próprio módulo de evolução, na busca do gráfico.
      </p>
    </Modal>
  );
}
