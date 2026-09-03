import { useState } from "react";
import {
  useFeStore,
  currentBook,
  progressForBook,
  savedVerses,
  setReadingFrequency,
  type ReadingFrequency,
} from "@/lib/fe-store";
import { Card } from "@/components/sub-agenda-shared";

const frequencyOptions: { value: ReadingFrequency; label: string }[] = [
  { value: "2x", label: "2 vezes por semana" },
  { value: "3x", label: "3 vezes por semana" },
  { value: "5x", label: "5 vezes por semana" },
  { value: "daily", label: "Todos os dias" },
  { value: "none", label: "Sem meta" },
];

export function JornadaTab({ onOpenLogReading }: { onOpenLogReading: () => void }) {
  const state = useFeStore((s) => s);
  const book = currentBook(state.bibleReadingLogs);
  const progress = book ? progressForBook(book, state.bibleReadingLogs) : null;
  const verses = savedVerses(state.notebookEntries);
  const history = [...state.bibleReadingLogs].sort((a, b) => b.date.localeCompare(a.date));
  const [expandedVerse, setExpandedVerse] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Card title="Minha leitura">
        {book && progress ? (
          <>
            <p className="text-lg font-bold">{book}</p>
            <p className="text-sm text-muted-foreground">
              Capítulo atual: {book} {progress.chapter}
            </p>
            {progress.total && (
              <>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {progress.chapter} de {progress.total} capítulos
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-primary" style={{ width: `${progress.pct}%` }} />
                </div>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Registre onde sua leitura está acontecendo.
          </p>
        )}
        <button
          onClick={onOpenLogReading}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Registrar leitura
        </button>
      </Card>

      <Card title="Meu ritmo de leitura">
        <p className="text-xs text-muted-foreground">Quero separar um momento para a Palavra</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {frequencyOptions.map((o) => (
            <button
              key={o.value}
              onClick={() => setReadingFrequency(o.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${state.readingFrequency === o.value ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Versículos que quero carregar comigo">
        {verses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum versículo guardado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {verses.map((v) => {
              const expanded = expandedVerse === v.id;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => setExpandedVerse(expanded ? null : v.id)}
                    className="w-full rounded-lg bg-surface-2 p-3 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{v.verseReference}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {v.createdAt.slice(0, 10).split("-").reverse().join("/")}
                      </p>
                    </div>
                    {expanded && (
                      <>
                        {v.verseText && <p className="mt-1.5 text-sm italic">"{v.verseText}"</p>}
                        {v.content && (
                          <p className="mt-1.5 text-xs text-muted-foreground">{v.content}</p>
                        )}
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Histórico de leitura">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {history.slice(0, 12).map((h) => (
              <li key={h.id} className="rounded-lg bg-surface-2 p-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    {h.book} {h.chapter}
                    {h.verseRange ? `:${h.verseRange}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {h.date.split("-").reverse().join("/")}
                  </span>
                </div>
                {h.reflection && (
                  <p className="mt-1 text-xs italic text-muted-foreground">"{h.reflection}"</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
