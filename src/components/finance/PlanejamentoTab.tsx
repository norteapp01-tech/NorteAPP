import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  useFinanceStore,
  limitsWithProgress,
  biggestFlexibleCategory,
  setSavingsGoal,
  addCategoryLimit,
  updateCategoryLimit,
  removeCategoryLimit,
  setIntention,
  formatBRL,
  FINANCE_CATEGORIES,
} from "@/lib/finance-store";
import { Card } from "@/components/sub-agenda-shared";

export function PlanejamentoTab({ month }: { month: string }) {
  const state = useFinanceStore((s) => s);
  const currentGoal = state.savingsGoals.find((g) => g.month === month)?.targetAmount ?? 0;
  const limits = limitsWithProgress(state.transactions, state.categoryLimits, month);
  const activeIntention = state.intentions[0];

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalValue, setGoalValue] = useState(String(currentGoal || ""));
  const [addingLimit, setAddingLimit] = useState(false);
  const [limitCategory, setLimitCategory] = useState(FINANCE_CATEGORIES[0].id);
  const [limitValue, setLimitValue] = useState("");
  const [editingLimitId, setEditingLimitId] = useState<string | null>(null);
  const [editingLimitValue, setEditingLimitValue] = useState("");
  const [intentionText, setIntentionText] = useState("");
  const [showIntentionForm, setShowIntentionForm] = useState(false);

  const saveGoal = () => {
    setSavingsGoal(month, parseFloat(goalValue) || 0);
    setEditingGoal(false);
  };

  const saveNewLimit = () => {
    const value = parseFloat(limitValue);
    if (!value || value <= 0) return;
    addCategoryLimit(limitCategory, value);
    setLimitValue("");
    setAddingLimit(false);
  };

  const orientation = (() => {
    const flexible = biggestFlexibleCategory(state.transactions, month);
    return flexible
      ? `Nas últimas semanas, seu maior gasto flexível foi ${flexible.category.toLowerCase()} (${formatBRL(flexible.amount)}).`
      : null;
  })();

  return (
    <div className="space-y-5">
      <Card title="Meta de guardar este mês">
        {!editingGoal ? (
          <div className="flex items-center justify-between">
            <p className="text-2xl font-bold">{formatBRL(currentGoal)}</p>
            <button onClick={() => setEditingGoal(true)} className="text-xs text-primary">
              editar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number"
              autoFocus
              value={goalValue}
              onChange={(e) => setGoalValue(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={saveGoal}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              Salvar
            </button>
          </div>
        )}
      </Card>

      <Card title="Limites por categoria">
        {limits.length === 0 && !addingLimit && (
          <p className="text-sm text-muted-foreground">Nenhum limite configurado ainda.</p>
        )}
        <ul className="space-y-2">
          {limits.map((l) => {
            const pct = l.limit > 0 ? Math.min(100, Math.round((l.spent / l.limit) * 100)) : 0;
            return (
              <li key={l.id} className="rounded-lg border border-border bg-surface-2 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">{l.category}</span>
                  <div className="flex items-center gap-2">
                    {editingLimitId === l.id ? (
                      <>
                        <input
                          type="number"
                          autoFocus
                          value={editingLimitValue}
                          onChange={(e) => setEditingLimitValue(e.target.value)}
                          className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
                        />
                        <button
                          onClick={() => {
                            updateCategoryLimit(l.id, parseFloat(editingLimitValue) || l.limit);
                            setEditingLimitId(null);
                          }}
                          className="text-primary"
                        >
                          ok
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground">
                          {formatBRL(l.spent)} / {formatBRL(l.limit)}
                        </span>
                        <button
                          onClick={() => {
                            setEditingLimitId(l.id);
                            setEditingLimitValue(String(l.limit));
                          }}
                          className="text-primary"
                        >
                          editar
                        </button>
                        <button
                          onClick={() => removeCategoryLimit(l.id)}
                          className="text-muted-foreground hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>

        {!addingLimit ? (
          <button
            onClick={() => setAddingLimit(true)}
            className="mt-2 flex items-center gap-1.5 text-xs text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> adicionar limite
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border p-2.5">
            <select
              value={limitCategory}
              onChange={(e) => setLimitCategory(e.target.value)}
              className="flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
            >
              {FINANCE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
              placeholder="R$"
              className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
            <button onClick={saveNewLimit} className="text-primary">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </Card>

      <Card title="Decisão temporária">
        {activeIntention && !showIntentionForm ? (
          <div>
            <p className="text-sm">"{activeIntention.text}"</p>
            {orientation && <p className="mt-2 text-xs text-muted-foreground">{orientation}</p>}
            <button
              onClick={() => setShowIntentionForm(true)}
              className="mt-2 text-xs text-primary"
            >
              criar nova intenção
            </button>
          </div>
        ) : (
          <div>
            <textarea
              autoFocus
              value={intentionText}
              onChange={(e) => setIntentionText(e.target.value)}
              placeholder="ex: quero gastar menos essa semana para guardar dinheiro para minha viagem"
              className="min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => {
                if (!intentionText.trim()) return;
                setIntention(intentionText);
                setIntentionText("");
                setShowIntentionForm(false);
              }}
              disabled={!intentionText.trim()}
              className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              Salvar intenção
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
