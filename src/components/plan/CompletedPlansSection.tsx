import { useState } from "react";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { categoryMeta } from "@/lib/mock-data";
import {
  isGoalComplete,
  goalCompletionDate,
  formatDateBR,
  stepsForGoal,
  executionsForGoal,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";

/**
 * Planos 100% concluídos saem das listas ativas mas não somem — ficam aqui,
 * ainda abríveis, e voltam sozinhos pros ativos assim que alguém reabrir uma
 * etapa/execução (a filtragem é reativa, não precisa de nenhum código extra).
 */
export function CompletedPlansSection({
  goals,
  steps,
  executions,
}: {
  goals: Goal[];
  steps: Step[];
  executions: Execution[];
}) {
  const [open, setOpen] = useState(false);
  const completed = goals.filter((g) => isGoalComplete(g, steps, executions));

  if (completed.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Trophy className="h-3.5 w-3.5 text-warning" /> Planos concluídos ({completed.length})
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-2.5">
          {completed.map((g) => {
            const cat = categoryMeta[g.category] ?? categoryMeta.generico;
            const gSteps = stepsForGoal(steps, g.id);
            const gExecs = executionsForGoal(executions, g.id);
            const completionDate = goalCompletionDate(g, steps, executions);
            return (
              <Link
                key={g.id}
                to="/objetivo/$id"
                params={{ id: g.id }}
                className="card-surface block p-3.5 hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                      {cat.emoji} {g.lifeArea}
                    </p>
                    <p className="mt-1 font-semibold leading-snug">{g.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {completionDate
                        ? `Concluído em ${formatDateBR(completionDate)}`
                        : "Concluído"}
                      {gSteps.length > 0 ? ` · ${gSteps.length} etapas` : ""}
                      {gExecs.length > 0 ? ` · ${gExecs.length} execuções` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 font-mono text-xs font-bold text-success">
                    100%
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
