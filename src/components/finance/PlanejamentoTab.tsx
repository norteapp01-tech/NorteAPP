import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarRange, Plus, Target } from "lucide-react";
import { useFinanceStore, formatBRL, type FinancialGoal } from "@/lib/finance-store";
import {
  useGoalsStore,
  goalProgress,
  stepsForGoal,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";
import { financialPlanRows } from "./financial-planning";

export function PlanejamentoTab() {
  const plans = useGoalsStore((state) => state.goals);
  const steps = useGoalsStore((state) => state.steps);
  const executions = useGoalsStore((state) => state.executions);
  const objectives = useFinanceStore((state) => state.goals);
  const rows = financialPlanRows(plans, objectives);
  const withoutPlan = objectives.filter((objective) => !objective.planId);

  return (
    <div className="finance-planning">
      <section className="finance-planning-intro">
        <p className="finance-eyebrow">Planejamento financeiro</p>
        <h2>Transforme um objetivo em caminho</h2>
        <p>Etapas, ações e cronograma para tirar seus planos do papel.</p>
      </section>

      {rows.length > 0 && (
        <section className="finance-plans-section">
          <h3>Seus planejamentos</h3>
          {rows.map(({ plan, objective }) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              objective={objective}
              steps={steps}
              executions={executions}
            />
          ))}
        </section>
      )}

      <section className="finance-start-planning">
        <div className="finance-section-heading">
          <h3>Começar um planejamento</h3>
          {withoutPlan.length > 0 && (
            <span className="finance-count">
              {withoutPlan.length} objetivo{withoutPlan.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {withoutPlan.map((objective) => (
          <Link
            key={objective.id}
            to="/criar"
            search={{ modo: "planejamento", financeGoalId: objective.id }}
            className="finance-objective-plan-row interactive-press"
          >
            <span className="finance-objective-icon">
              <Target className="h-5 w-5 text-muted-foreground" />
            </span>
            <span className="finance-objective-copy">
              <strong className="block truncate text-sm">{objective.name}</strong>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Meta de {formatBRL(objective.targetAmount)}
              </span>
            </span>
            <span className="finance-plan-action">
              Planejar <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
        <Link
          to="/criar"
          search={{ modo: "planejamento", financialPreset: true }}
          className="finance-create-plan interactive-press"
        >
          <Plus className="h-4 w-4" /> Criar plano financeiro sem objetivo
        </Link>
      </section>

      {rows.length === 0 && withoutPlan.length === 0 && (
        <div className="finance-planning-empty">
          <CalendarRange className="h-5 w-5 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Você ainda não tem um objetivo financeiro</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Crie primeiro um objetivo com valor e prazo. Depois, volte aqui para dividi-lo em
            etapas.
          </p>
        </div>
      )}
    </div>
  );
}

function PlanRow({
  plan,
  objective,
  steps,
  executions,
}: {
  plan: Goal;
  objective?: FinancialGoal;
  steps: Step[];
  executions: Execution[];
}) {
  const planSteps = stepsForGoal(steps, plan.id);
  const progress = goalProgress(plan, planSteps, executions);
  const moneyProgress =
    objective && objective.targetAmount > 0
      ? Math.min(100, Math.round((objective.savedAmount / objective.targetAmount) * 100))
      : null;
  return (
    <Link to="/objetivo/$id" params={{ id: plan.id }} className="finance-plan-card">
      <div className="finance-plan-card-copy">
        <div>
          <p className="finance-plan-title">{plan.title}</p>
          <p className="finance-plan-meta">
            {planSteps.length} etapa{planSteps.length === 1 ? "" : "s"} · {plan.deadlineLabel}
          </p>
        </div>
      </div>
      <div className="finance-plan-progress">
        <ProgressLine label="Plano" value={progress} />
        {moneyProgress !== null && <ProgressLine label="Valor guardado" value={moneyProgress} />}
      </div>
      <span className="finance-open-plan">
        Abrir planejamento <ArrowRight />
      </span>
    </Link>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="progress-fill h-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
