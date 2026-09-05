import { useState } from "react";
import { Minus, Plus as PlusIcon, ArrowRight } from "lucide-react";
import {
  effectiveStatus,
  stepsForGoal,
  executionsForGoal,
  todayISO,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";

type NodeStatus = "done" | "current" | "future" | "overdue" | "risk";

const statusStyle: Record<NodeStatus, { dot: string; ring: string; text: string }> = {
  done: { dot: "bg-success", ring: "border-success/50", text: "text-success" },
  current: {
    dot: "bg-primary shadow-[0_0_8px_var(--primary)]",
    ring: "border-primary",
    text: "text-primary",
  },
  future: { dot: "bg-muted-foreground/40", ring: "border-border", text: "text-muted-foreground" },
  overdue: { dot: "bg-danger", ring: "border-danger/50", text: "text-danger" },
  risk: { dot: "bg-warning", ring: "border-warning/50", text: "text-warning" },
};

const statusMeaning: Record<NodeStatus, string> = {
  done: "concluído",
  current: "etapa atual",
  future: "futuro",
  overdue: "atrasado",
  risk: "risco/bloqueio",
};

function stepStatus(step: Step, today: string, hasMissedExecution: boolean): NodeStatus {
  if (step.done) return "done";
  if (step.isCurrent) return "current";
  if (step.targetDate && step.targetDate < today) return "overdue";
  if (hasMissedExecution) return "risk";
  return "future";
}

function executionStatus(e: Execution, today: string): NodeStatus {
  const status = effectiveStatus(e);
  if (status === "concluida") return "done";
  if (status === "perdida") return "overdue";
  if (status === "planejada" && e.dueDate < today) return "overdue";
  return "future";
}

type SelectedNode =
  | { kind: "plan" }
  | { kind: "step"; step: Step }
  | { kind: "execution"; execution: Execution; step?: Step };

/**
 * Mapa mental simples do plano — Plano -> Etapas -> Execuções, cor por status.
 * Sem biblioteca de grafo: uma "espinha" horizontal com CSS puro, rolável no
 * celular, com zoom controlado por botões (não gesto) pra não depender de
 * pinch-to-zoom, que o navegador já usa pra outras coisas.
 */
export function PlanVisualMap({
  goal,
  allSteps,
  allExecutions,
  onNavigate,
}: {
  goal: Goal;
  allSteps: Step[];
  allExecutions: Execution[];
  onNavigate: (target: { stepId?: string; executionId?: string }) => void;
}) {
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<SelectedNode>({ kind: "plan" });

  const steps = stepsForGoal(allSteps, goal.id);
  const executions = executionsForGoal(allExecutions, goal.id);
  const today = todayISO();

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">Toque num item pra ver o resumo.</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.7, +(s - 0.15).toFixed(2)))}
            aria-label="Diminuir zoom do mapa"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setScale((s) => Math.min(1.3, +(s + 0.15).toFixed(2)))}
            aria-label="Aumentar zoom do mapa"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="card-surface mt-2 overflow-x-auto p-4">
        <div
          className="flex items-start gap-6 pb-2"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: "max-content",
          }}
        >
          <button
            onClick={() => setSelected({ kind: "plan" })}
            className="card-surface flex w-36 shrink-0 flex-col items-center gap-1 border-primary/40 p-3 text-center hover:border-primary"
          >
            <span className="text-lg">🎯</span>
            <span className="line-clamp-2 text-xs font-bold">{goal.title}</span>
          </button>

          {steps.length === 0 ? (
            <p className="self-center text-xs text-muted-foreground">Nenhuma etapa ainda.</p>
          ) : (
            <div className="flex gap-5">
              {steps.map((step) => {
                const stepExecs = executions.filter((e) => e.stepId === step.id);
                const hasMissed = stepExecs.some((e) => effectiveStatus(e) === "perdida");
                const st = stepStatus(step, today, hasMissed);
                const style = statusStyle[st];
                return (
                  <div key={step.id} className="w-40 shrink-0 border-t border-border pt-3">
                    <button
                      onClick={() => setSelected({ kind: "step", step })}
                      className={`flex w-full items-start gap-2 rounded-xl border ${style.ring} bg-surface-2 p-2.5 text-left hover:bg-surface`}
                    >
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                      <span className="line-clamp-2 text-[11px] font-semibold">{step.title}</span>
                    </button>
                    {stepExecs.length > 0 && (
                      <div className="mt-2 space-y-1.5 border-l border-dashed border-border pl-2.5">
                        {stepExecs.map((e) => {
                          const est = executionStatus(e, today);
                          const eStyle = statusStyle[est];
                          return (
                            <button
                              key={e.id}
                              onClick={() => setSelected({ kind: "execution", execution: e, step })}
                              className="flex w-full items-center gap-1.5 rounded-lg bg-surface px-2 py-1.5 text-left hover:bg-surface-2"
                            >
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${eStyle.dot}`} />
                              <span className="line-clamp-1 text-[10px] text-muted-foreground">
                                {e.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {(Object.keys(statusMeaning) as NodeStatus[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${statusStyle[k].dot}`} />
            {statusMeaning[k]}
          </span>
        ))}
      </div>

      <NodeSummary selected={selected} goal={goal} onNavigate={onNavigate} />
    </div>
  );
}

function NodeSummary({
  selected,
  goal,
  onNavigate,
}: {
  selected: SelectedNode;
  goal: Goal;
  onNavigate: (target: { stepId?: string; executionId?: string }) => void;
}) {
  if (selected.kind === "plan") {
    return (
      <div className="card-surface mt-3 p-3.5">
        <p className="text-xs font-bold">{goal.title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{goal.why || "Sem descrição."}</p>
      </div>
    );
  }
  if (selected.kind === "step") {
    return (
      <div className="card-surface mt-3 p-3.5">
        <p className="text-xs font-bold">{selected.step.title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {selected.step.done ? "Concluída" : selected.step.isCurrent ? "Etapa atual" : "Em aberto"}
        </p>
        <button
          onClick={() => onNavigate({ stepId: selected.step.id })}
          className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary"
        >
          Ver no Planejamento <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="card-surface mt-3 p-3.5">
      <p className="text-xs font-bold">{selected.execution.title}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Prazo {selected.execution.dueDate.split("-").reverse().join("/")}
        {selected.step ? ` · etapa: ${selected.step.title}` : ""}
      </p>
      <button
        onClick={() =>
          onNavigate({ stepId: selected.step?.id, executionId: selected.execution.id })
        }
        className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary"
      >
        Ver no Planejamento <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}
