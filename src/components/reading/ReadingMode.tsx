import { useEffect, useState } from "react";
import { X, Play, Pause, Quote, Lightbulb, StickyNote, Star } from "lucide-react";
import {
  useReadingStore,
  finishSession,
  pauseSession,
  resumeSession,
  completeBook,
  getBookProgress,
  sessionElapsedSeconds,
  formatDuration,
  type Book,
  type ReadingNoteType,
} from "@/lib/reading-store";
import { ReadingNoteEditor } from "./ReadingNoteEditor";

function modeLabel(book: Book): string {
  if (book.progressMode === "pages") return "Página onde parou";
  if (book.progressMode === "percentage") return "% onde parou";
  return "Minuto onde parou";
}
function toDisplayValue(book: Book, current: number): string {
  return book.progressMode === "time" ? String(Math.round(current / 60)) : String(current);
}
function toStoredValue(book: Book, display: number): number {
  return book.progressMode === "time" ? display * 60 : display;
}

type Step = "active" | "finishInput" | "summary" | "confirmComplete" | "rating";

export function ReadingMode({
  book,
  sessionId,
  onClose,
}: {
  book: Book;
  sessionId: string;
  onClose: () => void;
}) {
  const session = useReadingStore((s) => s.sessions.find((x) => x.id === sessionId));
  const [tick, setTick] = useState(0);
  const [step, setStep] = useState<Step>("active");
  const [noteType, setNoteType] = useState<ReadingNoteType | null>(null);
  const [endValue, setEndValue] = useState("");
  const [summary, setSummary] = useState<{
    read: number;
    durationSeconds: number;
    completed: boolean;
  } | null>(null);
  const [rating, setRating] = useState(0);
  const [takeaway, setTakeaway] = useState("");
  const [reflection, setReflection] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!session) return null;
  const progress = getBookProgress(book);
  const paused = !!session.pausedSince;
  const elapsed = sessionElapsedSeconds(session);
  void tick;

  const startFinish = () => {
    setEndValue(toDisplayValue(book, progress.current));
    setStep("finishInput");
  };

  const confirmFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError("");
    try {
      const stored = toStoredValue(book, parseFloat(endValue) || 0);
      const res = await finishSession(sessionId, stored);
      if (!res.ok) {
        setFinishError("Não foi possível finalizar a sessão. Tente de novo.");
        return;
      }
      setSummary({
        read: res.pagesOrUnitsRead ?? 0,
        durationSeconds: res.durationSeconds ?? 0,
        completed: !!res.completed,
      });
      setStep("summary");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-5 pt-12">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{book.title}</p>
          <p className="text-[11px] text-muted-foreground">
            Começando em {progress.label.toLowerCase()}
          </p>
        </div>
        <button onClick={onClose}>
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {step === "active" && (
        <div className="flex flex-1 flex-col items-center justify-center px-5">
          <p className="font-mono text-5xl font-bold text-primary">{formatDuration(elapsed)}</p>
          <button
            onClick={() => void (paused ? resumeSession(sessionId) : pauseSession(sessionId))}
            className="mt-6 flex items-center gap-2 rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold"
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            {paused ? "retomar" : "pausar"}
          </button>

          <div className="mt-10 flex gap-3">
            <QuickAction icon={Quote} label="Frase" onClick={() => setNoteType("quote")} />
            <QuickAction icon={Lightbulb} label="Insight" onClick={() => setNoteType("insight")} />
            <QuickAction icon={StickyNote} label="Nota" onClick={() => setNoteType("note")} />
          </div>

          <button
            onClick={startFinish}
            className="mt-12 w-full max-w-xs rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Finalizar leitura
          </button>
        </div>
      )}

      {step === "finishInput" && (
        <div className="flex-1 px-5 py-8">
          <h3 className="text-lg font-bold">Onde você parou?</h3>
          <label className="mt-4 block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              {modeLabel(book)}
            </span>
            <input
              type="number"
              autoFocus
              value={endValue}
              onChange={(e) => setEndValue(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          {finishError && <p className="mt-3 text-xs text-danger">{finishError}</p>}
          <button
            onClick={confirmFinish}
            disabled={finishing}
            className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {finishing ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      )}

      {step === "summary" && summary && (
        <div className="flex-1 px-5 py-8">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Sessão concluída</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-primary/10 p-3">
              <p className="text-xl font-bold text-primary">
                {formatDuration(summary.durationSeconds)}
              </p>
              <p className="text-[10px] uppercase text-muted-foreground">tempo de leitura</p>
            </div>
            <div className="rounded-xl bg-success/10 p-3">
              <p className="text-xl font-bold text-success">{summary.read}</p>
              <p className="text-[10px] uppercase text-muted-foreground">
                {book.progressMode === "pages"
                  ? "páginas"
                  : book.progressMode === "percentage"
                    ? "% avançado"
                    : "seg lidos"}
              </p>
            </div>
          </div>
          <button
            onClick={() => (summary.completed ? setStep("confirmComplete") : onClose())}
            className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            {summary.completed ? "Continuar" : "Fechar"}
          </button>
        </div>
      )}

      {step === "confirmComplete" && (
        <div className="flex-1 px-5 py-8">
          <h3 className="text-lg font-bold">Você terminou este livro.</h3>
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={async () => {
                await completeBook(book.id);
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
        </div>
      )}

      {step === "rating" && (
        <div className="flex-1 overflow-y-auto px-5 py-8">
          <h3 className="text-lg font-bold">Como foi essa leitura?</h3>
          <div className="mt-3 flex gap-1">
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
              onClick={async () => {
                await completeBook(book.id, {
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
        </div>
      )}

      {noteType && (
        <ReadingNoteEditor
          book={book}
          sessionId={sessionId}
          type={noteType}
          onClose={() => setNoteType(null)}
          onSaved={() => setNoteType(null)}
        />
      )}
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Quote;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </button>
  );
}
