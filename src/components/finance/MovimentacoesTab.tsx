import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useFinanceStore, formatBRL, monthOf, type Transaction } from "@/lib/finance-store";
import { todayISO } from "@/lib/goals-store";
import { nowDate } from "@/lib/test-clock";

type Filter = "all" | "expense" | "income";

function dayLabel(date: string): string {
  const today = todayISO();
  if (date === today) return "Hoje";
  const yesterday = nowDate();
  yesterday.setDate(yesterday.getDate() - 1);
  const yISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (date === yISO) return "Ontem";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function MovimentacoesTab({
  month,
  initialQuery = "",
}: {
  month: string;
  initialQuery?: string;
}) {
  const transactions = useFinanceStore((s) => s.transactions);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const normalizedQuery = query.trim().toLowerCase();
  const monthTransactions = transactions.filter((t) => monthOf(t.date) === month);
  const monthIncome = monthTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const monthExpenses = monthTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const filtered = monthTransactions
    .filter((t) => filter === "all" || t.type === filter)
    .filter(
      (t) =>
        !normalizedQuery ||
        t.description.toLowerCase().includes(normalizedQuery) ||
        t.category.toLowerCase().includes(normalizedQuery),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const groups = new Map<string, Transaction[]>();
  for (const t of filtered) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date)!.push(t);
  }
  const orderedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="finance-records">
      <div className="finance-search">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar lançamento ou categoria..."
          className="finance-search-input"
        />
      </div>

      <div className="norte-segmented finance-record-filters">
        {(
          [
            ["all", "Todos"],
            ["expense", "Gastos"],
            ["income", "Entradas"],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} className="px-3">
            {label}
          </button>
        ))}
      </div>

      <div className="finance-record-summary">
        <span>{monthTransactions.length} lançamentos neste mês</span>
        <span>
          Entrou <strong>{formatBRL(monthIncome)}</strong> · Saiu <b>{formatBRL(monthExpenses)}</b>
        </span>
      </div>

      {orderedDates.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nada por aqui ainda.</p>
      )}

      {orderedDates.map((date) => (
        <section key={date} className="finance-record-group">
          <p className="finance-record-date">{dayLabel(date)}</p>
          <div className="finance-record-list">
            <ul>
              {groups.get(date)!.map((t) => (
                <li key={t.id} className="finance-record-row">
                  <span className={`finance-record-icon finance-record-icon--${t.type}`} />
                  <div className="finance-record-copy">
                    <p>{t.description}</p>
                    <span>{t.category}</span>
                  </div>
                  <span className={`finance-record-value finance-record-value--${t.type}`}>
                    {t.type === "income" ? "+" : "−"} {formatBRL(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
