import { useState } from "react";
import {
  useFeStore,
  currentBook,
  progressForBook,
  savedVerses,
  setReadingFrequency,
  type ReadingFrequency,
} from "@/lib/fe-store";
import { ArrowRight, ChevronRight } from "lucide-react";

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
    <div className="faith-bible">
      <section className="faith-bible-hero">
        <div className="faith-bible-hero-copy">
          <span className="faith-eyebrow">Minha leitura</span>
          {book && progress ? (
            <>
              <h2>{book}</h2>
              <p className="faith-bible-current">
                Capítulo atual: {book} {progress.chapter}
              </p>
              {progress.total && (
                <>
                  <p className="faith-bible-count">
                    {progress.chapter} de {progress.total} capítulos
                  </p>
                  <div className="faith-bible-progress">
                    <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="faith-bible-empty">Registre onde sua leitura está acontecendo.</p>
          )}
          <button onClick={onOpenLogReading} className="faith-bible-log">
            Registrar leitura <ArrowRight />
          </button>
        </div>
      </section>

      <section className="faith-bible-rhythm">
        <h2>Meu ritmo de leitura</h2>
        <p>Quero separar um momento para a Palavra</p>
        <div className="faith-frequency-options">
          {frequencyOptions.map((o) => (
            <button
              key={o.value}
              onClick={() => setReadingFrequency(o.value)}
              className={state.readingFrequency === o.value ? "is-active" : ""}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <section className="faith-bible-verses">
        <div className="faith-heading">
          <h2>Versículos que quero carregar comigo</h2>
          <span>Ver todos →</span>
        </div>
        {verses.length === 0 ? (
          <p className="faith-empty">Nenhum versículo guardado ainda.</p>
        ) : (
          <ul>
            {verses.map((v) => {
              const expanded = expandedVerse === v.id;
              return (
                <li key={v.id}>
                  <button
                    onClick={() => setExpandedVerse(expanded ? null : v.id)}
                    className={`faith-verse ${expanded ? "is-expanded" : ""}`}
                  >
                    <div className="faith-verse-heading">
                      <strong>{v.verseReference}</strong>
                      <span>{v.createdAt.slice(0, 10).split("-").reverse().join("/")}</span>
                      <ChevronRight />
                    </div>
                    {expanded && (
                      <>
                        {v.verseText && <p className="faith-verse-text">{v.verseText}</p>}
                        {v.content && <p className="faith-verse-note">{v.content}</p>}
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="faith-bible-history">
        <h2>Histórico de leitura</h2>
        {history.length === 0 ? (
          <p className="faith-empty">Nada registrado ainda.</p>
        ) : (
          <ul>
            {history.slice(0, 12).map((h) => (
              <li key={h.id}>
                <div className="faith-history-row">
                  <strong>
                    {h.book} {h.chapter}
                    {h.verseRange ? `:${h.verseRange}` : ""}
                  </strong>
                  <span>{h.date.split("-").reverse().join("/")}</span>
                  <ChevronRight />
                </div>
                {h.reflection && <p className="faith-history-reflection">{h.reflection}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
