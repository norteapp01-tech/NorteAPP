import { useState, type ReactNode } from "react";
import { X, Star } from "lucide-react";
import { updateProgress, completeBook, getBookProgress, type Book } from "@/lib/reading-store";

function modeLabel(book: Book): string {
  if (book.progressMode === "pages") return "Página atual";
  if (book.progressMode === "percentage") return "% concluído";
  return "Tempo ouvido (min)";
}

function toDisplayValue(book: Book, current: number): string {
  return book.progressMode === "time" ? String(Math.round(current / 60)) : String(current);
}

function toStoredValue(book: Book, display: number): number {
  return book.progressMode === "time" ? display * 60 : display;
}

export function ReadingProgressUpdater({ book, onClose }: { book: Book; onClose: () => void }) {
  const progress = getBookProgress(book);
  const [value, setValue] = useState(toDisplayValue(book, progress.current));
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [step, setStep] = useState<"edit" | "confirmComplete" | "rating">("edit");
  const [rating, setRating] = useState(0);
  const [takeaway, setTakeaway] = useState("");
  const [reflection, setReflection] = useState("");

  const submit = (confirm = false) => {
    const stored = toStoredValue(book, parseFloat(value) || 0);
    const res = updateProgress(book.id, stored, { confirm });
    if (!res.ok) {
      if (res.needsConfirmation) {
        setNeedsConfirm(true);
        return;
      }
      setError(res.error ?? "valor inválido");
      return;
    }
    setError(null);
    setNeedsConfirm(false);
    if (res.completed) setStep("confirmComplete");
    else onClose();
  };

  if (step === "confirmComplete") {
    return (
      <Sheet onClose={onClose} title="Fim de livro">
        <p className="text-sm">Você terminou este livro.</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => {
              completeBook(book.id);
              setStep("rating");
            }}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Concluir livro
          </button>
          <button onClick={onClose} className="w-full py-2 text-xs text-muted-foreground">
            Continuar como lendo
          </button>
        </div>
      </Sheet>
    );
  }

  if (step === "rating") {
    return (
      <Sheet onClose={onClose} title="Como foi essa leitura?">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)}>
              <Star
                className={`h-6 w-6 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`}
              />
            </button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            O que vale lembrar deste livro?
          </span>
          <textarea
            value={takeaway}
            onChange={(e) => setTakeaway(e.target.value)}
            className="min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="mt-2 block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            O que esse livro mudou na sua cabeça?
          </span>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            className="min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => {
              completeBook(book.id, {
                rating: rating || undefined,
                mainTakeaway: takeaway.trim() || undefined,
                personalReflection: reflection.trim() || undefined,
              });
              onClose();
            }}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Salvar
          </button>
          <button onClick={onClose} className="text-xs text-muted-foreground">
            pular
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} title="Atualizar progresso">
      <p className="text-xs text-muted-foreground">{book.title}</p>
      <label className="mt-3 block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
          {modeLabel(book)}
        </span>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setNeedsConfirm(false);
            setError(null);
          }}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {needsConfirm && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
          <p>Isso reduz o progresso registrado. Confirmar mesmo assim?</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => submit(true)}
              className="rounded-lg bg-warning px-3 py-1.5 font-semibold text-background"
            >
              Confirmar
            </button>
            <button onClick={() => setNeedsConfirm(false)} className="text-muted-foreground">
              cancelar
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => submit(false)}
        className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
      >
        Salvar progresso
      </button>
    </Sheet>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-md rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
