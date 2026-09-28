import { useGoalsStore, todayISO, addDays, toISODate } from "@/lib/goals-store";
import { nowDate } from "@/lib/test-clock";
import {
  useReadingStore,
  getBookProgress,
  getTodayReadingTarget,
  getNextReadingSchedule,
  routineFor,
  formatDuration,
  type Book,
} from "@/lib/reading-store";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Play, Pencil } from "lucide-react";

function todayLine(book: Book, planned: number): string {
  if (book.progressMode === "pages") return `Hoje: ${planned} páginas`;
  if (book.progressMode === "percentage") return `Hoje: +${planned}%`;
  return `Hoje: ${Math.round(planned / 60)} min`;
}

function milestoneLine(book: Book, current: number, planned: number): string {
  const next = current + planned;
  if (book.progressMode === "pages") return `Chegar à página ${next}`;
  if (book.progressMode === "percentage") return `Chegar a ${Math.min(100, next)}%`;
  return `Ouvir até ${formatDuration(next)}`;
}

function nextScheduleLabel(date: string, time: string): string {
  if (date === todayISO()) return `hoje, ${time}`;
  if (date === toISODate(addDays(nowDate(), 1))) return `amanhã, ${time}`;
  const [, m, d] = date.split("-");
  return `${d}/${m}, ${time}`;
}

export function ContinueReadingCard({
  book,
  onOpenReadingMode,
  onOpenProgressUpdater,
  onOpenRoutineSetup,
}: {
  book: Book;
  onOpenReadingMode: () => void;
  onOpenProgressUpdater: () => void;
  onOpenRoutineSetup: () => void;
}) {
  const state = useReadingStore((s) => s);
  const executions = useGoalsStore((s) => s.executions);
  const progress = getBookProgress(book);
  const target = getTodayReadingTarget(state, book.id);
  const routine = routineFor(state.routines, book.id);
  const next = getNextReadingSchedule(routine, executions);

  return (
    <section className="reading-hero-card">
      <div className="reading-hero-copy">
        <p className="reading-eyebrow">Continuar lendo</p>
        <h2>{book.title}</h2>
        <p className="reading-book-author">{book.authors.join(", ")}</p>
        <p className="reading-book-progress">
          {progress.label}
          {book.totalChapters
            ? ` · Capítulo ${book.currentChapter ?? 0} de ${book.totalChapters}`
            : ""}
        </p>
        {progress.total !== undefined && (
          <ProgressBar
            value={progress.pct}
            className="reading-progress-bar"
            fillClassName="rounded-none"
            label="Progresso da leitura"
          />
        )}

        {routine ? (
          <div className="reading-hero-schedule">
            {target && (
              <>
                <p>{todayLine(book, target.plannedAmount)}</p>
                <p>{milestoneLine(book, progress.current, target.plannedAmount)}</p>
              </>
            )}
            {next && <p>Próxima leitura: {nextScheduleLabel(next.date, next.time)}</p>}
          </div>
        ) : (
          <div className="reading-hero-schedule reading-hero-schedule--empty">
            <p>Configure sua rotina para distribuir sua leitura.</p>
            <button onClick={onOpenRoutineSetup} className="norte-secondary-action shrink-0">
              configurar rotina
            </button>
          </div>
        )}

        <div className="reading-hero-actions">
          <button onClick={onOpenReadingMode} className="interactive-press reading-primary-action">
            <Play size={19} /> Continuar leitura
          </button>
          <button
            onClick={onOpenProgressUpdater}
            className="interactive-press reading-progress-action"
          >
            <Pencil size={16} />{" "}
            {book.progressMode === "pages" ? "Atualizar página" : "Atualizar progresso"}
          </button>
        </div>
      </div>
    </section>
  );
}
