import { useState } from "react";
import {
  setReadingPlan,
  targetUnitForBook,
  type Book,
  type ReadingPlanType,
} from "@/lib/reading-store";

function unitPromptLabel(book: Book): string {
  if (book.progressMode === "pages") return "páginas por sessão";
  if (book.progressMode === "percentage") return "% por sessão";
  return "minutos por sessão";
}

/** Meta compartilhada por Adicionar Livro e pela ficha do livro — prazo OU meta diária, nunca os dois. */
export function ReadingPlanSetup({
  book,
  onSave,
  onSkip,
}: {
  book: Book;
  onSave: () => void;
  onSkip?: () => void;
}) {
  const [type, setType] = useState<ReadingPlanType>("deadline");
  const [deadline, setDeadline] = useState("");
  const [amount, setAmount] = useState("");

  const canSave = type === "deadline" ? deadline.trim().length > 0 : parseFloat(amount) > 0;

  const save = () => {
    if (!canSave) return;
    const unit = targetUnitForBook(book);
    const targetAmount =
      type === "daily_target"
        ? unit === "seconds"
          ? (parseFloat(amount) || 0) * 60
          : parseFloat(amount) || 0
        : undefined;
    setReadingPlan(book.id, {
      type,
      deadline: type === "deadline" ? deadline : undefined,
      targetAmount,
    });
    onSave();
  };

  return (
    <div>
      <div className="flex gap-2">
        <button
          onClick={() => setType("deadline")}
          className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${type === "deadline" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface-2 text-muted-foreground"}`}
        >
          Prazo
        </button>
        <button
          onClick={() => setType("daily_target")}
          className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${type === "daily_target" ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface-2 text-muted-foreground"}`}
        >
          Meta diária
        </button>
      </div>

      {type === "deadline" ? (
        <label className="mt-3 block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Terminar até
          </span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      ) : (
        <label className="mt-3 block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            {unitPromptLabel(book)}
          </span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!canSave}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Salvar plano
        </button>
        {onSkip && (
          <button onClick={onSkip} className="text-xs text-muted-foreground">
            configurar depois
          </button>
        )}
      </div>
    </div>
  );
}
