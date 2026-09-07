import { useEffect, useRef, useState } from "react";
import { Plus, Library, BarChart3, CalendarClock, ChevronDown } from "lucide-react";
import { useGoalsStore } from "@/lib/goals-store";
import {
  useReadingStore,
  booksByStatus,
  startSession,
  checkForMissedTargets,
  getMissedReadingTarget,
  getResurfacingCandidate,
  markResurfaced,
  startReading,
  type Book,
} from "@/lib/reading-store";
import { Card } from "@/components/sub-agenda-shared";
import { Modal as ModalDialog } from "@/components/ui/modal";
import { ActiveBookSelector } from "./ActiveBookSelector";
import { ContinueReadingCard } from "./ContinueReadingCard";
import { ReadingMode } from "./ReadingMode";
import { ReadingProgressUpdater } from "./ReadingProgressUpdater";
import { ReadingRoutineSetup } from "./ReadingRoutineSetup";
import { AddBookFlow } from "./AddBookFlow";
import { ReadingLibrary } from "./ReadingLibrary";
import { BookDetails } from "./BookDetails";
import { ReadingNotebookPreview, ReadingNotebook } from "./ReadingNotebook";
import { ReadingNoteEditor } from "./ReadingNoteEditor";
import { ReadingStats, ReadingResurfaceCard } from "./ReadingStats";
import { MissedTargetAdjustment } from "./MissedTargetAdjustment";
import { BookCover } from "./BookCover";

type Modal =
  | { type: "readingMode"; book: Book; sessionId: string }
  | { type: "sessionConflict"; requested: Book; conflictBookId: string }
  | { type: "progress"; book: Book }
  | { type: "routine"; book: Book }
  | { type: "addBook" }
  | { type: "library" }
  | { type: "bookDetails"; bookId: string }
  | { type: "notebook"; bookId?: string }
  | { type: "note"; book: Book }
  | null;

