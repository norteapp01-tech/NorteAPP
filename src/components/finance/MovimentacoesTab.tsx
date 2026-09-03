import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useFinanceStore, formatBRL, type Transaction } from "@/lib/finance-store";
import { todayISO } from "@/lib/goals-store";

type Filter = "all" | "expense" | "income";

function dayLabel(date: string): string {
  const today = todayISO();
  if (date === today) return "Hoje";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  if (date === yISO) return "Ontem";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function MovimentacoesTab({ initialQuery = "" }: { initialQuery?: string }) {
  const transactions = useFinanceStore((s) => s.transactions);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = transactions
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar lançamento ou categoria..."
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ["all", "Todos"],
            ["expense", "Gastos"],
            ["income", "Entradas"],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === f ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {orderedDates.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nada por aqui ainda.</p>
      )}

      {orderedDates.map((date) => (
        <div key={date}>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {dayLabel(date)}
          </p>
          <div className="card-surface p-4">
            <ul className="divide-y divide-border">
              {groups.get(date)!.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.description}</p>
                    <p className="text-[11px] text-muted-foreground">{t.category}</p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-bold ${t.type === "income" ? "text-success" : "text-danger"}`}
                  >
                    {t.type === "income" ? "+" : "−"} {formatBRL(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
