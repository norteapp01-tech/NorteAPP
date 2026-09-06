import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { GreenProgressBar } from "@/components/plan/GreenProgressBar";
import { nextActionLabel } from "@/components/plan/nextActionLabel";
import {
  goalProgress,
  nextActionForGoal,
  stepsForGoal,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";

/**
 * Módulo único com o restante dos planos do horizonte atual (tudo, exceto o
 * escolhido para "Em foco"). Linhas enxutas de propósito — sem repetir ícone
 * de categoria por linha (já disponível no detalhe) — só o essencial pra
 * decidir se vale abrir: nome, prazo, etapas, percentual, próxima ação.
 */
export function OtherPlansSection({
  goals,
  steps,
  executions,
}: {
  goals: Goal[];
  steps: Step[];
  executions: Execution[];
}) {
  if (goals.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        Outros planos ({goals.length})
      </p>
      <div className="card-surface mt-3 divide-y divide-border overflow-hidden p-0">
        {goals.map((g) => (
          <OtherPlanRow key={g.id} goal={g} steps={steps} executions={executions} />
        ))}
      </div>
    </div>
  );
}

function OtherPlanRow({
  goal,
  steps,
  executions,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
}) {
  const pct = goalProgress(goal, steps, executions);
  const gSteps = stepsForGoal(steps, goal.id);
  const doneSteps = gSteps.filter((s) => s.done).length;
  const action = nextActionForGoal(goal, steps, executions);
  const overdue = goal.deadlineISO
    ? goal.deadlineISO < new Date().toISOString().slice(0, 10)
    : false;
  const needsDefine = action.kind === "define" || action.kind === "none";

  return (
    <Link
      to="/objetivo/$id"
      params={{ id: goal.id }}
      search={action.kind === "define" ? { openStep: action.step.id, create: true } : undefined}
      className="flex items-center gap-3 p-3.5 hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-snug">{goal.title}</p>
        <p className={`mt-0.5 text-[11px] ${overdue ? "text-danger" : "text-muted-foreground"}`}>
          prazo {goal.deadlineLabel}
          {gSteps.length > 0 ? ` · ${doneSteps}/${gSteps.length} etapas` : ""}
        </p>
        <p
          className={`mt-1 truncate text-[11px] ${needsDefine ? "font-semibold text-primary" : "text-muted-foreground"}`}
        >
          {needsDefine ? "+ Definir próxima ação" : `Próxima ação: ${nextActionLabel(action)}`}
        </p>
        {pct > 0 && <GreenProgressBar pct={pct} className="mt-2 h-1" />}
      </div>
      <span className="shrink-0 font-mono text-xs font-bold text-muted-foreground">{pct}%</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
