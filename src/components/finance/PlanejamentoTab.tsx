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
    <div className="space-y-6">
      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Planejamento financeiro
        </p>
        <h2 className="mt-1 text-xl font-bold">Transforme um objetivo em caminho</h2>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Aqui você inicia e acompanha planos financeiros. Etapas, ações e cronograma continuam no
          mesmo editor da aba Plano.
        </p>
      </section>

      {rows.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold">Seus planejamentos</h3>
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

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Começar um planejamento</h3>
          {withoutPlan.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {withoutPlan.length} objetivo{withoutPlan.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {withoutPlan.map((objective) => (
          <Link
            key={objective.id}
            to="/criar"
            search={{ modo: "planejamento", financeGoalId: objective.id }}
            className="card-surface flex items-center gap-3 p-4"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10">
              <Target className="h-5 w-5 text-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{objective.name}</strong>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Meta de {formatBRL(objective.targetAmount)}
              </span>
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-primary">
              Planejar <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
        <Link
          to="/criar"
          search={{ modo: "planejamento", financialPreset: true }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-4 w-4" /> Criar plano financeiro sem objetivo
        </Link>
      </section>

      {rows.length === 0 && withoutPlan.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <CalendarRange className="h-5 w-5 text-primary" />
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
    <Link to="/objetivo/$id" params={{ id: plan.id }} className="card-surface block p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{plan.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {planSteps.length} etapa{planSteps.length === 1 ? "" : "s"} · {plan.deadlineLabel}
          </p>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="mt-3 space-y-2">
        <ProgressLine label="Plano" value={progress} />
        {moneyProgress !== null && <ProgressLine label="Valor guardado" value={moneyProgress} />}
      </div>
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
        <div className="h-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
