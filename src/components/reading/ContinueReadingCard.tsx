import { useGoalsStore, todayISO, addDays, toISODate } from "@/lib/goals-store";
import {
  useReadingStore,
  getBookProgress,
  getTodayReadingTarget,
  getNextReadingSchedule,
  routineFor,
  formatDuration,
  type Book,
} from "@/lib/reading-store";
import { Card } from "@/components/sub-agenda-shared";
import { BookCover } from "./BookCover";

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
  if (date === toISODate(addDays(new Date(), 1))) return `amanhã, ${time}`;
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
    <Card title="Continuar lendo">
      <div className="flex gap-4">
        <BookCover book={book} className="h-24 w-16" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{book.title}</p>
          <p className="truncate text-xs text-muted-foreground">{book.authors.join(", ")}</p>
          <p className="mt-2 text-sm font-semibold">{progress.label}</p>
          {progress.total !== undefined && (
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary" style={{ width: `${progress.pct}%` }} />
            </div>
          )}
        </div>
      </div>

      {routine ? (
        <div className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
          {target && (
            <>
              <p className="text-primary">{todayLine(book, target.plannedAmount)}</p>
              <p>{milestoneLine(book, progress.current, target.plannedAmount)}</p>
            </>
          )}
          {next && <p>Próxima leitura: {nextScheduleLabel(next.date, next.time)}</p>}
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <p>Configure sua rotina para distribuir sua leitura.</p>
          <button onClick={onOpenRoutineSetup} className="shrink-0 font-semibold text-primary">
            configurar rotina
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onOpenReadingMode}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Continuar leitura
        </button>
        <button onClick={onOpenProgressUpdater} className="text-xs text-muted-foreground">
          atualizar progresso
        </button>
      </div>
    </Card>
  );
}
