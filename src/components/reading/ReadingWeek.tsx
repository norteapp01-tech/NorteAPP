import { useState } from "react";
import { Check } from "lucide-react";
import { startOfWeek, addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { WeekdaySelector } from "@/components/ui/app-design-system";
import { Modal } from "@/components/ui/modal";
import { nowDate } from "@/lib/test-clock";
import { useReadingStore, formatDuration } from "@/lib/reading-store";
import { ReadingStats } from "./ReadingStats";

export function ReadingWeek() {
  const state = useReadingStore((s) => s);
  const [selected, setSelected] = useState<number | null>(null);
  const [stats, setStats] = useState(false);
  const start = startOfWeek(nowDate(), { weekStartsOn: 1 });
  const dateFor = (day: number) => addDays(start, (day + 6) % 7);
  const keyFor = (day: number) => format(dateFor(day), "yyyy-MM-dd");
  const sessionsFor = (day: number) =>
    state.sessions.filter(
      (s) =>
        s.status === "completed" &&
        s.endedAt &&
        format(new Date(s.endedAt), "yyyy-MM-dd") === keyFor(day),
    );
  const completed = (day: number) =>
    state.activityDates.includes(keyFor(day)) || sessionsFor(day).length > 0;
  const total = [1, 2, 3, 4, 5, 6, 0].filter(completed).length;
  return (
    <section className="reading-week">
      <div className="reading-section-heading">
        <h3>Sua semana</h3>
        <button onClick={() => setStats(true)}>Ver evolução →</button>
      </div>
      <div className="reading-week-days">
        <WeekdaySelector
          onSelect={setSelected}
          selectedDay={selected ?? undefined}
          completed={completed}
          primary={(day) => (completed(day) ? <Check size={18} className="mx-auto" /> : "—")}
        />
      </div>
      <p className="reading-week-count">
        {total} {total === 1 ? "dia" : "dias"} com leitura
      </p>
      <p className="reading-muted">Seu ritmo, um dia de cada vez.</p>
      {stats && (
        <Modal title="Sua leitura" onClose={() => setStats(false)}>
          <ReadingStats />
        </Modal>
      )}
      {selected !== null && (
        <Modal
          title={format(dateFor(selected), "EEEE, d 'de' MMMM", { locale: ptBR })}
          onClose={() => setSelected(null)}
        >
          {sessionsFor(selected).map((s) => (
            <div key={s.id} className="border-b border-border py-3">
              <p className="text-sm font-semibold">
                {state.books.find((b) => b.id === s.bookId)?.title ?? "Livro"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {format(new Date(s.startedAt), "HH:mm")} · {formatDuration(s.durationSeconds ?? 0)}
                {s.pagesRead != null ? ` · ${s.pagesRead} páginas` : ""}
                {s.percentageRead != null ? ` · ${s.percentageRead}%` : ""}
              </p>
            </div>
          ))}
          {!sessionsFor(selected).length && (
            <p className="text-sm text-muted-foreground">
              {completed(selected)
                ? "Progresso atualizado neste dia, sem sessão cronometrada."
                : "Nenhuma leitura registrada neste dia."}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
