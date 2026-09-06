import { useState } from "react";
import { ChevronRight, ChevronUp, Trophy } from "lucide-react";
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

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2"
      >
        <span className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">
          <Trophy className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          <span>Planos concluídos</span>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-semibold">
            {completed.length}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && completed.length === 0 && (
        <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
          Seus planos concluídos aparecerão aqui.
        </p>
      )}
      {open && completed.length > 0 && (
        <div className="space-y-2.5 border-t border-border p-3">
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
