import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { CategoryIcon } from "@/components/plan/CategoryIcon";
import { GreenProgressBar } from "@/components/plan/GreenProgressBar";
import { QuickScheduleModal } from "@/components/plan/QuickScheduleModal";
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
 * Card "Em foco" — em destaque, mas SEM contorno completo (só uma linha verde
 * fina na lateral esquerda). Mostra exatamente o mesmo registro que já existe
 * em `goals`/`steps`/`executions`; não cria nem duplica nada, só apresenta.
 * O rótulo do rodapé é um `Link` próprio (nunca aninhado dentro do `Link`
 * principal do card, que teria virado um `<a>` dentro de outro `<a>`).
 */
export function FocusPlanCard({
  goal,
  steps,
  executions,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
}) {
  const [scheduling, setScheduling] = useState(false);
  const pct = goalProgress(goal, steps, executions);
  const gSteps = stepsForGoal(steps, goal.id);
  const doneSteps = gSteps.filter((s) => s.done).length;
  const action = nextActionForGoal(goal, steps, executions);

  return (
    <>
      <div className="card-surface border-l-2 border-l-primary p-4">
        <Link to="/objetivo/$id" params={{ id: goal.id }} className="block">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <CategoryIcon category={goal.category} className="h-4 w-4 shrink-0 text-primary" />
              <p className="truncate font-semibold leading-snug">{goal.title}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 font-mono text-xs font-bold text-primary">
              {pct}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            prazo {goal.deadlineLabel}
            {gSteps.length > 0 ? ` · ${doneSteps}/${gSteps.length} etapas` : ""}
          </p>
          <GreenProgressBar pct={pct} className="mt-3 h-1.5" />
        </Link>
        {action.kind === "define" || action.kind === "none" ? (
          <Link
            to="/objetivo/$id"
            params={{ id: goal.id }}
            search={
              action.kind === "define" ? { openStep: action.step.id, create: true } : undefined
            }
            className="mt-3 block text-[11px] font-semibold text-primary"
          >
            + Definir próxima ação
          </Link>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Link
              to="/objetivo/$id"
              params={{ id: goal.id }}
              className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-primary"
            >
              Próxima ação: {nextActionLabel(action)}
            </Link>
            {action.kind === "execution" && (
              <button
                onClick={() => setScheduling(true)}
                aria-label="Agendar próxima ação"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10"
              >
                <CalendarClock className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {scheduling && action.kind === "execution" && (
        <QuickScheduleModal execution={action.execution} onClose={() => setScheduling(false)} />
      )}
    </>
  );
}
