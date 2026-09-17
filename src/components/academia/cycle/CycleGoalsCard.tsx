import { useState } from "react";
import { Plus, Target, Trash2 } from "lucide-react";
import { formatDateShortBR } from "@/lib/goals-store";
import {
  cycleGoalKindLabel,
  isManualGoal,
  removeCycleGoal,
  updateCycleGoal,
  type CycleBlock,
  type GoalEvaluation,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";
import { CycleGoalModal } from "./CycleGoalModal";
import { useAsyncAction } from "@/hooks/use-async-action";
import { InlineError } from "@/components/ui/inline-error";

// ---------------------------------------------------------------------------
// Metas do ciclo — poucos indicadores, detalhe sob demanda.
//
// Meta é mensurável e tem ponto de partida, alvo e unidade. Foco muscular é
// outra coisa: anotação de direção, sem número. As duas não se misturam.
// ---------------------------------------------------------------------------

export function CycleGoalsCard({
  cycle,
  blocks,
  evaluations,
  block,
}: {
  cycle: WorkoutCycle;
  blocks: CycleBlock[];
  evaluations: GoalEvaluation[];
  block?: CycleBlock;
}) {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const action = useAsyncAction();

  return (
    <section
      aria-label={block ? "Metas da etapa" : "Metas sem etapa"}
      className={block ? "" : "card-surface p-4"}
    >
      {!block && <h3 className="mb-3 text-sm font-semibold">Metas sem etapa</h3>}
      {evaluations.length === 0 ? (
        <div className="text-center">
          <Target className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.8} />
          <p className="mt-2 text-sm text-muted-foreground">
            O que você quer alcançar nesta etapa? Defina um alvo de carga, peso corporal ou
            frequência.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {evaluations.map((ev) => (
            <li key={ev.goal.id}>
              <GoalRow
                evaluation={ev}
                blockName={blocks.find((b) => b.id === ev.goal.blockId)?.name}
                expanded={openId === ev.goal.id}
                onToggle={() => setOpenId(openId === ev.goal.id ? null : ev.goal.id)}
              />
              {!block && (
                <label className="mt-2 block text-xs text-muted-foreground">
                  Vincular à etapa
                  <select
                    disabled={action.pending}
                    aria-label={`Vincular meta ${ev.goal.title}`}
                    value=""
                    onChange={(e) => {
                      const selected = blocks.find((b) => b.id === e.target.value);
                      if (selected)
                        void action.run(() =>
                          updateCycleGoal(ev.goal.id, {
                            blockId: selected.id,
                            deadline: selected.endDate,
                          }),
                        );
                    }}
                    className="mt-1 w-full rounded-lg border border-border bg-surface p-2"
                  >
                    <option value="">Escolher etapa</option>
                    {blocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          ))}
        </ul>
      )}

      {block && (
        <button
          onClick={() => setCreating(true)}
          className="interactive-press mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> nova meta
        </button>
      )}

      {creating && (
        <CycleGoalModal
          cycle={cycle}
          blocks={blocks}
          initialBlockId={block?.id}
          onClose={() => setCreating(false)}
        />
      )}
      {action.error && <InlineError message={action.error} onRetry={action.clearError} />}
    </section>
  );
}

function GoalRow({
  evaluation,
  blockName,
  expanded,
  onToggle,
}: {
  evaluation: GoalEvaluation;
  blockName?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { goal, current, progress, reached, hasData } = evaluation;
  const label = goal.title || goal.exerciseLabel || cycleGoalKindLabel[goal.kind];
  const manual = isManualGoal(goal.kind);

  return (
    <div
      className={`rounded-lg border p-2.5 ${reached ? "border-success/40 bg-success/5" : "border-border bg-surface-2"}`}
    >
      {goal.kind === "descritiva" && (
        <button
          onClick={() => void updateCycleGoal(goal.id, { manualDone: !goal.manualDone })}
          className={`interactive-press mb-2 w-full rounded-md border py-1.5 text-[11px] font-semibold ${goal.manualDone ? "border-success/50 bg-success/10 text-success" : "border-border"}`}
        >
          {goal.manualDone ? "Cumprida — desmarcar" : "Marcar como cumprida"}
        </button>
      )}
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold">
            {label}
            {manual && (
              <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                manual
              </span>
            )}
          </p>
          {goal.kind !== "descritiva" && (
            <p className="shrink-0 font-mono text-xs font-bold tabular-nums">
              {hasData ? formatValue(current, goal.unit) : "—"}
              <span className="text-muted-foreground">
                {" "}
                / {formatValue(goal.targetValue, goal.unit)}
              </span>
            </p>
          )}
        </div>
        {goal.kind !== "descritiva" && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className={`progress-fill h-full rounded-full ${reached ? "bg-success" : "bg-primary"}`}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {goal.kind === "descritiva"
            ? reached
              ? "Marcada como cumprida."
              : "Acompanhamento manual."
            : !hasData
              ? "Sem registro ainda — nada medido."
              : reached
                ? "Meta atingida."
                : `${Math.round(progress * 100)}% do caminho`}
          {blockName ? ` · ${blockName}` : ""}
        </p>
      </button>

      {expanded && (
        <div className="mt-2.5 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
          <dl className="space-y-1">
            <Row term="Tipo" value={cycleGoalKindLabel[goal.kind]} />
            <Row term="Ponto de partida" value={formatValue(goal.startValue, goal.unit)} />
            <Row term="Alvo" value={formatValue(goal.targetValue, goal.unit)} />
            {goal.referenceReps && (
              <Row
                term="Referência"
                value={`${goal.referenceSets ?? 1} × ${goal.referenceReps} repetições`}
              />
            )}
            {manual && <Row term="Origem" value="informado por você, não calculado pelo app" />}
            {goal.deadline && <Row term="Prazo" value={formatDateShortBR(goal.deadline)} />}
          </dl>
          <button
            onClick={() => void removeCycleGoal(goal.id)}
            className="interactive-press mt-2 flex items-center gap-1 text-[11px] text-danger"
          >
            <Trash2 className="h-3 w-3" /> remover meta
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="shrink-0">{term}</dt>
      <dd className="min-w-0 text-right text-foreground">{value}</dd>
    </div>
  );
}

function formatValue(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${unit === "kg" ? "kg" : ` ${unit}`}`;
}
