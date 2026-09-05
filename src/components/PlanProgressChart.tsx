import { Link } from "@tanstack/react-router";
import { useGoalsStore, goalProgress, goalPace, isGoalComplete } from "@/lib/goals-store";

const paceColor: Record<string, string> = {
  ahead: "oklch(0.82 0.16 85)",
  ontrack: "oklch(0.82 0.18 145)",
  behind: "oklch(0.7 0.2 25)",
};

const ticks = [0, 20, 40, 60, 80, 100];

/** Comparação de progresso de todos os planejamentos — 0% a 100%, uma barra por plano. */
export function PlanProgressChart() {
  const goals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const executions = useGoalsStore((s) => s.executions);

  // Plano 100% concluído já tem seu próprio lugar em "Planos concluídos" — não
  // precisa de barra de progresso aqui (progresso é sempre 100, não agrega nada).
  const rows = goals
    .filter((g) => !isGoalComplete(g, steps, executions))
    .map((g) => ({
      goal: g,
      progress: goalProgress(g, steps, executions),
      pace: goalPace(g, steps, executions),
    }));

  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
        Progresso dos meus planos
      </h2>
      <div className="mt-3 flex gap-4 text-[11px]">
        <Legend color={paceColor.ontrack} label="No ritmo" />
        <Legend color={paceColor.behind} label="Atrasado" />
        <Legend color={paceColor.ahead} label="Adiantado" />
      </div>

      <div className="card-surface mt-3 p-4">
        {rows.length === 0 ? (
          <p className="p-2 text-center text-sm text-muted-foreground">
            {goals.length > 0
              ? "Todos os seus planos ativos estão concluídos."
              : "Nenhum planejamento ainda."}
          </p>
        ) : (
          <div className="relative">
            <div className="mb-3 flex justify-between text-[10px] text-muted-foreground">
              {ticks.map((t) => (
                <span key={t}>{t}%</span>
              ))}
            </div>

            <div className="relative space-y-4">
              <div className="pointer-events-none absolute inset-0">
                {ticks.map((t) => (
                  <div
                    key={t}
                    className="absolute inset-y-0 w-px bg-border"
                    style={{ left: `${t}%` }}
                  />
                ))}
              </div>

              {rows.map((row) => (
                <Link
                  to="/objetivo/$id"
                  params={{ id: row.goal.id }}
                  key={row.goal.id}
                  className="relative block"
                >
                  <p className="truncate text-xs font-semibold">{row.goal.title}</p>
                  <div className="relative mt-1.5 h-5 overflow-hidden rounded-md bg-surface-2">
                    <div
                      className="h-full rounded-md transition-[width]"
                      style={{ width: `${row.progress}%`, background: paceColor[row.pace] }}
                    />
                    <span className="absolute inset-0 flex items-center justify-end px-2 font-mono text-[10px] font-bold text-foreground">
                      {row.progress}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