export function LeituraModule() {
  useEffect(() => {
    void checkForMissedTargets();
  }, []);

  const state = useReadingStore((s) => s);
  const executions = useGoalsStore((s) => s.executions);
  void executions;
  const [modal, setModal] = useState<Modal>(null);
  const [selectedReadingBookId, setSelectedReadingBookId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const readingBooks = booksByStatus(state.books, "reading");
  const wantBooks = booksByStatus(state.books, "want_to_read");
  const completedBooks = booksByStatus(state.books, "completed");
  const pausedBooks = booksByStatus(state.books, "paused");

  const selectedId =
    selectedReadingBookId && readingBooks.some((b) => b.id === selectedReadingBookId)
      ? selectedReadingBookId
      : (readingBooks[0]?.id ?? null);
  const selectedBook = readingBooks.find((b) => b.id === selectedId) ?? null;

  const [dismissedMissedId, setDismissedMissedId] = useState<string | null>(null);
  const missedTargetRaw = getMissedReadingTarget(state);
  const missedTarget = missedTargetRaw?.id === dismissedMissedId ? undefined : missedTargetRaw;
  const resurfaceCandidate = getResurfacingCandidate(state);
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (resurfaceCandidate && markedRef.current !== resurfaceCandidate.id) {
      markedRef.current = resurfaceCandidate.id;
      markResurfaced(resurfaceCandidate.id);
    }
  }, [resurfaceCandidate]);

  const beginReading = async (book: Book) => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await startSession(book.id);
      if (!res.ok && res.conflictSessionId) {
        const conflictSession = state.sessions.find((s) => s.id === res.conflictSessionId);
        setModal({
          type: "sessionConflict",
          requested: book,
          conflictBookId: conflictSession?.bookId ?? "",
        });
        return;
      }
      if (res.sessionId) setModal({ type: "readingMode", book, sessionId: res.sessionId });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="mt-6 space-y-5">
      {missedTarget && (
        <MissedTargetAdjustment
          target={missedTarget}
          book={state.books.find((b) => b.id === missedTarget.bookId)}
          onClose={() => setDismissedMissedId(missedTarget.id)}
        />
      )}

      {readingBooks.length > 1 && (
        <ActiveBookSelector
          books={readingBooks}
          selectedId={selectedId}
          onSelect={setSelectedReadingBookId}
        />
      )}

      {selectedBook ? (
        <ContinueReadingCard
          book={selectedBook}
          onOpenReadingMode={() => beginReading(selectedBook)}
          onOpenProgressUpdater={() => setModal({ type: "progress", book: selectedBook })}
          onOpenRoutineSetup={() => setModal({ type: "routine", book: selectedBook })}
        />
      ) : (
        <Card title="Comece sua próxima leitura">
          <p className="text-sm text-muted-foreground">
            Adicione um livro pra começar a acompanhar sua leitura de verdade.
          </p>
          <button
            onClick={() => setModal({ type: "addBook" })}
            className="mt-3 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Adicionar livro
          </button>
          {wantBooks.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] uppercase text-muted-foreground">
                ou comece um da sua lista
              </p>
              {wantBooks.slice(0, 3).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-2"
                >
                  <BookCover book={b} className="h-10 w-7" />
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold">{b.title}</p>
                  <button
                    onClick={async () => {
                      await startReading(b.id);
                      setModal({ type: "bookDetails", bookId: b.id });
                    }}
                    className="shrink-0 text-[11px] font-semibold text-primary"
                  >
                    começar
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <ReadingNotebookPreview
        onOpenFull={() => setModal({ type: "notebook" })}
        onAddNote={() => selectedBook && setModal({ type: "note", book: selectedBook })}
      />

      <div className="divide-y divide-border border-y border-border">
        <div className="flex items-center gap-3 py-3">
          <Library className="h-5 w-5 text-muted-foreground" />
          <button
            onClick={() => setModal({ type: "library" })}
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-sm font-semibold">Biblioteca</p>
            <p className="truncate text-xs text-muted-foreground">
              {readingBooks.length} lendo · {completedBooks.length} concluídos · {wantBooks.length}{" "}
              quero ler{pausedBooks.length ? ` · ${pausedBooks.length} pausados` : ""}
            </p>
          </button>
          <button
            aria-label="Adicionar livro"
            onClick={() => setModal({ type: "addBook" })}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border"
          >
            <Plus className="h-4 w-4 text-primary" />
          </button>
        </div>
        <details className="group py-3">
          <summary className="flex cursor-pointer list-none items-center gap-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Sua leitura</p>
              <p className="text-xs text-muted-foreground">Ritmo, sessões e livros concluídos</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180" />
          </summary>
          <div className="mt-3">
            <ReadingStats />
          </div>
        </details>
        <details className="group py-3">
          <summary className="flex cursor-pointer list-none items-center gap-3">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Rotina de leitura</p>
              <p className="text-xs text-muted-foreground">Dias, horário e meta diária</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground group-open:rotate-180" />
          </summary>
          {selectedBook && (
            <button
              onClick={() => setModal({ type: "routine", book: selectedBook })}
              className="mt-3 ml-8 text-xs font-semibold text-primary"
            >
              Configurar rotina
            </button>
          )}
        </details>
      </div>

      {resurfaceCandidate && (
        <ReadingResurfaceCard
          note={resurfaceCandidate}
          bookTitle={state.books.find((b) => b.id === resurfaceCandidate.bookId)?.title ?? ""}
          onOpenNotebook={() => setModal({ type: "notebook", bookId: resurfaceCandidate.bookId })}
        />
      )}

      {modal?.type === "readingMode" && (
        <ReadingMode book={modal.book} sessionId={modal.sessionId} onClose={() => setModal(null)} />
      )}
      {modal?.type === "sessionConflict" && (
        <SessionConflictDialog
          requested={modal.requested}
          conflictBook={state.books.find((b) => b.id === modal.conflictBookId)}
          onContinueConflict={() => {
            const conflictSession = state.sessions.find(
              (s) => s.bookId === modal.conflictBookId && s.status === "active",
            );
            const conflictBook = state.books.find((b) => b.id === modal.conflictBookId);
            if (conflictSession && conflictBook) {
              setModal({ type: "readingMode", book: conflictBook, sessionId: conflictSession.id });
            } else {
              setModal(null);
            }
          }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.type === "progress" && (
        <ReadingProgressUpdater book={modal.book} onClose={() => setModal(null)} />
      )}
      {modal?.type === "routine" && (
        <ReadingRoutineSetup book={modal.book} onClose={() => setModal(null)} />
      )}
      {modal?.type === "addBook" && <AddBookFlow onClose={() => setModal(null)} />}
      {modal?.type === "library" && (
        <ReadingLibrary
          onClose={() => setModal(null)}
          onOpenBook={(bookId) => setModal({ type: "bookDetails", bookId })}
        />
      )}
      {modal?.type === "bookDetails" && (
        <BookDetails
          bookId={modal.bookId}
          onClose={() => setModal(null)}
          onOpenReadingMode={(book) => beginReading(book)}
          onOpenProgressUpdater={(book) => setModal({ type: "progress", book })}
          onOpenRoutineSetup={(book) => setModal({ type: "routine", book })}
          onOpenNotebook={(bookId) => setModal({ type: "notebook", bookId })}
        />
      )}
      {modal?.type === "notebook" && (
        <ReadingNotebook onClose={() => setModal(null)} initialBookId={modal.bookId} />
      )}
      {modal?.type === "note" && (
        <ReadingNoteEditor
          book={modal.book}
          type="note"
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  );
}

function SessionConflictDialog({
  requested,
  conflictBook,
  onContinueConflict,
  onCancel,
}: {
  requested: Book;
  conflictBook: Book | undefined;
  onContinueConflict: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalDialog onClose={onCancel} title="Uma leitura já está em andamento">
      <p className="text-sm text-muted-foreground">
        Você já tem uma sessão em andamento com {conflictBook?.title ?? "outro livro"}. Termine essa
        sessão antes de começar {requested.title}.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          onClick={onContinueConflict}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          Continuar sessão em andamento
        </button>
        <button onClick={onCancel} className="w-full py-2 text-xs text-muted-foreground">
          Cancelar
        </button>
      </div>
    </ModalDialog>
  );
}
