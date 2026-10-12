import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { addDaysISO } from "@/lib/agenda-intervals";
import { formatShortDate, WEEKDAY_NAMES } from "@/lib/agenda-navigation";
import { weekdayOf } from "@/lib/agenda-recurrence";
import { categoryMeta } from "@/lib/mock-data";
import { todayISO } from "@/lib/goals-store";
import {
  hasActiveFilters,
  searchAgenda,
  toConflictable,
  type AgendaFilters,
} from "@/lib/agenda-search";
import { conflictingIds } from "@/lib/agenda-intervals";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";
import { OccurrenceCard } from "./OccurrenceCard";
import { useAgendaData } from "./use-agenda-data";
import "./agenda-ui.css";

const PAGE = 60;
/** Quanto passado e futuro a busca alcança. */
const REACH_DAYS = 365;

/** Busca visual: título, local, nota, rótulo, categoria, plano, data e estado —
 * passado e futuro numa lista cronológica. Coexiste com a consulta conversacional
 * do Agente Norte. */
export function SearchSheet({
  filters,
  onOpenFilters,
  onOpen,
  onClose,
}: {
  filters: AgendaFilters;
  onOpenFilters: () => void;
  onOpen: (occ: AgendaOccurrence) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [range] = useState(() => ({
    from: addDaysISO(todayISO(), -REACH_DAYS),
    to: addDaysISO(todayISO(), REACH_DAYS),
  }));
  const { occurrences, labels, goals, profile } = useAgendaData(range);

  const ctx = useMemo(
    () => ({
      labelName: (id?: string) => (id ? labels.byId.get(id)?.name : undefined),
      categoryLabel: (c: string) => categoryMeta[c]?.label,
      goalTitle: (id?: string) => goals.find((g) => g.id === id)?.title,
    }),
    [labels.byId, goals],
  );
  const results = useMemo(
    () =>
      searchAgenda(
        occurrences.filter((o) => o.status !== "reagendada"),
        query,
        filters,
        ctx,
      ),
    [occurrences, query, filters, ctx],
  );
  const conflicts = useMemo(() => conflictingIds(occurrences.map(toConflictable)), [occurrences]);
  const filtered = hasActiveFilters(filters);

  return (
    <Modal onClose={onClose} title="Buscar na Agenda">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Título, local, nota, rótulo, plano ou data"
            aria-label="Buscar compromissos"
            className="w-full rounded-xl border border-border bg-surface py-3 pr-4 pl-10 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          onClick={onOpenFilters}
          aria-label="Filtros"
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${filtered ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground" aria-live="polite">
        {results.length} resultado{results.length === 1 ? "" : "s"}
        {filtered ? " com os filtros ativos" : ""}
      </p>

      <div className="mt-2 max-h-[55vh] space-y-2 overflow-y-auto pr-0.5">
        {results.slice(0, limit).map((occ) => (
          <OccurrenceCard
            key={occ.key}
            occ={occ}
            label={occ.labelId ? labels.byId.get(occ.labelId) : undefined}
            conflict={conflicts.has(occ.key)}
            timeFormat={profile.timeFormat}
            showDate
            dateText={`${WEEKDAY_NAMES[weekdayOf(occ.date)].slice(0, 3)}, ${formatShortDate(occ.date)}`}
            onOpen={(o) => {
              onClose();
              onOpen(o);
            }}
          />
        ))}
        {results.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nada encontrado. Tente outra palavra ou limpe os filtros.
          </p>
        )}
        {results.length > limit && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="min-h-11 w-full text-sm font-semibold text-primary"
          >
            Mostrar mais
          </button>
        )}
      </div>
    </Modal>
  );
}
