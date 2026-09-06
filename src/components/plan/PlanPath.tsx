import { Check, Plus } from "lucide-react";
import { StageAccordion } from "@/components/plan/StageAccordion";
import { stepsForGoal, type Execution, type Goal, type Step } from "@/lib/goals-store";

type StageState = "done" | "current" | "future";

function Node({ state }: { state: StageState }) {
  if (state === "done") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-4 w-4" strokeWidth={3} />
      </div>
    );
  }
  if (state === "current") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-primary p-[3px]">
        <div className="h-full w-full rounded-full border-2 border-primary/50" />
      </div>
    );
  }
  return <div className="h-7 w-7 shrink-0 rounded-full border-2 border-border" />;
}

/**
 * "Caminho do plano" — trilho vertical à esquerda dos cards das etapas.
 * O segmento de linha acima/abaixo de cada nó nasce da própria coluna do nó
 * ser `flex flex-col` com `items-stretch` no pai: os dois pedaços de linha
 * usam `flex-1` e por isso esticam pra ocupar exatamente a altura da etapa
 * ao lado, sem precisar medir pixel nenhum em JS.
 */
export function PlanPath({
  goal,
  steps,
  executions,
  openStepId,
  onToggleStep,
  flashId,
  stepRefs,
  execRefs,
  nextActionId,
  onCreateAction,
  onCreateStage,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
  openStepId: string | null;
  onToggleStep: (stepId: string) => void;
  flashId: string | null;
  stepRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  execRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  nextActionId: string | null;
  onCreateAction: (stepId: string) => void;
  onCreateStage: () => void;
}) {
  const ordered = stepsForGoal(steps, goal.id);
  const firstOpenIndex = ordered.findIndex((s) => !s.done);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Caminho do plano
        </h2>
        {ordered.length > 0 && (
          <span className="text-[13px] text-muted-foreground">
            {ordered.length} {ordered.length === 1 ? "etapa" : "etapas"}
          </span>
        )}
      </div>

      {ordered.length === 0 ? (
        <div className="card-surface mt-3 p-5 text-center">
          <p className="text-sm text-muted-foreground text-balance-tight">
            Comece dividindo seu objetivo em uma primeira etapa.
          </p>
          <button
            onClick={onCreateStage}
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Criar primeira etapa
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-0">
          {ordered.map((step, i) => {
            const state: StageState = step.done
              ? "done"
              : i === firstOpenIndex
                ? "current"
                : "future";
            const nodeGreen = state !== "future";
            const stepExecs = executions
              .filter((e) => e.stepId === step.id)
              .sort((a, b) => {
                const byStart = (a.plannedStartDate ?? a.dueDate).localeCompare(
                  b.plannedStartDate ?? b.dueDate,
                );
                if (byStart !== 0) return byStart;
                const byEnd = (a.plannedEndDate ?? a.dueDate).localeCompare(
                  b.plannedEndDate ?? b.dueDate,
                );
                return byEnd !== 0 ? byEnd : a.createdAt.localeCompare(b.createdAt);
              });
            return (
              <div key={step.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-[1.5px] flex-1 ${i === 0 ? "invisible" : nodeGreen ? "bg-primary" : "bg-border"}`}
                  />
                  <Node state={state} />
                  <div
                    className={`w-[1.5px] flex-1 ${i === ordered.length - 1 ? "invisible" : nodeGreen ? "bg-primary" : "bg-border"}`}
                  />
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div
                    ref={(el) => {
                      stepRefs.current[step.id] = el;
                    }}
                  >
                    <StageAccordion
                      step={step}
                      goal={goal}
                      executions={stepExecs}
                      index={i}
                      state={state}
                      isOpen={openStepId === step.id}
                      onToggle={() => onToggleStep(step.id)}
                      flashId={flashId}
                      execRefs={execRefs}
                      nextActionId={nextActionId}
                      onCreateAction={() => onCreateAction(step.id)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {ordered.length > 0 && (
        <button
          onClick={onCreateStage}
          className="mt-2 flex h-12 w-fit items-center gap-1.5 rounded-2xl border border-primary/50 px-4 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> Nova etapa
        </button>
      )}
    </div>
  );
}
