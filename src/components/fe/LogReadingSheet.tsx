import { useState } from "react";
import { X } from "lucide-react";
import { logBibleReading, currentBook, useFeStore, BIBLE_BOOKS } from "@/lib/fe-store";
import { todayISO } from "@/lib/goals-store";

export function LogReadingSheet({ onClose }: { onClose: () => void }) {
  const logs = useFeStore((s) => s.bibleReadingLogs);
  const suggested = currentBook(logs) ?? "João";

  const [book, setBook] = useState(suggested);
  const [chapter, setChapter] = useState("1");
  const [verseRange, setVerseRange] = useState("");
  const [date, setDate] = useState(todayISO());
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const chapterNum = parseInt(chapter, 10);
    if (!book.trim() || !chapterNum || chapterNum <= 0 || saving) return;
    setSaving(true);
    setError("");
    try {
      await logBibleReading({
        book: book.trim(),
        chapter: chapterNum,
        verseRange: verseRange.trim() || undefined,
        date,
        reflection,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

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
          <h3 className="text-lg font-bold">Registrar leitura</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Livro</span>
            <input
              list="bible-books"
              value={book}
              onChange={(e) => setBook(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <datalist id="bible-books">
              {BIBLE_BOOKS.map((b) => (
                <option key={b.name} value={b.name} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              Capítulo
            </span>
            <input
              type="number"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Trecho (opcional, ex: 1–11)
          </span>
          <input
            value={verseRange}
            onChange={(e) => setVerseRange(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Data</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
            Algo ficou com você nessa leitura? (opcional)
          </span>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="Hoje percebi que..."
            className="min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
          />
        </label>

        {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
        <button
          onClick={save}
          disabled={saving}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
