import { useState } from "react";
import { X } from "lucide-react";
import { addNote, getBookProgress, type Book, type ReadingNoteType } from "@/lib/reading-store";

const typeTitles: Record<ReadingNoteType, string> = {
  quote: "Frase",
  insight: "Insight",
  note: "Nota",
};

function positionLabel(book: Book): string {
  if (book.progressMode === "pages") return "Página";
  if (book.progressMode === "percentage") return "% no livro";
  return "Minuto";
}

/** Captura rápida durante a sessão — não pausa o cronômetro, volta pro Modo Leitura ao salvar. */
export function ReadingNoteEditor({
  book,
  sessionId,
  type,
  onClose,
  onSaved,
}: {
  book: Book;
  sessionId: string;
  type: ReadingNoteType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const progress = getBookProgress(book);
  const defaultPosition =
    book.progressMode === "time" ? Math.round(progress.current / 60) : progress.current;
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [position, setPosition] = useState(String(defaultPosition));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!content.trim() || saving) return;
    setSaving(true);
    try {
      const pos = parseFloat(position) || 0;
      await addNote({
        bookId: book.id,
        sessionId,
        type,
        content,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        pageNumber: book.progressMode === "pages" ? pos : undefined,
        percentage: book.progressMode === "percentage" ? pos : undefined,
        timestampSeconds: book.progressMode === "time" ? pos * 60 : undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-md rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{typeTitles[type]}</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Escreva aqui..."
          className="mt-3 min-h-24 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              {positionLabel(book)}
            </span>
            <input
              type="number"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              Tags (opcional)
            </span>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ex: liderança, foco"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        <button
          onClick={save}
          disabled={!content.trim() || saving}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar e continuar lendo"}
        </button>
      </div>
    </div>
  );
}
