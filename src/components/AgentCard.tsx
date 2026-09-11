import { useState } from "react";
import { CalendarDays, ChevronRight, Wallet, Utensils, Route, Check } from "lucide-react";
import { correctTransaction } from "@/lib/finance-store";
import { executeTool } from "@/lib/agent/tools";

type Item = {
  actions?: string[];
  id?: string;
  title: string;
  startTime?: string;
  agendaDate?: string;
  targetDate?: string;
  status?: string;
};
export type CardData = {
  card: string;
  id?: string;
  title?: string;
  description?: string;
  amount?: number;
  category?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  deadlineLabel?: string;
  deadlineISO?: string;
  steps?: Item[];
  items?: Item[];
  breakdown?: { category: string; amount: number }[];
  protein?: number;
  carbs?: number;
  fat?: number;
  calories?: number;
};
export function parseCard(result: string): CardData | null {
  try {
    const d = JSON.parse(result);
    return ["finance", "appointment", "agenda", "plan", "nutrition"].includes(d.card) ? d : null;
  } catch {
    return null;
  }
}
const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (date?: string) => (date ? date.split("-").reverse().join("/") : "Sem data");

export function AgentCard({
  data,
  proposed = false,
  onPrompt,
  onChange,
  disabled = false,
}: {
  data: CardData;
  proposed?: boolean;
  onPrompt: (text: string) => void;
  onChange?: (data: CardData) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data);
  const [amount, setAmount] = useState(String(data.amount ?? ""));
  const [description, setDescription] = useState(data.description ?? "");
  const [date, setDate] = useState(data.date ?? "");
  const [time, setTime] = useState(data.startTime ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(data.category);
  const financial = data.card === "finance",
    plan = data.card === "plan",
    nutrition = data.card === "nutrition",
    agenda = data.card === "agenda";
  const Icon = financial ? Wallet : plan ? Route : nutrition ? Utensils : CalendarDays;
  const title = financial
    ? "Movimentação registrada"
    : plan
      ? proposed
        ? "Proposta de planejamento"
        : "Planejamento criado"
      : nutrition
        ? "Refeição registrada"
        : agenda
          ? data.title
          : "Compromisso marcado";
  const breakdown = value.breakdown || [];
  const total = breakdown.reduce((sum, c) => sum + c.amount, 0);
  const categoryAmount = breakdown.find((c) => c.category === selected)?.amount ?? 0;
  const pct = total ? Math.min(100, Math.max(0, (categoryAmount / total) * 100)) : 0;
  async function save() {
    if (!value.id || saving) return;
    setSaving(true);
    setError("");
    try {
      if (financial) {
        const n = Number(amount.replace(",", "."));
        if (!Number.isFinite(n) || n <= 0 || !description.trim())
          throw new Error("Informe valor positivo e descrição.");
        await correctTransaction(value.id, { amount: n, description: description.trim() });
        const updated = {
          ...value,
          amount: n,
          description: description.trim(),
          breakdown: value.breakdown?.map((c) =>
            c.category === value.category
              ? { ...c, amount: c.amount + n - (value.amount || 0) }
              : c,
          ),
        };
        setValue(updated);
        onChange?.(updated);
      } else {
        if (!date || !time) throw new Error("Informe data e horário.");
        const result = await executeTool("reagendar_execucao", {
          executionId: value.id,
          date,
          startTime: time,
        });
        const card = parseCard(result);
        if (!card) throw new Error(result);
        setValue(card);
        onChange?.(card);
      }
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="rounded-2xl border border-border bg-surface/40 p-4"
      data-testid={`agent-card-${data.card}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <Icon size={22} className="shrink-0 text-primary" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">{title}</p>
      </div>
      {financial && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold tracking-tight">{money(value.amount || 0)}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {value.category} · {value.description}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{dateLabel(value.date)}</p>
            </div>
            {total > 0 && (
              <div className="shrink-0 text-center">
                <div
                  role="img"
                  aria-label={`${selected}: ${pct.toFixed(0)}% dos gastos do mês`}
                  className="relative h-20 w-20 rounded-full"
                  style={{ background: `conic-gradient(var(--primary) ${pct}%, var(--border) 0)` }}
                >
                  <div className="absolute inset-3 rounded-full bg-background" />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Gastos do mês</p>
              </div>
            )}
          </div>
          {total > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {breakdown.map((c) => (
                <button
                  key={c.category}
                  onClick={() => setSelected(c.category)}
                  className={`rounded-lg px-2 py-1 text-[11px] ${selected === c.category ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                >
                  {c.category} {money(c.amount)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {data.card === "appointment" && (
        <>
          <p className="text-xl font-semibold">{value.title}</p>
          <div className="mt-3 flex items-center gap-3">
            <p className="text-2xl font-semibold text-primary">
              {value.startTime || "Sem horário"}
            </p>
            <p className="text-sm text-muted-foreground">{dateLabel(value.date)}</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Salvo na sua agenda</p>
        </>
      )}
      {plan && (
        <>
          <p className="font-semibold">{data.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.deadlineLabel || "Sem prazo"}</p>
          <ol className="mt-4 space-y-3 border-l border-primary/50 pl-4">
            {(data.steps || []).map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary" />
                <p className="text-sm">{s.title}</p>
                {s.actions?.map((action, j) => (
                  <p key={j} className="mt-1 text-xs text-muted-foreground">
                    · {action}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground">
                  {s.targetDate ? dateLabel(s.targetDate) : "Prazo a definir"}
                </p>
              </li>
            ))}
          </ol>
          {proposed && (
            <p className="mt-3 text-xs text-muted-foreground">
              Etapas sugeridas · ainda não salvas
            </p>
          )}
        </>
      )}
      {agenda && (
        <div className="divide-y divide-border">
          {(data.items || []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum compromisso neste período.</p>
          )}
          {(data.items || []).map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 py-3">
              <div>
                <p className="text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.startTime || "Sem horário"}
                  {item.agendaDate ? ` · ${dateLabel(item.agendaDate)}` : ""}
                </p>
              </div>
              {item.status === "concluida" ? (
                <Check size={18} className="text-primary" />
              ) : (
                <button
                  disabled={disabled}
                  onClick={() =>
                    onPrompt(
                      `Quero reagendar ${item.title} (${item.agendaDate || "hoje"}, ${item.startTime || "sem horário"}). `,
                    )
                  }
                  className="rounded-lg border border-primary/40 px-2 py-2 text-xs text-primary"
                >
                  Reagendar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {nutrition && (
        <>
          <p className="mb-3 text-sm">{data.description}</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Proteína", data.protein, "g"],
              ["Carboidratos", data.carbs, "g"],
              ["Gorduras", data.fat, "g"],
              ["Calorias", data.calories, "kcal"],
            ].map(([label, number, unit]) => (
              <div key={String(label)} className="rounded-xl bg-surface-2 p-3">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">
                  {number ?? "—"} <span className="text-xs">{unit}</span>
                </p>
              </div>
            ))}
          </div>
        </>
      )}
      {editing && (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          {financial ? (
            <>
              <label className="block text-xs">
                Valor
                <input
                  aria-label="Valor"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-surface-2 p-2 text-sm"
                />
              </label>
              <label className="block text-xs">
                Descrição
                <input
                  aria-label="Descrição"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-surface-2 p-2 text-sm"
                />
              </label>
            </>
          ) : (
            <>
              <label className="block text-xs">
                Data
                <input
                  aria-label="Data"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-surface-2 p-2"
                />
              </label>
              <label className="block text-xs">
                Horário
                <input
                  aria-label="Horário"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-surface-2 p-2"
                />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <button
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            {saving ? "Salvando…" : "Salvar ajuste"}
          </button>
        </div>
      )}
      {(financial || data.card === "appointment") && value.id && (
        <button
          onClick={() => setEditing(!editing)}
          className="mt-4 flex w-full items-center justify-between rounded-xl border border-border px-3 py-3 text-sm"
        >
          {editing ? "Fechar ajuste" : "Ajustar registro"}
          <ChevronRight size={17} />
        </button>
      )}
      {plan && (
        <a
          href={data.id ? `/objetivo/${data.id}` : undefined}
          onClick={
            proposed
              ? (e) => {
                  e.preventDefault();
                  onPrompt("Quero ajustar as etapas dessa proposta: ");
                }
              : undefined
          }
          className="mt-4 flex cursor-pointer items-center justify-between rounded-xl border border-border p-3 text-sm"
        >
          {proposed ? "Ajustar proposta" : "Ver planejamento"}
          <ChevronRight size={17} />
        </a>
      )}
      {nutrition && (
        <a
          className="mt-4 block rounded-xl border border-border p-3 text-sm"
          href="/sub-agenda/alimentacao"
        >
          Ver alimentação →
        </a>
      )}
    </div>
  );
}
