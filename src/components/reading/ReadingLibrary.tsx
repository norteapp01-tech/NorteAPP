import { useState } from "react";
import { X, Star } from "lucide-react";
import {
  useReadingStore,
  booksByStatus,
  getBookProgress,
  type BookStatus,
} from "@/lib/reading-store";
import { BookCover } from "./BookCover";

const tabs: { key: BookStatus; label: string }[] = [
  { key: "reading", label: "Lendo agora" },
  { key: "want_to_read", label: "Quero ler" },
  { key: "completed", label: "Concluídos" },
  { key: "paused", label: "Pausados" },
];

export function ReadingLibrary({
  onClose,
  onOpenBook,
  initialTab = "reading",
}: {
  onClose: () => void;
  onOpenBook: (bookId: string) => void;
  initialTab?: BookStatus;
}) {
  const books = useReadingStore((s) => s.books);
  const [tab, setTab] = useState<BookStatus>(initialTab);
  const list = booksByStatus(books, tab);

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
          <h3 className="text-lg font-bold">Sua biblioteca</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
          {list.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum livro aqui ainda.</p>
          )}
          {list.map((b) => {
            const progress = getBookProgress(b);
            return (
              <button
                key={b.id}
                onClick={() => onOpenBook(b.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 p-2 text-left hover:border-primary/40"
              >
                <BookCover book={b} className="h-14 w-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {b.authors.join(", ") || "autor desconhecido"}
                  </p>
                  {tab === "reading" && (
                    <p className="text-[11px] text-primary">{progress.label}</p>
                  )}
                  {tab === "completed" && b.rating && (
                    <div className="mt-0.5 flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-3 w-3 ${n <= (b.rating ?? 0) ? "fill-primary text-primary" : "text-muted-foreground"}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
