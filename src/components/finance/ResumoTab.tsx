import { Lightbulb } from "lucide-react";
import {
  useFinanceStore,
  totalsForMonth,
  categoryBreakdown,
  monthlyTrend,
  computeInsights,
  pendingCheckIn,
  formatBRL,
  monthLabel,
  type FinancialGoal,
} from "@/lib/finance-store";
import { Card } from "@/components/sub-agenda-shared";
import { CheckInCard } from "./CheckInCard";

export function ResumoTab({
  month,
  onOpenCategory,
  onOpenObjetivos,
}: {
  month: string;
  onOpenCategory: (category: string) => void;
  onOpenObjetivos: () => void;
}) {
  const state = useFinanceStore((s) => s);
  const totals = totalsForMonth(state.transactions, state.contributions, state.savingsGoals, month);
  const breakdown = categoryBreakdown(state.transactions, month);
  const trend = monthlyTrend(state.transactions, 6);
  const insights = computeInsights(state, month);
  const checkIn = pendingCheckIn(state.checkIns);
  const maxTrend = Math.max(1, ...trend.flatMap((t) => [t.income, t.expenses]));

  return (
    <div className="space-y-5">
      <Card title="Disponível no planejamento">
        <p className="text-3xl font-bold">{formatBRL(totals.available)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Dentro do que você planejou para este mês.
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <StatChip label="Entrou" value={totals.income} className="text-success" />
          <StatChip label="Saiu" value={totals.expenses} className="text-danger" />
          <StatChip label="Guardado" value={totals.saved} className="text-primary" />
          <StatChip label="Disponível" value={totals.available} className="text-foreground" />
        </div>
      </Card>

      <Card title="Para onde foi seu dinheiro">
        {breakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum gasto registrado em {monthLabel(month)}.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {breakdown.slice(0, 6).map((c) => (
              <li key={c.category}>
                <button onClick={() => onOpenCategory(c.category)} className="w-full text-left">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{c.category}</span>
                    <span className="text-muted-foreground">
                      {formatBRL(c.amount)} · {c.pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-primary" style={{ width: `${c.pct}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Entradas x Gastos">
        <div className="flex items-end justify-between gap-1.5">
          {trend.map((t) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end gap-0.5">
                <div
                  className="flex-1 rounded-t bg-success/70"
                  style={{ height: `${(t.income / maxTrend) * 100}%` }}
                />
                <div
                  className="flex-1 rounded-t bg-danger/70"
                  style={{ height: `${(t.expenses / maxTrend) * 100}%` }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground">
                {monthLabel(t.month).split(" ")[0].slice(0, 3)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-success/70" /> Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-danger/70" /> Gastos
          </span>
        </div>
      </Card>

      {state.goals.length > 0 && (
        <Card title="Objetivos">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
            {state.goals.map((g) => (
              <ObjetivoChip key={g.id} goal={g} onClick={onOpenObjetivos} />
            ))}
          </div>
        </Card>
      )}

      {insights.length > 0 && (
        <Card title="Insight">
          <ul className="space-y-2.5">
            {insights.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-sm">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {checkIn && <CheckInCard checkIn={checkIn} />}
    </div>
  );
}

function StatChip({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xs font-bold ${className}`}>{formatBRL(value)}</p>
    </div>
  );
}

function ObjetivoChip({ goal, onClick }: { goal: FinancialGoal; onClick: () => void }) {
  const pct =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
      : 0;
  return (
    <button
      onClick={onClick}
      className="flex w-28 shrink-0 flex-col items-start gap-1.5 rounded-xl border border-border bg-surface-2 p-2.5 text-left"
    >
      <p className="w-full truncate text-xs font-semibold">{goal.name}</p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{pct}%</span>
    </button>
  );
}
