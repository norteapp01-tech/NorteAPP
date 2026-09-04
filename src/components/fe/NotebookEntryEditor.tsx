import { useState } from "react";
import { Modal } from "@/components/ui/modal";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const showVerseFields = type === "deus_falou" || type === "versiculo";
  const canSave =
    type === "versiculo" ? verseReference.trim().length > 0 : content.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      await addNotebookEntry({
        type,
        content,
        verseReference: verseReference.trim() || undefined,
        verseText: verseText.trim() || undefined,
        context: type === "deus_falou" ? context : undefined,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={typeTitles[type]}>
      {prompts[type] && <p className="text-sm font-medium">{prompts[type]}</p>}

      <textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={type === "versiculo" ? "Uma nota, se quiser (opcional)..." : "Escreva aqui..."}
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

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      <button
        onClick={save}
        disabled={!canSave || saving}
        className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </Modal>
  );
}
