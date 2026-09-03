import { useState } from "react";
import { Search, X, Quote, Lightbulb, StickyNote } from "lucide-react";
import { useReadingStore, searchReadingNotes, type ReadingNoteType } from "@/lib/reading-store";
import { Card } from "@/components/sub-agenda-shared";

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

/** Preview leve na home: busca + poucos itens recentes/relevantes. */
export function ReadingNotebookPreview({ onOpenFull }: { onOpenFull: () => void }) {
  const state = useReadingStore((s) => s);
  const [query, setQuery] = useState("");
  const results = query.trim()
    ? searchReadingNotes(state, query).slice(0, 4)
    : [...state.notes]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 3)
        .map((n) => ({ ...n, bookTitle: state.books.find((b) => b.id === n.bookId)?.title ?? "" }));

  return (
    <Card title="Caderno de leitura">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busque uma frase, ideia ou assunto..."
          className="w-full bg-transparent text-xs outline-none"
        />
      </div>
      <div className="mt-3 space-y-2">
        {results.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {query.trim() ? "Nada encontrado." : "Ainda não há nada registrado."}
          </p>
        )}
        {results.map((n) => {
          const Icon = typeMeta[n.type].icon;
          return (
            <div key={n.id} className="rounded-lg bg-surface-2 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Icon className="h-3 w-3" /> {typeMeta[n.type].label} · {n.bookTitle}
              </div>
              <p className="mt-1 line-clamp-2 text-xs italic">"{n.content}"</p>
            </div>
          );
        })}
      </div>
      <button onClick={onOpenFull} className="mt-3 text-xs text-primary">
        Ver caderno
      </button>
    </Card>
  );
}

/** Tela cheia com filtros — Todos/Frases/Insights/Notas, Livro, Tags. */
export function ReadingNotebook({
  onClose,
  initialBookId,
}: {
  onClose: () => void;
  initialBookId?: string;
}) {
  const state = useReadingStore((s) => s);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ReadingNoteType>("all");
  const [bookFilter, setBookFilter] = useState<string>(initialBookId ?? "all");
  const [tagFilter, setTagFilter] = useState<string>("all");

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
          <h3 className="text-lg font-bold">Caderno de leitura</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busque uma frase, ideia ou assunto..."
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="mt-2 flex gap-1.5 overflow-x-auto">
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

        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs"
          >
            <option value="all">Todos os livros</option>
            {state.books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
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

        <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
          {results.length === 0 && (
            <p className="text-sm text-muted-foreground">Nada encontrado.</p>
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
    </div>
  );
}
