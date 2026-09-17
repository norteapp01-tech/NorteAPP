import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatDateShortBR } from "@/lib/goals-store";
import { blocksForCycle, type CycleBlock, type WorkoutCycle } from "@/lib/workout-cycle-store";

// ---------------------------------------------------------------------------
// Filtros GLOBAIS secundários: programa e etapa. Ficam numa gaveta à parte do
// período, e separados da seleção de músculo — que é detalhamento, não filtro
// global.
//
// Nada aqui é obrigatório: sem programa escolhido, a página usa todos os
// treinos registrados, inclusive os que nunca pertenceram a um.
// ---------------------------------------------------------------------------

export type EvolutionFilterState = { cycleId: string; stageId: string };

export function EvolutionFilterSheet({
  cycles,
  blocks,
  cycleId,
  stageId,
  onChange,
  onClose,
}: {
  cycles: WorkoutCycle[];
  blocks: CycleBlock[];
  cycleId: string;
  stageId: string;
  onChange: (next: EvolutionFilterState) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EvolutionFilterState>({ cycleId, stageId });
  const stages = draft.cycleId ? blocksForCycle(blocks, draft.cycleId) : [];
  const stage = stages.find((s) => s.id === draft.stageId);

  const apply = (next: EvolutionFilterState) => {
    setDraft(next);
    onChange(next);
  };

  return (
    <Modal
      onClose={onClose}
      title="Filtros"
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => apply({ cycleId: "", stageId: "" })}
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
          Programa
        </span>
        <select
          value={draft.cycleId}
          onChange={(e) => apply({ cycleId: e.target.value, stageId: "" })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        >
          <option value="">Todos os treinos</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
          Sem programa escolhido, a página usa todos os treinos registrados — inclusive os que nunca
          pertenceram a um programa.
        </span>
      </label>

      {stages.length > 0 && (
        <label className="mt-4 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Etapa
          </span>
          <select
            value={draft.stageId}
            onChange={(e) => apply({ ...draft, stageId: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Todas as etapas</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({formatDateShortBR(s.startDate)} — {formatDateShortBR(s.endDate)})
              </option>
            ))}
          </select>
          {stage && (
            <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
              O período passa a ser o da etapa. Mudar o período depois continua limitado a este
              intervalo.
            </span>
          )}
        </label>
      )}

      <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
        Período, programa e etapa valem para a página inteira. A seleção de músculo, feita no mapa
        ou no radar, detalha só a lista de exercícios — o corpo continua inteiro para preservar a
        comparação.
      </p>
    </Modal>
  );
}
