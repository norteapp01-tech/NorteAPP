import type { AgendaOccurrence } from "./agenda-occurrences";
import { conflictingIds, type Conflictable } from "./agenda-intervals";

// ---------------------------------------------------------------------------
// Busca e filtros da Agenda — funções puras sobre as ocorrências.
// ---------------------------------------------------------------------------

export type StatusFilter = "concluida" | "perdida" | "cancelada" | "planejada";

export type AgendaFilters = {
  labelIds: string[];
  /** Inclui "sem rótulo" quando true (ou quando nenhum rótulo foi escolhido). */
  includeUnlabeled: boolean;
  statuses: StatusFilter[];
  rigid: "todos" | "rigidos" | "flexiveis";
  plan: "todos" | "com" | "sem";
  conflict: boolean;
  noAlert: boolean;
  from?: string;
  to?: string;
};

export const EMPTY_FILTERS: AgendaFilters = {
  labelIds: [],
  includeUnlabeled: true,
  statuses: [],
  rigid: "todos",
  plan: "todos",
  conflict: false,
  noAlert: false,
};

/** Tira acento e caixa: "Saúde" casa com "saude". */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export type SearchContext = {
  labelName?: (id: string | undefined) => string | undefined;
  categoryLabel?: (category: string) => string | undefined;
  goalTitle?: (id: string | undefined) => string | undefined;
  statusLabel?: (status: string) => string;
};

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  planejada: "planejada agendada",
  concluida: "concluida feita",
  perdida: "perdida atrasada",
  cancelada: "cancelada descartada",
  reagendada: "reagendada",
};

/** Texto pesquisável de uma ocorrência: título, local, nota, rótulo,
 * categoria, plano, data e estado. */
export function searchableText(o: AgendaOccurrence, ctx: SearchContext = {}): string {
  const [y, m, d] = o.date.split("-");
  return normalizeText(
    [
      o.title,
      o.location,
      o.notes,
      o.link,
      ctx.labelName?.(o.labelId),
      ctx.categoryLabel?.(o.category) ?? o.category,
      ctx.goalTitle?.(o.goalId),
      o.date,
      `${d}/${m}/${y}`,
      `${d}/${m}`,
      (ctx.statusLabel?.(o.status) ?? DEFAULT_STATUS_LABELS[o.status]) || "",
      o.rigid ? "rigido" : "flexivel",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function matchesQuery(o: AgendaOccurrence, query: string, ctx: SearchContext = {}): boolean {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchableText(o, ctx);
  return terms.every((term) => haystack.includes(term));
}

export function filterOccurrences(
  list: AgendaOccurrence[],
  filters: AgendaFilters,
  conflictScope: AgendaOccurrence[] = list,
): AgendaOccurrence[] {
  const conflicts = filters.conflict
    ? conflictingIds(conflictScope.map(toConflictable))
    : new Set<string>();
  return list.filter((o) => {
    if (filters.labelIds.length > 0 || !filters.includeUnlabeled) {
      const labeled = o.labelId ? filters.labelIds.includes(o.labelId) : filters.includeUnlabeled;
      if (!labeled) return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(o.status as StatusFilter))
      return false;
    if (filters.rigid === "rigidos" && !o.rigid) return false;
    if (filters.rigid === "flexiveis" && o.rigid) return false;
    if (filters.plan === "com" && !o.goalId) return false;
    if (filters.plan === "sem" && o.goalId) return false;
    if (filters.conflict && !conflicts.has(o.key)) return false;
    if (filters.noAlert && (o.alerts?.length ?? 0) > 0) return false;
    if (filters.from && o.date < filters.from) return false;
    if (filters.to && o.date > filters.to) return false;
    return true;
  });
}

export function toConflictable(o: AgendaOccurrence): Conflictable {
  return {
    id: o.key,
    title: o.title,
    date: o.date,
    startTime: o.startTime,
    endTime: o.endTime,
    allDay: o.allDay,
    status: o.status,
    rigid: o.rigid,
  };
}

export function hasActiveFilters(f: AgendaFilters): boolean {
  return (
    f.labelIds.length > 0 ||
    !f.includeUnlabeled ||
    f.statuses.length > 0 ||
    f.rigid !== "todos" ||
    f.plan !== "todos" ||
    f.conflict ||
    f.noAlert ||
    !!f.from ||
    !!f.to
  );
}

/** Busca + filtros, em ordem cronológica. */
export function searchAgenda(
  list: AgendaOccurrence[],
  query: string,
  filters: AgendaFilters,
  ctx: SearchContext = {},
): AgendaOccurrence[] {
  return filterOccurrences(
    list.filter((o) => matchesQuery(o, query, ctx)),
    filters,
    list,
  ).sort(
    (a, b) => a.date.localeCompare(b.date) || (a.startTime ?? "").localeCompare(b.startTime ?? ""),
  );
}
