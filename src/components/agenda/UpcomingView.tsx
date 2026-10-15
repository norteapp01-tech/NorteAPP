import { useMemo, useState } from "react";
import { formatShortDate, upcomingSections, relativeDayLabel } from "@/lib/agenda-navigation";
import { OccurrenceCard } from "./OccurrenceCard";
import type { ViewProps } from "./view-types";
import "./agenda-ui.css";

const PAGE = 40;

/** Linha do tempo contínua: hoje, amanhã, esta semana e as próximas semanas. */
export function UpcomingView(props: ViewProps) {
  const { today, occurrences, labelsById, conflictIds, timeFormat, weekStart, onOpen } = props;
  const [limit, setLimit] = useState(PAGE);
  const all = useMemo(
    () =>
      upcomingSections(
        occurrences.filter((o) => o.status !== "cancelada" && o.date >= today),
        today,
        weekStart,
      ),
    [occurrences, today, weekStart],
  );
  // Séries diárias geram centenas de linhas: mostra por partes, na ordem do tempo.
  const total = all.reduce((sum, section) => sum + section.items.length, 0);
  const sections = useMemo(() => {
    let left = limit;
    return all
      .map((section) => {
        const items = section.items.slice(0, Math.max(0, left));
        left -= items.length;
        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [all, limit]);

  if (sections.length === 0)
    return <p className="mt-10 text-center text-sm text-muted-foreground">Nenhum compromisso.</p>;

  return (
    <div className="mt-3 space-y-6">
      {sections.map((section) => (
        <section key={section.id} aria-label={section.title}>
          <h3 className="norte-section-title mb-2">{section.title}</h3>
          <div className="space-y-2">
            {section.items.map((occ) => (
              <OccurrenceCard
                key={occ.key}
                occ={occ}
                label={occ.labelId ? labelsById.get(occ.labelId) : undefined}
                conflict={conflictIds.has(occ.key)}
                timeFormat={timeFormat}
                showDate={section.id === "semana" || section.id === "proximas"}
                dateText={
                  section.id === "semana"
                    ? relativeDayLabel(occ.date, today).slice(0, 3)
                    : formatShortDate(occ.date)
                }
                onOpen={onOpen}
              />
            ))}
          </div>
        </section>
      ))}
      {total > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="min-h-12 w-full rounded-xl border border-border text-sm font-semibold text-primary"
        >
          Mostrar mais ({total - limit})
        </button>
      )}
    </div>
  );
}
