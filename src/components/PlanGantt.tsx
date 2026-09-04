import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useGoalsStore, goalProgress, goalPace } from "@/lib/goals-store";
import { nowDate } from "@/lib/test-clock";

const monthShort = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const paceColor: Record<string, string> = {
  ahead: "oklch(0.82 0.16 85)",
  ontrack: "oklch(0.82 0.18 145)",
  behind: "oklch(0.7 0.2 25)",
};

/** Gantt panorâmico de todos os planejamentos — embutido direto em Planos. */
export function PlanGantt() {
  const goals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const executions = useGoalsStore((s) => s.executions);

  const { months, rows } = useMemo(() => {
    const now = nowDate();
    let minMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let maxMonth = new Date(now.getFullYear(), now.getMonth() + 5, 1);
    for (const g of goals) {
      const created = new Date(g.createdAt);
      const createdMonth = new Date(created.getFullYear(), created.getMonth(), 1);
      if (createdMonth < minMonth) minMonth = createdMonth;
      if (g.deadlineISO) {
        const d = new Date(g.deadlineISO);
        const dMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        if (dMonth > maxMonth) maxMonth = dMonth;
      }
    }
    const totalMonths = Math.min(
      12,
      Math.max(
        4,
        (maxMonth.getFullYear() - minMonth.getFullYear()) * 12 +
          (maxMonth.getMonth() - minMonth.getMonth()) +
          1,
      ),
    );
    const months = Array.from(
      { length: totalMonths },
      (_, i) => new Date(minMonth.getFullYear(), minMonth.getMonth() + i, 1),
    );
    const monthIndex = (d: Date) =>
      Math.max(
        0,
        Math.min(
          totalMonths - 1,
          (d.getFullYear() - minMonth.getFullYear()) * 12 + (d.getMonth() - minMonth.getMonth()),
        ),
      );

    const rows = goals.map((g) => {
      const start = monthIndex(new Date(g.createdAt));
      const end = g.deadlineISO
        ? monthIndex(new Date(g.deadlineISO))
        : Math.min(totalMonths - 1, start + 3);
      return {
        goal: g,
        start,
        end: Math.max(start, end),
        progress: goalProgress(g, steps, executions),
        pace: goalPace(g, steps, executions),
      };
    });
    return { months, rows };
  }, [goals, steps, executions]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Andamento dos meus planos
        </h2>
      </div>
      <div className="mt-3 flex gap-4 text-[11px]">
        <Legend color={paceColor.ontrack} label="No ritmo" />
        <Legend color={paceColor.behind} label="Atrasado" />
        <Legend color={paceColor.ahead} label="Adiantado" />
      </div>

      <div className="card-surface mt-3 overflow-x-auto">
        <div style={{ minWidth: `${120 + months.length * 64}px` }}>
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: `120px repeat(${months.length}, 1fr)` }}
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              Planejamento
            </div>
            {months.map((m, i) => (
              <div
                key={i}
                className="border-l border-border px-2 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground"
              >
                {monthShort[m.getMonth()]}
              </div>
            ))}
          </div>
          {rows.map((row) => (
            <Link
              to="/objetivo/$id"
              params={{ id: row.goal.id }}
              key={row.goal.id}
              className="grid border-b border-border last:border-0 hover:bg-surface-2"
              style={{ gridTemplateColumns: `120px repeat(${months.length}, 1fr)` }}
            >
              <div className="flex items-center px-3 py-3">
                <p className="truncate text-xs font-semibold">{row.goal.title}</p>
              </div>
              <div
                className="relative my-3 border-l border-border"
                style={{ gridColumn: `2 / span ${months.length}` }}
              >
                <div
                  className="absolute inset-y-0 flex items-center"
                  style={{
                    left: `${(row.start / months.length) * 100}%`,
                    width: `${((row.end - row.start + 1) / months.length) * 100}%`,
                  }}
                >
                  <div
                    className="relative h-6 w-full overflow-hidden rounded-md"
                    style={{
                      background: `color-mix(in oklab, ${paceColor[row.pace]} 22%, transparent)`,
                      border: `1px solid color-mix(in oklab, ${paceColor[row.pace]} 50%, transparent)`,
                    }}
                  >
                    <div
                      className="h-full rounded-md"
                      style={{ width: `${row.progress}%`, background: paceColor[row.pace] }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold mix-blend-difference text-white">
                      {row.progress}%
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nenhum planejamento ainda.
            </div>
          )}
        </div>
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
