import type { Book } from "@/lib/reading-store";
import { BookCover } from "./BookCover";

/** Só aparece com 2+ livros em "lendo agora" — troca o livro selecionado sem navegar. */
export function ActiveBookSelector({
  books,
  selectedId,
  onSelect,
}: {
  books: Book[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {books.map((b) => {
        const active = b.id === selectedId;
        return (
          <button
            key={b.id}
            onClick={() => onSelect(b.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left ${
              active ? "border-primary/40 bg-primary/10" : "border-border bg-surface-2 opacity-70"
            }`}
          >
            <BookCover book={b} className="h-8 w-6" />
            <span className="max-w-[7.5rem] truncate text-xs font-semibold">{b.title}</span>
          </button>
        );
      })}
    </div>
  );
}
