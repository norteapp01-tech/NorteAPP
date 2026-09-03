import { Flame, Sparkles } from "lucide-react";
import {
  useReadingStore,
  getReadingStreak,
  getMonthlyReadingStats,
  formatDuration,
  type ReadingNote,
} from "@/lib/reading-store";
import { Card } from "@/components/sub-agenda-shared";

/** Estatísticas discretas — sem XP, níveis, medalhas ou ranking. */
export function ReadingStats() {
  const state = useReadingStore((s) => s);
  const streak = getReadingStreak(state);
  const monthly = getMonthlyReadingStats(state);
  const hasAudio = state.sessions.some((s) => {
    const book = state.books.find((b) => b.id === s.bookId);
    return book?.progressMode === "time";
  });
  const hasPages = state.sessions.some((s) => (s.pagesRead ?? 0) > 0);

  const parts: string[] = [];
  if (hasAudio) parts.push(`${formatDuration(monthly.totalSeconds)} lendo`);
  if (hasPages) parts.push(`${monthly.totalPages} páginas`);
  parts.push(
    `${monthly.booksCompleted} livro${monthly.booksCompleted === 1 ? "" : "s"} concluído${monthly.booksCompleted === 1 ? "" : "s"}`,
  );

  return (
    <Card title="Sua leitura">
      <div className="flex items-center gap-4">
        {streak > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <Flame className="h-4 w-4 text-primary" />
            <span className="font-semibold">{streak}</span>
            <span className="text-xs text-muted-foreground">dias lendo</span>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{parts.join(" / ")}</p>
    </Card>
  );
}

/** Resgata conteúdo antigo, no máximo um por dia, sem notificações agressivas. */
export function ReadingResurfaceCard({
  note,
  bookTitle,
  onOpenNotebook,
}: {
  note: ReadingNote;
  bookTitle: string;
  onOpenNotebook: () => void;
}) {
  return (
    <Card title="Relembrar">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm italic">"{note.content}"</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{bookTitle}</p>
        </div>
      </div>
      <button onClick={onOpenNotebook} className="mt-2 text-xs text-primary">
        Ver no caderno
      </button>
    </Card>
  );
}
