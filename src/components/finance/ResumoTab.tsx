import { useMemo, useState, type ReactElement } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Target } from "lucide-react";
import {
  useFinanceStore,
  transactionsForMonth,
  categoryBreakdown,
  formatBRL,
  monthLabel,
  type FinancialGoal,
} from "@/lib/finance-store";
import { Card } from "@/components/sub-agenda-shared";

const COLORS = ["#73e37a", "#56b968", "#8ba694", "#6c7c72", "#4e5952", "#343b37"];

export function ResumoTab({
  month,
  onOpenMovements,
  onOpenObjetivos,
}: {
  month: string;
  onOpenMovements: (category?: string) => void;
  onOpenObjetivos: () => void;
}) {
  const state = useFinanceStore((s) => s);
  const monthTransactions = useMemo(
    () => transactionsForMonth(state.transactions, month),
    [state.transactions, month],
  );
  const income = monthTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = monthTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const directed = state.contributions
    .filter((c) => c.date.startsWith(month))
    .reduce((sum, c) => sum + c.amount, 0);
  const unallocated = income - expenses - directed;
  const breakdown = categoryBreakdown(state.transactions, month).slice(0, 6);
  const [selected, setSelected] = useState<string | null>(null);
  const visible = monthTransactions
    .filter((t) => t.type === "expense" && (!selected || t.category === selected))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <section aria-labelledby="month-reading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p
              id="month-reading"
              className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              Leitura de {monthLabel(month)}
            </p>
            <p className="mt-1 text-3xl font-bold">{formatBRL(expenses)}</p>
            <p className="mt-1 text-xs text-muted-foreground">registrados em gastos</p>
          </div>
          <button
            onClick={() => onOpenMovements()}
            className="flex items-center gap-1 text-xs font-semibold text-primary"
          >
            Ver lançamentos <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Fact label="Entrou" value={income} icon={<ArrowUpRight />} />
          <Fact label="Objetivos" value={directed} icon={<Target />} />
          <Fact label="Sem destino" value={unallocated} icon={<ArrowDownRight />} />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Valores baseados apenas no que você registrou no Norte.
        </p>
      </section>

      <Card title="Para onde foi seu dinheiro">
        {breakdown.length === 0 ? (
          <div className="py-5 text-center">
            <p className="text-sm font-semibold">O gráfico começa com o primeiro gasto</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Registre uma movimentação para visualizar a distribuição por categoria.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-5">
              <Donut
                items={breakdown}
                selected={selected}
                onSelect={(category) =>
                  setSelected((current) => (current === category ? null : category))
                }
              />
              <div className="min-w-0 flex-1 space-y-1">
                {breakdown.map((item, index) => (
                  <button
                    key={item.category}
                    onClick={() =>
                      setSelected((current) => (current === item.category ? null : item.category))
                    }
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${selected === item.category ? "bg-primary/10" : ""}`}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: COLORS[index] }}
                      />
                      <span className="truncate">{item.category}</span>
                    </span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{item.pct}%</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">{selected ?? "Gastos recentes"}</p>
                {selected && (
                  <button
                    onClick={() => setSelected(null)}
                    className="text-[10px] text-muted-foreground"
                  >
                    limpar filtro
                  </button>
                )}
              </div>
              <ul className="mt-1 divide-y divide-border">
                {visible.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{t.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.date.split("-").reverse().join("/")} · {t.category}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold">{formatBRL(t.amount)}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onOpenMovements(selected ?? undefined)}
                className="mt-2 text-xs font-semibold text-primary"
              >
                Ver todas as movimentações
              </button>
            </div>
          </>
        )}
      </Card>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">Sonhos e objetivos</h2>
          <button onClick={onOpenObjetivos} className="text-xs text-muted-foreground">
            ver todos
          </button>
        </div>
        {state.goals[0] ? (
          <GoalRow goal={state.goals[0]} onClick={onOpenObjetivos} />
        ) : (
          <button
            onClick={onOpenObjetivos}
            className="card-surface w-full border-dashed p-4 text-left"
          >
            <p className="text-sm font-semibold">Dê um destino ao que você guardar</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie um objetivo com valor e prazo — o planejamento é opcional.
            </p>
          </button>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value, icon }: { label: string; value: number; icon: ReactElement }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <div className="flex items-center gap-1 text-muted-foreground [&_svg]:h-3 [&_svg]:w-3">
        {icon}
        <span className="text-[9px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 truncate text-xs font-bold">{formatBRL(value)}</p>
    </div>
  );
}

function Donut({
  items,
  selected,
  onSelect,
}: {
  items: { category: string; pct: number }[];
  selected: string | null;
  onSelect: (category: string) => void;
}) {
  let offset = 0;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg
        viewBox="0 0 120 120"
        className="h-full w-full -rotate-90"
        aria-label="Distribuição de gastos por categoria"
      >
        <circle
          cx="60"
          cy="60"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          className="text-surface-2"
        />
        {items.map((item, index) => {
          const start = offset;
          offset += item.pct;
          const size = Math.max(1, item.pct - 1);
          return (
            <circle
              key={item.category}
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke={COLORS[index]}
              strokeWidth={selected === item.category ? 15 : 12}
              pathLength="100"
              strokeDasharray={`${size} ${101 - size}`}
              strokeDashoffset={-start}
              className={`cursor-pointer transition-opacity ${selected && selected !== item.category ? "opacity-25" : "opacity-100"}`}
              onClick={() => onSelect(item.category)}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <strong className="text-lg">
          {selected ? `${items.find((item) => item.category === selected)?.pct ?? 0}%` : "100%"}
        </strong>
        <span className="max-w-16 truncate text-[9px] text-muted-foreground">
          {selected ?? "dos gastos"}
        </span>
      </div>
    </div>
  );
}

function GoalRow({ goal, onClick }: { goal: FinancialGoal; onClick: () => void }) {
  const pct =
    goal.targetAmount > 0
      ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100))
      : 0;
  return (
    <button onClick={onClick} className="card-surface w-full p-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{goal.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatBRL(goal.savedAmount)} de {formatBRL(goal.targetAmount)}
          </p>
        </div>
        <span className="text-sm font-bold text-primary">{pct}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </button>
  );
}
