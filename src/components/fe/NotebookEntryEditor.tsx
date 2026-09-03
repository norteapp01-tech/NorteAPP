import { useState } from "react";
import { X } from "lucide-react";
import { addNotebookEntry, type NotebookEntryType } from "@/lib/fe-store";

const typeTitles: Record<NotebookEntryType, string> = {
  deus_falou: "Deus falou comigo",
  oracao: "Oração",
  gratidao: "Gratidão",
  versiculo: "Versículo",
  aprendizado: "Aprendizado",
  testemunho: "Testemunho",
  livre: "Escrever livremente",
};

const prompts: Partial<Record<NotebookEntryType, string>> = {
  deus_falou: "O que Deus falou com você hoje?",
  gratidao: "Sou grato por...",
  oracao: "O que está em seu coração agora?",
  aprendizado: "O que você percebeu ou aprendeu?",
  testemunho: "O que aconteceu?",
};

export function NotebookEntryEditor({
  type,
  onClose,
  onSaved,
}: {
  type: NotebookEntryType;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [content, setContent] = useState("");
  const [verseReference, setVerseReference] = useState("");
  const [verseText, setVerseText] = useState("");
  const [context, setContext] = useState("");

  const showVerseFields = type === "deus_falou" || type === "versiculo";
  const canSave =
    type === "versiculo" ? verseReference.trim().length > 0 : content.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    addNotebookEntry({
      type,
      content,
      verseReference: verseReference.trim() || undefined,
      verseText: verseText.trim() || undefined,
      context: type === "deus_falou" ? context : undefined,
    });
    onSaved?.();
    onClose();
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
          <h3 className="text-lg font-bold">{typeTitles[type]}</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {prompts[type] && <p className="mt-3 text-sm font-medium">{prompts[type]}</p>}

        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            type === "versiculo" ? "Uma nota, se quiser (opcional)..." : "Escreva aqui..."
          }
          className="mt-2 min-h-24 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
        />

        {showVerseFields && (
          <div className="mt-3 space-y-2">
            <input
              value={verseReference}
              onChange={(e) => setVerseReference(e.target.value)}
              placeholder="Referência (ex: Provérbios 3:5)"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <textarea
              value={verseText}
              onChange={(e) => setVerseText(e.target.value)}
              placeholder="Texto do versículo (opcional)"
              className="min-h-14 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
            />
          </div>
        )}

        {type === "deus_falou" && (
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Contexto (opcional)"
            className="mt-3 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        )}

        <button
          onClick={save}
          disabled={!canSave}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
