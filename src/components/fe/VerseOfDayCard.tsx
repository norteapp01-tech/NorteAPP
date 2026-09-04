import { useState } from "react";
import { Bookmark, PenLine, Check } from "lucide-react";
import { verseOfDay } from "@/lib/verse-of-day";
import { saveVerseOfDay, reflectOnVerse } from "@/lib/fe-store";
import { Card } from "@/components/sub-agenda-shared";

export function VerseOfDayCard() {
  const verse = verseOfDay();
  const [saved, setSaved] = useState(false);
  const [reflecting, setReflecting] = useState(false);
  const [reflection, setReflection] = useState("");
  const [reflected, setReflected] = useState(false);

  const guardar = async () => {
    await saveVerseOfDay(verse.reference, verse.text);
    setSaved(true);
  };

  const salvarReflexao = async () => {
    if (!reflection.trim()) return;
    await reflectOnVerse(verse.reference, verse.text, reflection);
    setReflecting(false);
    setReflected(true);
  };

  return (
    <Card title="Versículo do dia">
      <p className="text-lg leading-relaxed">"{verse.text}"</p>
      <p className="mt-2 text-sm text-muted-foreground">{verse.reference}</p>

      {!reflecting ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={guardar}
            disabled={saved}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {saved ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
            {saved ? "Guardado" : "Guardar"}
          </button>
          <button
            onClick={() => setReflecting(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
          >
            <PenLine className="h-3.5 w-3.5" />
            {reflected ? "Refletir de novo" : "Refletir"}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            autoFocus
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="O que esse versículo trouxe para você hoje..."
            className="min-h-20 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={salvarReflexao}
              disabled={!reflection.trim()}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              Salvar
            </button>
            <button onClick={() => setReflecting(false)} className="text-xs text-muted-foreground">
              cancelar
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
