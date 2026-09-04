import { useState } from "react";
import { Sparkles } from "lucide-react";
import { parseFinanceEntry } from "@/lib/finance-nl-parser";
import { addTransaction, FINANCE_CATEGORIES, type TransactionType } from "@/lib/finance-store";
import { todayISO } from "@/lib/goals-store";
import { Modal } from "@/components/ui/modal";

type Step = "input" | "confirm";

export function QuickAddSheet({ onClose }: { onClose: () => void }) {
  const [manualMode, setManualMode] = useState(false);
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [notUnderstood, setNotUnderstood] = useState(false);

  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(FINANCE_CATEGORIES[0].id);
  const [date, setDate] = useState(todayISO());
  const [showMore, setShowMore] = useState(false);
  const [recurrence, setRecurrence] = useState<"none" | "monthly">("none");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submitText = () => {
    const parsed = parseFinanceEntry(text);
    if (!parsed) {
      setNotUnderstood(true);
      return;
    }
    setType(parsed.type);
    setAmount(String(parsed.amount));
    setDescription(parsed.description);
    setCategory(parsed.category);
    setDate(todayISO());
    setStep("confirm");
  };

  const startManual = (t: TransactionType) => {
    setManualMode(true);
    setType(t);
    setAmount("");
    setDescription("");
    setCategory(FINANCE_CATEGORIES[0].id);
    setDate(todayISO());
    setStep("confirm");
  };

  const save = async () => {
    if (saving) return;
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) {
      setError("Informe um valor maior que zero.");
      return;
    }
    if (!description.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addTransaction({
        type,
        amount: value,
        description,
        category,
        date,
        recurrence,
        paymentMethod: paymentMethod || undefined,
        note: note || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const title =
    step === "input"
      ? "Registrar"
      : manualMode
        ? type === "expense"
          ? "Gastei"
          : "Recebi"
        : "Confirmar";

  return (
    <Modal
      onClose={onClose}
      title={title}
      footer={
        step === "confirm" && (
          <>
            {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}
            <button
              onClick={save}
              disabled={!amount || !description.trim() || saving}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </>
        )
      }
    >
      {step === "input" && (
        <div>
          <p className="text-sm font-medium">O que aconteceu com seu dinheiro?</p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setNotUnderstood(false);
            }}
            placeholder="ex: comprei uma barrinha de proteína por 8 reais"
            className="mt-2 min-h-20 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
          />
          {notUnderstood && (
            <p className="mt-2 text-xs text-warning">
              Não consegui identificar um valor — tente incluir o valor (ex: "por 8 reais") ou use o
              registro manual abaixo.
            </p>
          )}
          <button
            onClick={submitText}
            disabled={!text.trim()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" /> Interpretar
          </button>

          <div className="mt-5 flex gap-2 border-t border-border pt-4">
            <button
              onClick={() => startManual("expense")}
              className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold"
            >
              Gastei
            </button>
            <button
              onClick={() => startManual("income")}
              className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold"
            >
              Recebi
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-3">
          {!manualMode && (
            <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
              {description} · R${amount} · {category}
            </p>
          )}

          <div className="flex gap-2">
            {(
              [
                ["expense", "Gasto"],
                ["income", "Receita"],
              ] as [TransactionType, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${type === t ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface-2 text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
                Valor (R$)
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">Data</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
              Descrição
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="block">
            <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
              Categoria
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {FINANCE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {!showMore ? (
            <button onClick={() => setShowMore(true)} className="text-xs text-primary">
              Mais opções
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
              <label className="block">
                <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
                  Recorrência
                </span>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as "none" | "monthly")}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="none">Única</option>
                  <option value="monthly">Mensal</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
                  Forma de pagamento (opcional)
                </span>
                <input
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  placeholder="ex: cartão, pix, dinheiro"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
                  Observação (opcional)
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
