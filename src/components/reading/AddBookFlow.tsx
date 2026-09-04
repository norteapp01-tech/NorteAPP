import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Search, Camera } from "lucide-react";
import { searchBooks, type SearchBookResult } from "@/lib/book-search-service";
import {
  addBookFromSearch,
  addBookManual,
  updateBook,
  useReadingStore,
  type BookFormat,
  type ProgressMode,
} from "@/lib/reading-store";
import { BookCover } from "./BookCover";
import { ReadingPlanSetup } from "./ReadingPlanSetup";
import { Modal } from "@/components/ui/modal";

type Step = "search" | "details" | "plan";
type QuickStatus = "reading" | "want_to_read";

export function AddBookFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchBookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchBookResult | null>(null);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [format, setFormat] = useState<BookFormat>("physical");
  const [ebookMode, setEbookMode] = useState<"pages" | "percentage">("pages");
  const [totalPages, setTotalPages] = useState("");
  const [totalMinutes, setTotalMinutes] = useState("");
  const [coverDataUrl, setCoverDataUrl] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<QuickStatus>("reading");
  const [createdBookId, setCreatedBookId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const gen = useRef(0);

  useEffect(() => {
    if (step !== "search") return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    const myGen = ++gen.current;
    setLoading(true);
    const t = setTimeout(() => {
      searchBooks(q).then((r) => {
        if (gen.current === myGen) {
          setResults(r);
          setLoading(false);
        }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [query, step]);

  const pickResult = (r: SearchBookResult) => {
    setSelected(r);
    setTitle(r.title);
    setAuthor(r.authors.join(", "));
    setTotalPages(r.pageCount ? String(r.pageCount) : "");
    setStep("details");
  };

  const goManual = () => {
    setSelected(null);
    setTitle(query.trim());
    setAuthor("");
    setTotalPages("");
    setStep("details");
  };

  const effectiveMode: ProgressMode =
    format === "audiobook" ? "time" : format === "physical" ? "pages" : ebookMode;

  const onCoverFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCoverDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const confirmDetails = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError("");
    const opts = {
      format,
      status,
      progressMode: effectiveMode,
      totalPages: effectiveMode === "pages" ? parseInt(totalPages, 10) || undefined : undefined,
      totalSeconds: effectiveMode === "time" ? (parseInt(totalMinutes, 10) || 0) * 60 : undefined,
    };
    try {
      let id: string;
      if (selected) {
        id = await addBookFromSearch(
          {
            ...selected,
            title: title.trim(),
            authors: author ? author.split(",").map((a) => a.trim()) : [],
          },
          opts,
        );
        if (coverDataUrl) await updateBook(id, { coverImage: coverDataUrl });
      } else {
        id = await addBookManual({
          title: title.trim(),
          authors: author ? author.split(",").map((a) => a.trim()) : [],
          coverImage: coverDataUrl,
          ...opts,
        });
      }
      setCreatedBookId(id);
      if (status === "reading") setStep("plan");
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o livro.");
    } finally {
      setSaving(false);
    }
  };

  const book = useReadingStore((s) => s.books.find((b) => b.id === createdBookId));

  return (
    <Modal onClose={onClose} title="Adicionar livro">
      <div className="flex h-full flex-col">
        {step === "search" && (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Título ou autor..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="mt-3 flex-1 space-y-2">
              {loading && <p className="text-xs text-muted-foreground">Buscando...</p>}
              {!loading &&
                results.map((r) => (
                  <button
                    key={r.externalId}
                    onClick={() => pickResult(r)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-2 p-2 text-left hover:border-primary/40"
                  >
                    <BookCover
                      book={{ title: r.title, coverUrl: r.coverUrl }}
                      className="h-14 w-10"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {r.authors.join(", ") || "autor desconhecido"}
                      </p>
                    </div>
                  </button>
                ))}
              {!loading && query.trim() && results.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum resultado encontrado.</p>
              )}
            </div>
            <button onClick={goManual} className="mt-3 text-xs text-primary">
              Não encontrei — cadastrar manualmente
            </button>
          </div>
        )}

        {step === "details" && (
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3">
              <BookCover
                book={{ title, coverUrl: selected?.coverUrl, coverImage: coverDataUrl }}
                className="h-20 w-14"
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-primary">
                <Camera className="h-3.5 w-3.5" />
                trocar capa
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onCoverFile}
                  className="hidden"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
                Título
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
                Autor (opcional)
              </span>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>

            <div>
              <span className="mb-1 block text-[10px] uppercase text-muted-foreground">
                Formato
              </span>
              <div className="flex gap-2">
                {(
                  [
                    ["physical", "Físico"],
                    ["ebook", "Ebook"],
                    ["audiobook", "Audiobook"],
                  ] as [BookFormat, string][]
                ).map(([f, label]) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${format === f ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface-2 text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {format === "ebook" && (
              <div>
                <span className="mb-1 block text-[10px] uppercase text-muted-foreground">
                  Medir progresso por
                </span>
                <div className="flex gap-2">
                  {(
                    [
                      ["pages", "Páginas"],
                      ["percentage", "Porcentagem"],
                    ] as [typeof ebookMode, string][]
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      onClick={() => setEbookMode(m)}
                      className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${ebookMode === m ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface-2 text-muted-foreground"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {effectiveMode === "pages" && (
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
            {effectiveMode === "time" && (
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

            <div>
              <span className="mb-1 block text-[10px] uppercase text-muted-foreground">Status</span>
              <div className="flex gap-2">
                {(
                  [
                    ["reading", "Lendo agora"],
                    ["want_to_read", "Quero ler"],
                  ] as [QuickStatus, string][]
                ).map(([st, label]) => (
                  <button
                    key={st}
                    onClick={() => setStatus(st)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold ${status === st ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface-2 text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-[11px] text-danger">{error}</p>}
            <button
              onClick={confirmDetails}
              disabled={!title.trim() || saving}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {saving ? "Salvando…" : "Continuar"}
            </button>
          </div>
        )}

        {step === "plan" && book && (
          <div>
            <p className="text-sm text-muted-foreground">
              Quer definir um plano de leitura pra{" "}
              <strong className="text-foreground">{book.title}</strong>?
            </p>
            <div className="mt-3">
              <ReadingPlanSetup book={book} onSave={onClose} onSkip={onClose} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
