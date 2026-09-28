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
      <div className="reading-notebook-search">
        <Search aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busque uma frase, ideia ou assunto..."
          className="reading-notebook-search-input"
        />
      </div>

      <div className="reading-filter-row" aria-label="Filtrar por tipo">
        {(["all", "quote", "insight", "note"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={typeFilter === t ? "is-active" : ""}
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
        <div className="reading-book-filter">
          <p>Livro</p>
          <div>
            <button
              onClick={() => setBookFilter("all")}
              className={bookFilter === "all" ? "is-active" : ""}
            >
              Todos os livros
            </button>
            {booksWithNotes.map((b) => (
              <button
                key={b.id}
                onClick={() => setBookFilter(b.id)}
                className={bookFilter === b.id ? "is-active" : ""}
              >
                {b.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="reading-tag-filter">
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="Filtrar por tag"
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

      <div className="reading-add-note-row">
        <button onClick={onAddNote} className="interactive-press reading-add-note">
          <Plus /> Nova anotação
        </button>
      </div>

      <div className="reading-note-list">
        {results.length === 0 && (
          <p className="reading-empty-notes">
            {query.trim() || bookFilter !== "all" || typeFilter !== "all" || tagFilter !== "all"
              ? "Nada encontrado."
              : "Ainda não há nada registrado."}
          </p>
        )}
        {results.map((n) => {
          const book = state.books.find((b) => b.id === n.bookId);
          const Icon = typeMeta[n.type].icon;
          return (
            <article key={n.id} className="reading-note-card">
              <div className="reading-note-meta">
                <span>
                  <Icon /> {typeMeta[n.type].label} · {n.bookTitle}
                </span>
                <span>{n.createdAt.slice(0, 10).split("-").reverse().join("/")}</span>
              </div>
              <p className="reading-note-content">“{n.content}”</p>
              <div className="reading-note-footer">
                <span>{book && positionText(book.progressMode, n)}</span>
                {n.tags.length > 0 && (
                  <span className="reading-note-tags">{n.tags.join(", ")}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
