import { useEffect, useState } from "react";
import { Search, Quote, Lightbulb, StickyNote, Plus } from "lucide-react";
import { useReadingStore, searchReadingNotes, type ReadingNoteType } from "@/lib/reading-store";

const typeMeta: Record<ReadingNoteType, { label: string; icon: typeof Quote }> = {
  quote: { label: "Frase", icon: Quote },
  insight: { label: "Insight", icon: Lightbulb },
  note: { label: "Nota", icon: StickyNote },
};

function positionText(
  mode: "pages" | "percentage" | "time",
  note: { pageNumber?: number; percentage?: number; timestampSeconds?: number },
): string {
  if (mode === "pages" && note.pageNumber !== undefined) return `pág. ${note.pageNumber}`;
  if (mode === "percentage" && note.percentage !== undefined) return `${note.percentage}%`;
  if (mode === "time" && note.timestampSeconds !== undefined) {
    const m = Math.round(note.timestampSeconds / 60);
    return `min ${m}`;
  }
  return "";
}

/** Aba dedicada ao caderno — busca, filtro por tipo, seleção de livro por toque e tags. */
export function ReadingNotebookTab({
  initialBookId,
  onAddNote,
}: {
  initialBookId?: string;
  onAddNote: () => void;
}) {
  const state = useReadingStore((s) => s);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ReadingNoteType>("all");
  const [bookFilter, setBookFilter] = useState<string>(initialBookId ?? "all");
  const [tagFilter, setTagFilter] = useState<string>("all");

  useEffect(() => {
    if (initialBookId) setBookFilter(initialBookId);
  }, [initialBookId]);

  const booksWithNotes = state.books.filter((b) => state.notes.some((n) => n.bookId === b.id));
  const allTags = Array.from(new Set(state.notes.flatMap((n) => n.tags))).sort();

  let results = query.trim()
    ? searchReadingNotes(state, query)
    : [...state.notes]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((n) => ({ ...n, bookTitle: state.books.find((b) => b.id === n.bookId)?.title ?? "" }));
  if (typeFilter !== "all") results = results.filter((n) => n.type === typeFilter);
  if (bookFilter !== "all") results = results.filter((n) => n.bookId === bookFilter);
  if (tagFilter !== "all") results = results.filter((n) => n.tags.includes(tagFilter));

  return (
    <div className="reading-notebook-tab">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busque uma frase, ideia ou assunto..."
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto">
        {(["all", "quote", "insight", "note"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${typeFilter === t ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
          >
            {t === "all"
              ? "Todos"
              : t === "quote"
                ? "Frases"
                : t === "insight"
                  ? "Insights"
                  : "Notas"}
          </button>
        ))}
      </div>

      {booksWithNotes.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] uppercase text-muted-foreground">Selecionar livro</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setBookFilter("all")}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${bookFilter === "all" ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
            >
              Todos os livros
            </button>
            {booksWithNotes.map((b) => (
              <button
                key={b.id}
                onClick={() => setBookFilter(b.id)}
                className={`shrink-0 max-w-[9rem] truncate rounded-full px-3 py-1.5 text-[11px] font-semibold ${bookFilter === b.id ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
              >
                {b.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="mt-2">
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs"
          >
            <option value="all">Todas as tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="-mt-1 mb-1 mt-3 flex justify-end">
        <button
          onClick={onAddNote}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:border-primary/50"
        >
          <Plus className="h-3.5 w-3.5 text-primary" /> Nova anotação
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {results.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {query.trim() || bookFilter !== "all" || typeFilter !== "all" || tagFilter !== "all"
              ? "Nada encontrado."
              : "Ainda não há nada registrado."}
          </p>
        )}
        {results.map((n) => {
          const book = state.books.find((b) => b.id === n.bookId);
          const Icon = typeMeta[n.type].icon;
          return (
            <div key={n.id} className="rounded-lg bg-surface-2 p-3">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Icon className="h-3 w-3" /> {typeMeta[n.type].label} · {n.bookTitle}
                </span>
                <span>{n.createdAt.slice(0, 10).split("-").reverse().join("/")}</span>
              </div>
              <p className="mt-1 text-sm italic">"{n.content}"</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {book && positionText(book.progressMode, n)}
                </span>
                {n.tags.length > 0 && (
                  <span className="text-[10px] text-primary">{n.tags.join(", ")}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
