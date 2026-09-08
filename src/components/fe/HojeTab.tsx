import { useState } from "react";
import { Bookmark, ChevronRight, PenLine, Plus, Sparkles } from "lucide-react";
import { verseOfDay } from "@/lib/verse-of-day";
import { getResurfacingCandidate, saveVerseOfDay, useFeStore } from "@/lib/fe-store";
import { nowDate } from "@/lib/test-clock";
import { NotebookEntryEditor } from "./NotebookEntryEditor";

export function HojeTab({
  onOpenPrayer,
  onOpenNotebook,
}: {
  onOpenPrayer: () => void;
  onOpenNotebook: () => void;
}) {
  const state = useFeStore((value) => value);
  const verse = verseOfDay();
  const active = state.prayerSubjects
    .filter((subject) => subject.status === "em_oracao")
    .slice(0, 2);
  const memory = getResurfacingCandidate(state.notebookEntries);
  const [reflecting, setReflecting] = useState(false);
  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(nowDate());

  return (
    <div className="space-y-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {date}
      </p>

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Palavra para hoje
        </p>
        <blockquote className="mt-3 text-xl leading-relaxed tracking-tight">
          “{verse.text}”
        </blockquote>
        <p className="mt-2 text-sm text-muted-foreground">{verse.reference}</p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => saveVerseOfDay(verse.reference, verse.text)}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold"
          >
            <Bookmark className="h-4 w-4" /> Guardar
          </button>
          <button
            onClick={() => setReflecting(true)}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold"
          >
            <PenLine className="h-4 w-4" /> Refletir
          </button>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Alvos em oração</h2>
          <button
            onClick={onOpenPrayer}
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            Ver todos <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {active.length === 0 ? (
          <button
            onClick={onOpenPrayer}
            className="mt-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-border p-4 text-left"
          >
            <Plus className="h-5 w-5 text-primary" />
            <span>
              <strong className="block text-sm">Novo alvo de oração</strong>
              <span className="text-xs text-muted-foreground">
                Guarde uma pessoa ou situação para acompanhar.
              </span>
            </span>
          </button>
        ) : (
          <div className="card-surface mt-2 divide-y divide-border p-0">
            {active.map((subject) => (
              <button
                key={subject.id}
                onClick={onOpenPrayer}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="h-4 w-4 rounded-full border border-primary" />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{subject.title}</strong>
                  <span className="text-[11px] text-muted-foreground">
                    {subject.category || "Em oração"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </section>

      {memory && (
        <section>
          <h2 className="text-base font-bold">Lembrança</h2>
          <button
            onClick={onOpenNotebook}
            className="card-surface mt-2 flex w-full items-start gap-3 p-4 text-left"
          >
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="text-[11px] text-muted-foreground">
                Você registrou há algum tempo
              </span>
              <strong className="mt-1 line-clamp-2 block text-sm">
                {memory.title || memory.content || memory.verseText}
              </strong>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </section>
      )}

      {reflecting && (
        <NotebookEntryEditor
          type="livre"
          presetVerse={{ reference: verse.reference, text: verse.text }}
          onClose={() => setReflecting(false)}
        />
      )}
    </div>
  );
}
