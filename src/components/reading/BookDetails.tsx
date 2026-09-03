import { useState } from "react";
import { X, Star, Trash2 } from "lucide-react";
import {
  useReadingStore,
  getBookProgress,
  planFor,
  routineFor,
  updateBook,
  startReading,
  pauseBook,
  resumeBook,
  removeBook,
  completeBook,
  formatDuration,
  type Book,
  type BookFormat,
} from "@/lib/reading-store";
import { weekVisualLabels, weekVisualOrder } from "@/components/sub-agenda-shared";
import { BookCover } from "./BookCover";
import { ReadingPlanSetup } from "./ReadingPlanSetup";

type View = "details" | "edit" | "planEdit" | "reflection";

export function BookDetails({
  bookId,
  onClose,
  onOpenReadingMode,
  onOpenProgressUpdater,
  onOpenRoutineSetup,
  onOpenNotebook,
}: {
  bookId: string;
  onClose: () => void;
  onOpenReadingMode: (book: Book) => void;
  onOpenProgressUpdater: (book: Book) => void;
  onOpenRoutineSetup: (book: Book) => void;
  onOpenNotebook: (bookId: string) => void;
}) {
  const state = useReadingStore((s) => s);
  const book = state.books.find((b) => b.id === bookId);
  const [view, setView] = useState<View>("details");
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (!book) return null;
  const progress = getBookProgress(book);
  const plan = planFor(state.plans, bookId);
  const routine = routineFor(state.routines, bookId);
  const sessions = state.sessions
    .filter((s) => s.bookId === bookId && s.status === "completed")
    .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
  const notesCount = state.notes.filter((n) => n.bookId === bookId).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface flex w-full max-w-md flex-col rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
        style={{ maxHeight: "88vh" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">
            {view === "edit"
              ? "Editar livro"
              : view === "planEdit"
                ? "Editar plano"
                : view === "reflection"
                  ? "Reflexão"
                  : "Detalhes"}
          </h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-3 flex-1 space-y-4 overflow-y-auto">
          {view === "details" && (
            <>
              <div className="flex gap-4">
                <BookCover book={book} className="h-28 w-20" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{book.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {book.authors.join(", ") || "autor desconhecido"}
                  </p>
                  <p className="mt-1 text-[11px] uppercase text-muted-foreground">
                    {statusLabel(book.status)} · {formatLabel(book.format)}
                  </p>
                  {book.status !== "want_to_read" && (
                    <>
                      <p className="mt-2 text-sm font-semibold">{progress.label}</p>
                      {progress.total !== undefined && (
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {book.status === "completed" && (
                <div className="rounded-lg bg-surface-2 p-3">
                  {book.rating && (
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-4 w-4 ${n <= (book.rating ?? 0) ? "fill-primary text-primary" : "text-muted-foreground"}`}
                        />
                      ))}
                    </div>
                  )}
                  {book.mainTakeaway && (
                    <p className="mt-2 text-xs">
                      <span className="text-muted-foreground">vale lembrar: </span>
                      {book.mainTakeaway}
                    </p>
                  )}
                  {book.personalReflection && (
                    <p className="mt-1 text-xs">
                      <span className="text-muted-foreground">mudou: </span>
                      {book.personalReflection}
                    </p>
                  )}
                </div>
              )}

              {(book.status === "reading" || book.status === "paused") && (
                <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
                  <p className="font-semibold uppercase text-muted-foreground">Plano</p>
                  {plan ? (
                    <p className="mt-1">
                      {plan.type === "deadline"
                        ? `Terminar até ${plan.deadline?.split("-").reverse().join("/")}`
                        : `Meta diária: ${plan.targetPages ?? plan.targetPercentage ?? Math.round((plan.targetSeconds ?? 0) / 60)}`}
                    </p>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Nenhum plano configurado.</p>
                  )}
                  <button onClick={() => setView("planEdit")} className="mt-1 text-primary">
                    {plan ? "editar plano" : "configurar plano"}
                  </button>

                  <p className="mt-3 font-semibold uppercase text-muted-foreground">Rotina</p>
                  {routine ? (
                    <p className="mt-1">
                      {routine.weekdays
                        .map((d) => weekVisualLabels[weekVisualOrder.indexOf(d)])
                        .join(", ")}{" "}
                      às {routine.time}
                    </p>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Nenhuma rotina configurada.</p>
                  )}
                  <button onClick={() => onOpenRoutineSetup(book)} className="mt-1 text-primary">
                    {routine ? "editar rotina" : "configurar rotina"}
                  </button>
                </div>
              )}

              {sessions.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Sessões
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {sessions.slice(0, 8).map((s) => (
                      <li
                        key={s.id}
                        className="flex justify-between text-[11px] text-muted-foreground"
                      >
                        <span>{(s.endedAt ?? "").slice(0, 10).split("-").reverse().join("/")}</span>
                        <span>{formatDuration(s.durationSeconds ?? 0)}</span>
                        <span>
                          +{s.pagesRead ?? s.percentageRead ?? s.progressSeconds ?? 0}
                          {book.progressMode === "pages"
                            ? " pág"
                            : book.progressMode === "percentage"
                              ? "%"
                              : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button onClick={() => onOpenNotebook(bookId)} className="text-xs text-primary">
                Ver caderno do livro ({notesCount})
              </button>

              <div className="flex flex-col gap-2 pt-2">
                {book.status === "reading" && (
                  <>
                    <button
                      onClick={() => onOpenReadingMode(book)}
                      className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
                    >
                      Continuar leitura
                    </button>
                    <button
                      onClick={() => onOpenProgressUpdater(book)}
                      className="w-full rounded-xl border border-border py-2.5 text-sm font-semibold"
                    >
                      Atualizar progresso
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => pauseBook(book.id)}
                        className="flex-1 rounded-xl bg-surface-2 py-2 text-xs font-semibold"
                      >
                        Pausar
                      </button>
                      <button
                        onClick={() => setView("edit")}
                        className="flex-1 rounded-xl bg-surface-2 py-2 text-xs font-semibold"
                      >
                        Editar
                      </button>
                    </div>
                  </>
                )}

                {book.status === "paused" && (
                  <>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resumeBook(book.id, { recalcPlan: false })}
                        className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground"
                      >
                        Manter plano
                      </button>
                      <button
                        onClick={() => resumeBook(book.id, { recalcPlan: true })}
                        className="flex-1 rounded-xl border border-primary/40 py-2.5 text-xs font-semibold text-primary"
                      >
                        Recalcular plano
                      </button>
                    </div>
                    <button
                      onClick={() => setView("edit")}
                      className="w-full rounded-xl bg-surface-2 py-2 text-xs font-semibold"
                    >
                      Editar
                    </button>
                  </>
                )}

                {book.status === "want_to_read" && (
                  <>
                    <button
                      onClick={() => startReading(book.id)}
                      className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
                    >
                      Começar leitura
                    </button>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setView("edit")}
                        className="flex-1 rounded-xl bg-surface-2 py-2 text-xs font-semibold"
                      >
                        Editar
                      </button>
                      {!confirmRemove ? (
                        <button
                          onClick={() => setConfirmRemove(true)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-surface-2 py-2 text-xs font-semibold text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remover
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            removeBook(book.id);
                            onClose();
                          }}
                          className="flex-1 rounded-xl bg-danger py-2 text-xs font-semibold text-white"
                        >
                          Confirmar remoção
                        </button>
                      )}
                    </div>
                  </>
                )}

                {book.status === "completed" && (
                  <button
                    onClick={() => setView("reflection")}
                    className="w-full rounded-xl bg-surface-2 py-2.5 text-sm font-semibold"
                  >
                    Editar reflexão
                  </button>
                )}
              </div>
            </>
          )}

          {view === "edit" && <EditBookForm book={book} onDone={() => setView("details")} />}
          {view === "planEdit" && (
            <ReadingPlanSetup book={book} onSave={() => setView("details")} />
          )}
          {view === "reflection" && (
            <ReflectionEditor book={book} onDone={() => setView("details")} />
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(s: Book["status"]): string {
  if (s === "reading") return "lendo agora";
  if (s === "want_to_read") return "quero ler";
  if (s === "paused") return "pausado";
  return "concluído";
}
function formatLabel(f: BookFormat): string {
  if (f === "physical") return "físico";
  if (f === "ebook") return "ebook";
  return "audiobook";
}

function EditBookForm({ book, onDone }: { book: Book; onDone: () => void }) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.authors.join(", "));
  const [totalPages, setTotalPages] = useState(String(book.totalPages ?? ""));
  const [totalMinutes, setTotalMinutes] = useState(
    String(Math.round((book.totalSeconds ?? 0) / 60)),
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const res = updateBook(book.id, {
      title: title.trim(),
      authors: author ? author.split(",").map((a) => a.trim()) : [],
      totalPages: book.progressMode === "pages" ? parseInt(totalPages, 10) || undefined : undefined,
      totalSeconds:
        book.progressMode === "time" ? (parseInt(totalMinutes, 10) || 0) * 60 : undefined,
    });
    if (!res.ok) {
      setError(res.error ?? "não foi possível salvar");
      return;
    }
    onDone();
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Título</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Autor</span>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      {book.progressMode === "pages" && (
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Total de páginas
          </span>
          <input
            type="number"
            value={totalPages}
            onChange={(e) => setTotalPages(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      )}
      {book.progressMode === "time" && (
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Duração total (min)
          </span>
          <input
            type="number"
            value={totalMinutes}
            onChange={(e) => setTotalMinutes(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        onClick={save}
        className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Salvar
      </button>
    </div>
  );
}

function ReflectionEditor({ book, onDone }: { book: Book; onDone: () => void }) {
  const [rating, setRating] = useState(book.rating ?? 0);
  const [takeaway, setTakeaway] = useState(book.mainTakeaway ?? "");
  const [reflection, setReflection] = useState(book.personalReflection ?? "");

  const save = () => {
    completeBook(book.id, {
      rating: rating || undefined,
      mainTakeaway: takeaway.trim() || undefined,
      personalReflection: reflection.trim() || undefined,
    });
    onDone();
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)}>
            <Star
              className={`h-6 w-6 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`}
            />
          </button>
        ))}
      </div>
      <label className="block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
          O que vale lembrar deste livro?
        </span>
        <textarea
          value={takeaway}
          onChange={(e) => setTakeaway(e.target.value)}
          className="min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
          O que esse livro mudou na sua cabeça?
        </span>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          className="min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <button
        onClick={save}
        className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
      >
        Salvar
      </button>
    </div>
  );
}
