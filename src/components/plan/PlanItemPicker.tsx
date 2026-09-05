import { useState } from "react";
import { ChevronRight, Search, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { categoryMeta } from "@/lib/mock-data";
import {
  useGoalsStore,
  isGoalComplete,
  isScheduled,
  formatDateBR,
  stepsForGoal,
  executionsForGoal,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";

export type PlanItemSelection =
  | { kind: "goal"; goal: Goal }
  | { kind: "step"; goal: Goal; step: Step }
  | { kind: "execution"; goal: Goal; step?: Step; execution: Execution };

/**
 * Seletor hierárquico Plano → Etapa → Execução pro fluxo "Adicionar à Agenda" —
 * prioriza seleção em vez de digitação livre. Planos concluídos, etapas concluídas
 * e execuções concluídas nunca aparecem como opção (regra explícita do pedido).
 */
export function PlanItemPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (sel: PlanItemSelection) => void;
}) {
  const goals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const executions = useGoalsStore((s) => s.executions);
  const [query, setQuery] = useState("");
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const openGoals = goals.filter((g) => !isGoalComplete(g, steps, executions));
  const activeGoals = openGoals.filter(
    (g) => !query.trim() || g.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Modal onClose={onClose} title="Selecionar plano, etapa ou execução">
      {openGoals.length > 5 && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar plano..."
            autoFocus
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      )}
      <div className="space-y-2">
        {activeGoals.map((g) => {
          const cat = categoryMeta[g.category] ?? categoryMeta.generico;
          const gSteps = stepsForGoal(steps, g.id).filter((s) => !s.done);
          const orphanExecs = executionsForGoal(executions, g.id).filter(
            (e) => !e.stepId && e.status !== "concluida",
          );
          const hasChildren = gSteps.length > 0 || orphanExecs.length > 0;
          const isExpanded = expandedGoal === g.id;
          return (
            <div key={g.id} className="card-surface overflow-hidden">
              <button
                onClick={() => {
                  if (!hasChildren) {
                    onSelect({ kind: "goal", goal: g });
                    return;
                  }
                  setExpandedGoal(isExpanded ? null : g.id);
                  setExpandedStep(null);
                }}
                className="flex w-full items-center gap-2 p-3 text-left hover:bg-surface-2"
              >
                <span className="text-base">{cat.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{g.title}</span>
                {!hasChildren ? (
                  <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                )}
              </button>
              {isExpanded && (
                <div className="space-y-1 border-t border-border p-2 pl-5">
                  {gSteps.map((s) => {
                    const sExecs = executionsForGoal(executions, g.id).filter(
                      (e) => e.stepId === s.id && e.status !== "concluida",
                    );
                    const stepExpanded = expandedStep === s.id;
                    return (
                      <div key={s.id}>
                        <button
                          onClick={() => {
                            if (sExecs.length === 0) {
                              onSelect({ kind: "step", goal: g, step: s });
                              return;
                            }
                            setExpandedStep(stepExpanded ? null : s.id);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-surface-2"
                        >
                          <span className="min-w-0 flex-1 truncate">{s.title}</span>
                          {sExecs.length === 0 ? (
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <ChevronRight
                              className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${stepExpanded ? "rotate-90" : ""}`}
                            />
                          )}
                        </button>
                        {stepExpanded && (
                          <div className="space-y-1 border-l border-dashed border-border pl-3">
                            {sExecs.map((e) => (
                              <ExecutionRow
                                key={e.id}
                                execution={e}
                                onClick={() =>
                                  onSelect({ kind: "execution", goal: g, step: s, execution: e })
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {orphanExecs.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {orphanExecs.map((e) => (
                        <ExecutionRow
                          key={e.id}
                          execution={e}
                          onClick={() => onSelect({ kind: "execution", goal: g, execution: e })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {activeGoals.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {query.trim()
              ? "Nenhum plano ativo encontrado para essa busca."
              : "Nenhum plano ativo ainda."}{" "}
            Você ainda pode criar um compromisso avulso, sem vincular a nenhum plano.
          </p>
        )}
      </div>
    </Modal>
  );
}

function ExecutionRow({ execution: e, onClick }: { execution: Execution; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left text-[11px] hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1 truncate">{e.title}</span>
      <span className="shrink-0 text-muted-foreground">
        {isScheduled(e) ? `agendada ${formatDateBR(e.agendaDate!)}` : "sem agenda"}
      </span>
    </button>
  );
}
