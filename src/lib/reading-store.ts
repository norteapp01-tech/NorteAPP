import { useQuery } from "@tanstack/react-query";
import { toISODate, todayISO, addDays, createRoutine, removeRoutine } from "./goals-store";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import type { SearchBookResult } from "./book-search-service";

// ---------------------------------------------------------------------------
// Central de leitura — domínio auto-contido, mesmo padrão dos outros stores
// (goals-store.ts). A integração com Agenda/Rotina reaproveita
// createRoutine/removeRoutine do goals-store, sem tocar nele.
//
// Persistida no Supabase. Ações que antes liam `state` síncrono pra validar
// (ex.: "não pode passar do total", "já existe sessão ativa em outro livro")
// agora leem o snapshot mais recente já buscado via
// `queryClient.getQueryData(QUERY_KEY)` — mesmo dado que a tela já está
// vendo, sem round-trip extra — e escrevem no Supabase o resultado. A lógica
// de validação/cálculo em si não mudou uma linha.
// ---------------------------------------------------------------------------

export type BookStatus = "reading" | "want_to_read" | "completed" | "paused";
export type BookFormat = "physical" | "ebook" | "audiobook";
export type ProgressMode = "pages" | "percentage" | "time";

export type Book = {
  id: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  coverImage?: string; // data URL (foto manual da capa)
  isbn?: string;
  externalId?: string;
  metadataProvider?: "google_books" | "open_library" | "manual";
  format: BookFormat;
  progressMode: ProgressMode;
  status: BookStatus;
  totalPages?: number;
  currentPage?: number;
  currentPercentage?: number;
  totalSeconds?: number;
  currentSeconds?: number;
  rating?: number;
  mainTakeaway?: string;
  personalReflection?: string;
  startedAt?: string;
  completedAt?: string;
  pausedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReadingSession = {
  id: string;
  bookId: string;
  startedAt: string;
  endedAt?: string;
  pausedDurationSeconds: number;
  durationSeconds?: number;
  startPage?: number;
  endPage?: number;
  pagesRead?: number;
  startPercentage?: number;
  endPercentage?: number;
  percentageRead?: number;
  startProgressSeconds?: number;
  endProgressSeconds?: number;
  progressSeconds?: number;
  status: "active" | "completed";
  /** presente enquanto a sessão está pausada agora; usado só internamente pra acumular pausedDurationSeconds */
  pausedSince?: string;
};

export type ReadingNoteType = "quote" | "insight" | "note";
export type ReadingNote = {
  id: string;
  bookId: string;
  sessionId?: string;
  type: ReadingNoteType;
  content: string;
  tags: string[];
  pageNumber?: number;
  percentage?: number;
  timestampSeconds?: number;
  createdAt: string;
  updatedAt: string;
  lastResurfacedAt?: string;
  resurfaceCount: number;
};

export type ReadingPlanType = "deadline" | "daily_target";
export type ReadingPlan = {
  id: string;
  bookId: string;
  type: ReadingPlanType;
  deadline?: string;
  targetPages?: number;
  targetPercentage?: number;
  targetSeconds?: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReadingRoutine = {
  id: string;
  bookId?: string;
  weekdays: number[];
  time: string;
  desiredDurationMinutes?: number;
  active: boolean;
  /** ids das Routine do goals-store (uma por dia da semana) que materializam isso na Agenda. */
  goalsRoutineIds: string[];
};

export type TargetUnit = "pages" | "percentage" | "seconds";
export type AdjustmentStatus = "none" | "pending" | "redistributed" | "moved" | "kept";
export type ReadingDailyTarget = {
  id: string;
  bookId: string;
  date: string;
  plannedAmount: number;
  completedAmount: number;
  unit: TargetUnit;
  adjustmentStatus: AdjustmentStatus;
};

type State = {
  books: Book[];
  sessions: ReadingSession[];
  notes: ReadingNote[];
  plans: ReadingPlan[];
  routines: ReadingRoutine[];
  dailyTargets: ReadingDailyTarget[];
  activityDates: string[];
};

const EMPTY_STATE: State = {
  books: [],
  sessions: [],
  notes: [],
  plans: [],
  routines: [],
  dailyTargets: [],
  activityDates: [],
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Helpers puros de formatação/cálculo — nada mudou aqui.
// ---------------------------------------------------------------------------
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${pad(m)}`;
  return `${m}min`;
}

export function unitLabel(unit: TargetUnit): string {
  return unit === "pages" ? "páginas" : unit === "percentage" ? "%" : "seg";
}

export function getBookProgress(book: Book): {
  current: number;
  total?: number;
  pct: number;
  label: string;
} {
  if (book.progressMode === "pages") {
    const current = book.currentPage ?? 0;
    const total = book.totalPages;
    const pct = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
    return {
      current,
      total,
      pct,
      label: total ? `Página ${current} de ${total}` : `Página ${current}`,
    };
  }
  if (book.progressMode === "percentage") {
    const current = book.currentPercentage ?? 0;
    return {
      current,
      total: 100,
      pct: Math.min(100, Math.round(current)),
      label: `${Math.round(current)}% concluído`,
    };
  }
  const current = book.currentSeconds ?? 0;
  const total = book.totalSeconds;
  const pct = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return {
    current,
    total,
    pct,
    label: total
      ? `${formatDuration(current)} de ${formatDuration(total)}`
      : formatDuration(current),
  };
}

function getRemainingAmount(book: Book): number {
  if (book.progressMode === "pages")
    return Math.max(0, (book.totalPages ?? 0) - (book.currentPage ?? 0));
  if (book.progressMode === "percentage") return Math.max(0, 100 - (book.currentPercentage ?? 0));
  return Math.max(0, (book.totalSeconds ?? 0) - (book.currentSeconds ?? 0));
}

export function targetUnitForBook(book: Book): TargetUnit {
  return book.progressMode === "pages"
    ? "pages"
    : book.progressMode === "percentage"
      ? "percentage"
      : "seconds";
}

function isBookComplete(book: Book): boolean {
  if (book.progressMode === "pages")
    return (book.totalPages ?? 0) > 0 && (book.currentPage ?? 0) >= (book.totalPages ?? 0);
  if (book.progressMode === "percentage") return (book.currentPercentage ?? 0) >= 100;
  return (book.totalSeconds ?? 0) > 0 && (book.currentSeconds ?? 0) >= (book.totalSeconds ?? 0);
}

function plannedDaysBetween(
  routine: ReadingRoutine,
  fromISO: string,
  toISOInclusive: string,
): string[] {
  const out: string[] = [];
  let d = new Date(fromISO + "T00:00:00");
  const end = new Date(toISOInclusive + "T00:00:00");
  let guard = 0;
  while (d.getTime() <= end.getTime() && guard < 400) {
    if (routine.weekdays.includes(d.getDay())) out.push(toISODate(d));
    d = addDays(d, 1);
    guard++;
  }
  return out;
}

/** Meta diária calculada pelo plano — não persiste nada, só calcula. */
export function calculateDeadlineTarget(
  book: Book,
  plan: ReadingPlan,
  routine: ReadingRoutine,
): number {
  if (!plan.deadline) return 0;
  const remaining = getRemainingAmount(book);
  const days = plannedDaysBetween(routine, todayISO(), plan.deadline);
  return Math.ceil(remaining / Math.max(1, days.length));
}

function computePlanDailyAmount(
  book: Book,
  plan: ReadingPlan,
  routine: ReadingRoutine,
): { value: number; unit: TargetUnit } {
  const unit = targetUnitForBook(book);
  if (plan.type === "daily_target") {
    const value = plan.targetPages ?? plan.targetPercentage ?? plan.targetSeconds ?? 0;
    return { value, unit };
  }
  return { value: calculateDeadlineTarget(book, plan, routine), unit };
}

export function calculateProjectedFinishDate(
  book: Book,
  plan: ReadingPlan,
  routine: ReadingRoutine,
): string | null {
  if (!routine.weekdays.length) return null;
  const daily = computePlanDailyAmount(book, plan, routine).value;
  if (daily <= 0) return null;
  let remaining = getRemainingAmount(book);
  let d = new Date();
  let guard = 0;
  while (remaining > 0 && guard < 3650) {
    d = addDays(d, 1);
    guard++;
    if (routine.weekdays.includes(d.getDay())) remaining -= daily;
  }
  return toISODate(d);
}

/** Progresso calculado de uma sessão a partir das posições inicial/final — não persiste. */
export function calculateSessionProgress(
  book: Book,
  startValue: number,
  endValue: number,
): { pagesRead?: number; percentageRead?: number; progressSeconds?: number } {
  const delta = Math.max(0, endValue - startValue);
  if (book.progressMode === "pages") return { pagesRead: delta };
  if (book.progressMode === "percentage") return { percentageRead: delta };
  return { progressSeconds: delta };
}

function sessionElapsedSeconds(session: ReadingSession, now = Date.now()): number {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : now;
  const activePauseSeconds = session.pausedSince
    ? Math.max(0, (now - new Date(session.pausedSince).getTime()) / 1000)
    : 0;
  const elapsed = (end - start) / 1000 - session.pausedDurationSeconds - activePauseSeconds;
  return Math.max(0, Math.round(elapsed));
}
export { sessionElapsedSeconds };

function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ---------------------------------------------------------------------------
// Seletores — nada mudou aqui.
// ---------------------------------------------------------------------------
export function booksByStatus(books: Book[], status: BookStatus): Book[] {
  return books
    .filter((b) => b.status === status)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function activeSession(sessions: ReadingSession[]): ReadingSession | undefined {
  return sessions.find((s) => s.status === "active");
}

export function planFor(plans: ReadingPlan[], bookId: string): ReadingPlan | undefined {
  return plans.find((p) => p.bookId === bookId && p.active);
}

export function routineFor(routines: ReadingRoutine[], bookId: string): ReadingRoutine | undefined {
  return routines.find((r) => r.bookId === bookId && r.active);
}

export function getTodayReadingTarget(
  state: State,
  bookId: string,
): { plannedAmount: number; completedAmount: number; unit: TargetUnit } | null {
  const book = state.books.find((b) => b.id === bookId);
  const plan = planFor(state.plans, bookId);
  const routine = routineFor(state.routines, bookId);
  if (!book || !plan || !routine) return null;
  if (!routine.weekdays.includes(new Date().getDay())) return null;
  const iso = todayISO();
  const existing = state.dailyTargets.find((t) => t.bookId === bookId && t.date === iso);
  if (existing)
    return {
      plannedAmount: existing.plannedAmount,
      completedAmount: existing.completedAmount,
      unit: existing.unit,
    };
  const computed = computePlanDailyAmount(book, plan, routine);
  return { plannedAmount: computed.value, completedAmount: 0, unit: computed.unit };
}

/** Próxima execução real da Agenda (goals-store) gerada pela rotina de leitura deste livro. */
export function getNextReadingSchedule(
  routine: ReadingRoutine | undefined,
  goalsExecutions: {
    id: string;
    dueDate: string;
    agendaDate?: string;
    startTime?: string;
    status: string;
    routineId?: string;
  }[],
): { date: string; time: string } | null {
  if (!routine) return null;
  const relevant = (e: { dueDate: string; agendaDate?: string }) => e.agendaDate ?? e.dueDate;
  const upcoming = goalsExecutions
    .filter(
      (e) =>
        e.routineId && routine.goalsRoutineIds.includes(e.routineId) && e.status === "planejada",
    )
    .sort((a, b) =>
      (relevant(a) + (a.startTime ?? "")).localeCompare(relevant(b) + (b.startTime ?? "")),
    );
  return upcoming[0] ? { date: relevant(upcoming[0]), time: upcoming[0].startTime ?? "" } : null;
}

export function getReadingStreak(state: State): number {
  const dates = new Set<string>(state.activityDates);
  for (const s of state.sessions)
    if (s.status === "completed" && s.endedAt) dates.add(toISODate(new Date(s.endedAt)));
  let cursor = new Date();
  if (!dates.has(toISODate(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (dates.has(toISODate(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function getMonthlyReadingStats(state: State): {
  totalSeconds: number;
  totalPages: number;
  booksCompleted: number;
} {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const sessionsThisMonth = state.sessions.filter(
    (s) => s.status === "completed" && s.endedAt && toISODate(new Date(s.endedAt)) >= monthStart,
  );
  const totalSeconds = sessionsThisMonth.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
  const totalPages = sessionsThisMonth.reduce((sum, s) => sum + (s.pagesRead ?? 0), 0);
  const booksCompleted = state.books.filter(
    (b) => b.status === "completed" && b.completedAt && b.completedAt >= monthStart,
  ).length;
  return { totalSeconds, totalPages, booksCompleted };
}

export function getMissedReadingTarget(state: State): ReadingDailyTarget | undefined {
  const iso = todayISO();
  return [...state.dailyTargets]
    .filter(
      (t) => t.date < iso && t.adjustmentStatus === "none" && t.completedAmount < t.plannedAmount,
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function searchReadingNotes(
  state: State,
  query: string,
): (ReadingNote & { bookTitle: string })[] {
  const q = normalizeText(query.trim());
  if (!q) return [];
  return state.notes
    .map((n) => ({ ...n, bookTitle: state.books.find((b) => b.id === n.bookId)?.title ?? "" }))
    .filter((n) => {
      const book = state.books.find((b) => b.id === n.bookId);
      const haystack = normalizeText(
        [n.content, n.tags.join(" "), book?.title ?? "", (book?.authors ?? []).join(" ")].join(" "),
      );
      return haystack.includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getResurfacingCandidate(state: State): ReadingNote | null {
  const cutoff = toISODate(addDays(new Date(), -7));
  const eligible = state.notes.filter((n) => toISODate(new Date(n.createdAt)) <= cutoff);
  if (eligible.length === 0) return null;
  const iso = todayISO();
  const shownToday = eligible.find(
    (n) => n.lastResurfacedAt && toISODate(new Date(n.lastResurfacedAt)) === iso,
  );
  if (shownToday) return shownToday;
  const neverShown = eligible.filter((n) => !n.lastResurfacedAt);
  if (neverShown.length > 0) return neverShown[0];
  return [...eligible].sort(
    (a, b) =>
      new Date(a.lastResurfacedAt as string).getTime() -
      new Date(b.lastResurfacedAt as string).getTime(),
  )[0];
}

// ---------------------------------------------------------------------------
// Mapeamento snake_case (Supabase) -> camelCase
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function groupBy<T extends Row>(rows: T[], key: string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const k = r[key] as string;
    (out[k] ??= []).push(r);
  }
  return out;
}

function mapBook(r: Row): Book {
  return {
    id: r.id as string,
    title: r.title as string,
    authors: (r.authors as string[]) ?? [],
    coverUrl: (r.cover_url as string) ?? undefined,
    coverImage: (r.cover_path as string) ?? undefined,
    isbn: (r.isbn as string) ?? undefined,
    externalId: (r.external_id as string) ?? undefined,
    metadataProvider: (r.metadata_provider as Book["metadataProvider"]) ?? undefined,
    format: r.format as BookFormat,
    progressMode: r.progress_mode as ProgressMode,
    status: r.status as BookStatus,
    totalPages: (r.total_pages as number) ?? undefined,
    currentPage: (r.current_page as number) ?? undefined,
    currentPercentage: (r.current_percentage as number) ?? undefined,
    totalSeconds: (r.total_seconds as number) ?? undefined,
    currentSeconds: (r.current_seconds as number) ?? undefined,
    rating: (r.rating as number) ?? undefined,
    mainTakeaway: (r.main_takeaway as string) ?? undefined,
    personalReflection: (r.personal_reflection as string) ?? undefined,
    startedAt: (r.started_at as string) ?? undefined,
    completedAt: (r.completed_at as string) ?? undefined,
    pausedAt: (r.paused_at as string) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapSession(r: Row): ReadingSession {
  return {
    id: r.id as string,
    bookId: r.book_id as string,
    startedAt: r.started_at as string,
    endedAt: (r.ended_at as string) ?? undefined,
    pausedDurationSeconds: (r.paused_duration_seconds as number) ?? 0,
    durationSeconds: (r.duration_seconds as number) ?? undefined,
    startPage: (r.start_page as number) ?? undefined,
    endPage: (r.end_page as number) ?? undefined,
    pagesRead: (r.pages_read as number) ?? undefined,
    startPercentage: (r.start_percentage as number) ?? undefined,
    endPercentage: (r.end_percentage as number) ?? undefined,
    percentageRead: (r.percentage_read as number) ?? undefined,
    startProgressSeconds: (r.start_progress_seconds as number) ?? undefined,
    endProgressSeconds: (r.end_progress_seconds as number) ?? undefined,
    progressSeconds: (r.progress_seconds as number) ?? undefined,
    status: r.status as "active" | "completed",
    pausedSince: (r.paused_since as string) ?? undefined,
  };
}

function mapNote(r: Row): ReadingNote {
  return {
    id: r.id as string,
    bookId: r.book_id as string,
    sessionId: (r.session_id as string) ?? undefined,
    type: r.type as ReadingNoteType,
    content: (r.content as string) ?? "",
    tags: (r.tags as string[]) ?? [],
    pageNumber: (r.page_number as number) ?? undefined,
    percentage: (r.percentage as number) ?? undefined,
    timestampSeconds: (r.timestamp_seconds as number) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    lastResurfacedAt: (r.last_resurfaced_at as string) ?? undefined,
    resurfaceCount: (r.resurface_count as number) ?? 0,
  };
}

function mapPlan(r: Row): ReadingPlan {
  return {
    id: r.id as string,
    bookId: r.book_id as string,
    type: r.type as ReadingPlanType,
    deadline: (r.deadline as string) ?? undefined,
    targetPages: (r.target_pages as number) ?? undefined,
    targetPercentage: (r.target_percentage as number) ?? undefined,
    targetSeconds: (r.target_seconds as number) ?? undefined,
    active: r.active as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapRoutine(r: Row, links: Row[]): ReadingRoutine {
  const sorted = [...links].sort((a, b) => (a.weekday as number) - (b.weekday as number));
  return {
    id: r.id as string,
    bookId: (r.book_id as string) ?? undefined,
    weekdays: sorted.map((l) => l.weekday as number),
    time: r.time as string,
    desiredDurationMinutes: (r.desired_duration_minutes as number) ?? undefined,
    active: r.active as boolean,
    goalsRoutineIds: sorted.map((l) => l.core_routine_id as string),
  };
}

function mapDailyTarget(r: Row): ReadingDailyTarget {
  return {
    id: r.id as string,
    bookId: r.book_id as string,
    date: r.date as string,
    plannedAmount: (r.planned_amount as number) ?? 0,
    completedAmount: (r.completed_amount as number) ?? 0,
    unit: r.unit as TargetUnit,
    adjustmentStatus: r.adjustment_status as AdjustmentStatus,
  };
}

async function fetchState(): Promise<State> {
  const [
    booksRes,
    sessionsRes,
    notesRes,
    plansRes,
    routinesRes,
    linksRes,
    targetsRes,
    activityRes,
  ] = await Promise.all([
    supabase.from("reading_books").select("*").order("created_at", { ascending: false }),
    supabase.from("reading_sessions").select("*").order("started_at", { ascending: false }),
    supabase.from("reading_notes").select("*").order("created_at", { ascending: false }),
    supabase.from("reading_plans").select("*").order("created_at", { ascending: false }),
    supabase.from("reading_routines").select("*"),
    supabase.from("routine_links").select("*").eq("source_type", "reading_routine"),
    supabase.from("reading_daily_targets").select("*"),
    supabase.from("reading_activity_log").select("date"),
  ]);
  const bookRows = unwrap(booksRes);
  const sessionRows = unwrap(sessionsRes);
  const noteRows = unwrap(notesRes);
  const planRows = unwrap(plansRes);
  const routineRows = unwrap(routinesRes);
  const linkRows = unwrap(linksRes) as Row[];
  const targetRows = unwrap(targetsRes);
  const activityRows = unwrap(activityRes);

  const linksByRoutine = groupBy(linkRows, "source_id");

  return {
    books: (bookRows as Row[]).map(mapBook),
    sessions: (sessionRows as Row[]).map(mapSession),
    notes: (noteRows as Row[]).map(mapNote),
    plans: (planRows as Row[]).map(mapPlan),
    routines: (routineRows as Row[]).map((r) =>
      mapRoutine(r, linksByRoutine[r.id as string] ?? []),
    ),
    dailyTargets: (targetRows as Row[]).map(mapDailyTarget),
    activityDates: (activityRows as Row[]).map((r) => r.date as string),
  };
}

const QUERY_KEY = ["reading-domain"] as const;
function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}
/** Snapshot mais recente já buscado — usado dentro das ações pra validar/calcular
 * exatamente como o `state` síncrono fazia antes, sem round-trip extra. */
function snapshot(): State {
  return queryClient.getQueryData<State>(QUERY_KEY) ?? EMPTY_STATE;
}

export function useReadingStore<T>(selector: (s: State) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return selector(data ?? EMPTY_STATE);
}

function recordActivity(date = todayISO()) {
  return ensureSession().then((userId) =>
    supabase
      .from("reading_activity_log")
      .upsert({ user_id: userId, date }, { onConflict: "user_id,date" }),
  );
}

/** Soma `delta` na meta diária do livro (cria a linha se ainda não existir). */
async function bumpDailyTargetCompleted(
  userId: string,
  bookId: string,
  date: string,
  delta: number,
  book: Book,
  plan: ReadingPlan | undefined,
  routine: ReadingRoutine | undefined,
) {
  const existing = snapshot().dailyTargets.find((t) => t.bookId === bookId && t.date === date);
  if (existing) {
    await supabase
      .from("reading_daily_targets")
      .update({ completed_amount: existing.completedAmount + delta })
      .eq("id", existing.id);
    return;
  }
  if (!plan || !routine) return;
  const computed = computePlanDailyAmount(book, plan, routine);
  await supabase.from("reading_daily_targets").upsert(
    {
      user_id: userId,
      book_id: bookId,
      date,
      planned_amount: computed.value,
      completed_amount: delta,
      unit: computed.unit,
      adjustment_status: "none",
    },
    { onConflict: "book_id,date" },
  );
}

// ---------------------------------------------------------------------------
// Ações — livros
// ---------------------------------------------------------------------------
function defaultProgressMode(format: BookFormat): ProgressMode {
  if (format === "audiobook") return "time";
  return "pages";
}

export async function addBookFromSearch(
  result: SearchBookResult,
  opts: {
    format: BookFormat;
    status: "reading" | "want_to_read";
    progressMode?: ProgressMode;
    totalPages?: number;
    totalSeconds?: number;
  },
): Promise<string> {
  const userId = await ensureSession();
  const mode = opts.progressMode ?? defaultProgressMode(opts.format);
  const row = unwrap<{ id: string }>(
    await supabase
      .from("reading_books")
      .insert({
        user_id: userId,
        title: result.title,
        authors: result.authors,
        cover_url: result.coverUrl,
        isbn: result.isbn,
        external_id: result.externalId,
        metadata_provider: result.provider,
        format: opts.format,
        progress_mode: mode,
        status: opts.status,
        total_pages: mode === "pages" ? (opts.totalPages ?? result.pageCount) : undefined,
        total_seconds: mode === "time" ? opts.totalSeconds : undefined,
        current_page: mode === "pages" ? 0 : undefined,
        current_percentage: mode === "percentage" ? 0 : undefined,
        current_seconds: mode === "time" ? 0 : undefined,
        started_at: opts.status === "reading" ? todayISO() : undefined,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function addBookManual(input: {
  title: string;
  authors?: string[];
  format: BookFormat;
  status: "reading" | "want_to_read";
  progressMode?: ProgressMode;
  coverImage?: string;
  totalPages?: number;
  totalSeconds?: number;
}): Promise<string> {
  const userId = await ensureSession();
  const mode = input.progressMode ?? defaultProgressMode(input.format);
  const row = unwrap<{ id: string }>(
    await supabase
      .from("reading_books")
      .insert({
        user_id: userId,
        title: input.title.trim(),
        authors: input.authors ?? [],
        cover_path: input.coverImage,
        metadata_provider: "manual",
        format: input.format,
        progress_mode: mode,
        status: input.status,
        total_pages: mode === "pages" ? input.totalPages : undefined,
        total_seconds: mode === "time" ? input.totalSeconds : undefined,
        current_page: mode === "pages" ? 0 : undefined,
        current_percentage: mode === "percentage" ? 0 : undefined,
        current_seconds: mode === "time" ? 0 : undefined,
        started_at: input.status === "reading" ? todayISO() : undefined,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

/** "+ Quero ler" — só o nome, extremamente rápido. */
export async function quickAddWantToRead(title: string): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("reading_books")
      .insert({
        user_id: userId,
        title: title.trim(),
        authors: [],
        format: "physical",
        progress_mode: "pages",
        status: "want_to_read",
        metadata_provider: "manual",
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export type UpdateBookResult = { ok: boolean; error?: string };

export async function updateBook(
  id: string,
  patch: Partial<
    Pick<
      Book,
      | "title"
      | "authors"
      | "coverUrl"
      | "coverImage"
      | "format"
      | "progressMode"
      | "totalPages"
      | "totalSeconds"
      | "rating"
      | "mainTakeaway"
      | "personalReflection"
    >
  >,
): Promise<UpdateBookResult> {
  const book = snapshot().books.find((b) => b.id === id);
  if (!book) return { ok: false, error: "livro não encontrado" };
  if (patch.totalPages !== undefined && (book.currentPage ?? 0) > patch.totalPages) {
    return { ok: false, error: "o total não pode ser menor que o progresso atual" };
  }
  if (patch.totalSeconds !== undefined && (book.currentSeconds ?? 0) > patch.totalSeconds) {
    return { ok: false, error: "o total não pode ser menor que o progresso atual" };
  }
  const dbPatch: Row = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.authors !== undefined) dbPatch.authors = patch.authors;
  if (patch.coverUrl !== undefined) dbPatch.cover_url = patch.coverUrl;
  if (patch.coverImage !== undefined) dbPatch.cover_path = patch.coverImage;
  if (patch.format !== undefined) dbPatch.format = patch.format;
  if (patch.progressMode !== undefined) dbPatch.progress_mode = patch.progressMode;
  if (patch.totalPages !== undefined) dbPatch.total_pages = patch.totalPages;
  if (patch.totalSeconds !== undefined) dbPatch.total_seconds = patch.totalSeconds;
  if (patch.rating !== undefined) dbPatch.rating = patch.rating;
  if (patch.mainTakeaway !== undefined) dbPatch.main_takeaway = patch.mainTakeaway;
  if (patch.personalReflection !== undefined)
    dbPatch.personal_reflection = patch.personalReflection;
  unwrap(await supabase.from("reading_books").update(dbPatch).eq("id", id).select().single());
  await invalidate();
  return { ok: true };
}

export async function startReading(bookId: string) {
  const book = snapshot().books.find((b) => b.id === bookId);
  unwrap(
    await supabase
      .from("reading_books")
      .update({ status: "reading", started_at: book?.startedAt ?? todayISO() })
      .eq("id", bookId)
      .select()
      .single(),
  );
  await invalidate();
}

export async function pauseBook(bookId: string) {
  unwrap(
    await supabase
      .from("reading_books")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", bookId)
      .select()
      .single(),
  );
  await invalidate();
}

export async function resumeBook(bookId: string, opts: { recalcPlan: boolean }) {
  if (opts.recalcPlan) {
    const activePlan = snapshot().plans.find((p) => p.bookId === bookId && p.active);
    if (activePlan)
      await supabase.from("reading_plans").update({ active: false }).eq("id", activePlan.id);
  }
  unwrap(
    await supabase
      .from("reading_books")
      .update({ status: "reading", paused_at: null })
      .eq("id", bookId)
      .select()
      .single(),
  );
  await invalidate();
}

export async function completeBook(
  bookId: string,
  extra?: { rating?: number; mainTakeaway?: string; personalReflection?: string },
) {
  unwrap(
    await supabase
      .from("reading_books")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rating: extra?.rating,
        main_takeaway: extra?.mainTakeaway,
        personal_reflection: extra?.personalReflection,
      })
      .eq("id", bookId)
      .select()
      .single(),
  );
  await invalidate();
}

/** Só remove livros que nunca viraram leitura de fato (quero ler) — sem histórico pra perder.
 * Planos/rotinas do livro cascateiam no banco; as Routine do núcleo são removidas explicitamente. */
export async function removeBook(bookId: string) {
  const routine = routineFor(snapshot().routines, bookId);
  if (routine) await Promise.all(routine.goalsRoutineIds.map((gid) => removeRoutine(gid)));
  await supabase.from("reading_books").delete().eq("id", bookId);
  await invalidate();
}

export type UpdateProgressResult = {
  ok: boolean;
  needsConfirmation?: boolean;
  error?: string;
  completed?: boolean;
};

export async function updateProgress(
  bookId: string,
  newValue: number,
  opts?: { confirm?: boolean },
): Promise<UpdateProgressResult> {
  const state = snapshot();
  const book = state.books.find((b) => b.id === bookId);
  if (!book) return { ok: false, error: "livro não encontrado" };
  const current =
    book.progressMode === "pages"
      ? (book.currentPage ?? 0)
      : book.progressMode === "percentage"
        ? (book.currentPercentage ?? 0)
        : (book.currentSeconds ?? 0);
  const total =
    book.progressMode === "pages"
      ? book.totalPages
      : book.progressMode === "percentage"
        ? 100
        : book.totalSeconds;
  if (newValue < 0) return { ok: false, error: "não pode ser menor que zero" };
  if (total !== undefined && newValue > total)
    return { ok: false, error: "não pode passar do total" };
  if (newValue < current && !opts?.confirm) return { ok: false, needsConfirmation: true };

  const userId = await ensureSession();
  const delta = newValue - current;
  const iso = todayISO();
  const field =
    book.progressMode === "pages"
      ? "current_page"
      : book.progressMode === "percentage"
        ? "current_percentage"
        : "current_seconds";
  await supabase
    .from("reading_books")
    .update({ [field]: newValue })
    .eq("id", bookId);
  if (delta > 0) {
    const plan = planFor(state.plans, bookId);
    const routine = routineFor(state.routines, bookId);
    const updatedBook = {
      ...book,
      [field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]: newValue,
    } as Book;
    await bumpDailyTargetCompleted(userId, bookId, iso, delta, updatedBook, plan, routine);
    await recordActivity(iso);
  }
  await invalidate();
  return {
    ok: true,
    completed: isBookComplete({
      ...book,
      currentPage: newValue,
      currentPercentage: newValue,
      currentSeconds: newValue,
    } as Book),
  };
}

// ---------------------------------------------------------------------------
// Ações — sessões
// ---------------------------------------------------------------------------
export type StartSessionResult = { ok: boolean; conflictSessionId?: string; sessionId?: string };

export async function startSession(bookId: string): Promise<StartSessionResult> {
  const state = snapshot();
  const existing = activeSession(state.sessions);
  if (existing && existing.bookId !== bookId) return { ok: false, conflictSessionId: existing.id };
  if (existing && existing.bookId === bookId) return { ok: true, sessionId: existing.id };

  const userId = await ensureSession();
  const book = state.books.find((b) => b.id === bookId);
  const row = unwrap<{ id: string }>(
    await supabase
      .from("reading_sessions")
      .insert({
        user_id: userId,
        book_id: bookId,
        started_at: new Date().toISOString(),
        paused_duration_seconds: 0,
        start_page: book?.progressMode === "pages" ? (book.currentPage ?? 0) : undefined,
        start_percentage:
          book?.progressMode === "percentage" ? (book.currentPercentage ?? 0) : undefined,
        start_progress_seconds:
          book?.progressMode === "time" ? (book.currentSeconds ?? 0) : undefined,
        status: "active",
      })
      .select()
      .single(),
  );
  await invalidate();
  return { ok: true, sessionId: row.id };
}

export async function pauseSession(sessionId: string) {
  const session = snapshot().sessions.find((s) => s.id === sessionId);
  if (!session || session.pausedSince) return;
  unwrap(
    await supabase
      .from("reading_sessions")
      .update({ paused_since: new Date().toISOString() })
      .eq("id", sessionId)
      .select()
      .single(),
  );
  await invalidate();
}

export async function resumeSession(sessionId: string) {
  const session = snapshot().sessions.find((s) => s.id === sessionId);
  if (!session || !session.pausedSince) return;
  const extra = Math.max(0, (Date.now() - new Date(session.pausedSince).getTime()) / 1000);
  unwrap(
    await supabase
      .from("reading_sessions")
      .update({
        paused_duration_seconds: session.pausedDurationSeconds + extra,
        paused_since: null,
      })
      .eq("id", sessionId)
      .select()
      .single(),
  );
  await invalidate();
}

export type FinishSessionResult = {
  ok: boolean;
  completed?: boolean;
  pagesOrUnitsRead?: number;
  durationSeconds?: number;
  metTarget?: boolean;
};

export async function finishSession(
  sessionId: string,
  endingValue: number,
): Promise<FinishSessionResult> {
  const state = snapshot();
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { ok: false };
  const book = state.books.find((b) => b.id === session.bookId);
  if (!book) return { ok: false };

  const userId = await ensureSession();
  const startValue =
    book.progressMode === "pages"
      ? (session.startPage ?? 0)
      : book.progressMode === "percentage"
        ? (session.startPercentage ?? 0)
        : (session.startProgressSeconds ?? 0);
  const safeEndingValue = Math.max(startValue, endingValue);
  const progress = calculateSessionProgress(book, startValue, safeEndingValue);
  const durationSeconds = sessionElapsedSeconds(session);
  const iso = todayISO();
  const endedAt = new Date().toISOString();

  await supabase
    .from("reading_sessions")
    .update({
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      status: "completed",
      end_page: book.progressMode === "pages" ? safeEndingValue : undefined,
      end_percentage: book.progressMode === "percentage" ? safeEndingValue : undefined,
      end_progress_seconds: book.progressMode === "time" ? safeEndingValue : undefined,
      pages_read: progress.pagesRead,
      percentage_read: progress.percentageRead,
      progress_seconds: progress.progressSeconds,
    })
    .eq("id", sessionId);

  const field =
    book.progressMode === "pages"
      ? "current_page"
      : book.progressMode === "percentage"
        ? "current_percentage"
        : "current_seconds";
  await supabase
    .from("reading_books")
    .update({ [field]: safeEndingValue })
    .eq("id", book.id);

  const delta = safeEndingValue - startValue;
  let metTarget = false;
  if (delta > 0) {
    const plan = planFor(state.plans, book.id);
    const routine = routineFor(state.routines, book.id);
    const updatedBook = {
      ...book,
      [field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]: safeEndingValue,
    } as Book;
    await bumpDailyTargetCompleted(userId, book.id, iso, delta, updatedBook, plan, routine);
    await recordActivity(iso);
    const targetRow =
      (snapshot().dailyTargets.find((t) => t.bookId === book.id && t.date === iso)
        ?.completedAmount ?? 0) + delta;
    const plannedRow = snapshot().dailyTargets.find(
      (t) => t.bookId === book.id && t.date === iso,
    )?.plannedAmount;
    metTarget = plannedRow !== undefined && targetRow >= plannedRow;
  }
  await invalidate();

  return {
    ok: true,
    completed: isBookComplete({
      ...book,
      currentPage: safeEndingValue,
      currentPercentage: safeEndingValue,
      currentSeconds: safeEndingValue,
    } as Book),
    pagesOrUnitsRead:
      progress.pagesRead ?? progress.percentageRead ?? progress.progressSeconds ?? 0,
    durationSeconds,
    metTarget,
  };
}

// ---------------------------------------------------------------------------
// Ações — notas (frase/insight/nota)
// ---------------------------------------------------------------------------
export async function addNote(input: {
  bookId: string;
  sessionId?: string;
  type: ReadingNoteType;
  content: string;
  tags?: string[];
  pageNumber?: number;
  percentage?: number;
  timestampSeconds?: number;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("reading_notes")
      .insert({
        user_id: userId,
        book_id: input.bookId,
        session_id: input.sessionId,
        type: input.type,
        content: input.content.trim(),
        tags: input.tags ?? [],
        page_number: input.pageNumber,
        percentage: input.percentage,
        timestamp_seconds: input.timestampSeconds,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function markResurfaced(noteId: string) {
  const note = snapshot().notes.find((n) => n.id === noteId);
  unwrap(
    await supabase
      .from("reading_notes")
      .update({
        last_resurfaced_at: new Date().toISOString(),
        resurface_count: (note?.resurfaceCount ?? 0) + 1,
      })
      .eq("id", noteId)
      .select()
      .single(),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — plano e rotina
// ---------------------------------------------------------------------------
export async function setReadingPlan(
  bookId: string,
  input: { type: ReadingPlanType; deadline?: string; targetAmount?: number },
) {
  const state = snapshot();
  const userId = await ensureSession();
  const book = state.books.find((b) => b.id === bookId);
  const unit = book ? targetUnitForBook(book) : "pages";
  const activePlan = state.plans.find((p) => p.bookId === bookId && p.active);
  if (activePlan)
    await supabase.from("reading_plans").update({ active: false }).eq("id", activePlan.id);
  unwrap(
    await supabase
      .from("reading_plans")
      .insert({
        user_id: userId,
        book_id: bookId,
        type: input.type,
        deadline: input.type === "deadline" ? input.deadline : undefined,
        target_pages:
          input.type === "daily_target" && unit === "pages" ? input.targetAmount : undefined,
        target_percentage:
          input.type === "daily_target" && unit === "percentage" ? input.targetAmount : undefined,
        target_seconds:
          input.type === "daily_target" && unit === "seconds" ? input.targetAmount : undefined,
        active: true,
      })
      .select()
      .single(),
  );
  await invalidate();
}

/** Cria/edita a rotina de leitura do livro — recria as Routine do goals-store sem duplicar. */
export async function setReadingRoutine(
  bookId: string,
  input: { weekdays: number[]; time: string; desiredDurationMinutes?: number },
) {
  const state = snapshot();
  const userId = await ensureSession();
  const book = state.books.find((b) => b.id === bookId);
  const existing = routineFor(state.routines, bookId);
  if (existing) {
    await Promise.all(existing.goalsRoutineIds.map((gid) => removeRoutine(gid)));
    await supabase.from("reading_routines").update({ active: false }).eq("id", existing.id);
  }
  const goalsRoutineIds = await Promise.all(
    input.weekdays.map((weekday) =>
      createRoutine({
        category: "leitura",
        title: book ? `Leitura — ${book.title}` : "Leitura",
        weekday,
        time: input.time,
      }),
    ),
  );
  const row = unwrap<{ id: string }>(
    await supabase
      .from("reading_routines")
      .insert({
        user_id: userId,
        book_id: bookId,
        time: input.time,
        desired_duration_minutes: input.desiredDurationMinutes,
        active: true,
      })
      .select()
      .single(),
  );
  await Promise.all(
    goalsRoutineIds.map((rid, i) =>
      supabase.from("routine_links").insert({
        user_id: userId,
        source_type: "reading_routine",
        source_id: row.id,
        weekday: input.weekdays[i],
        core_routine_id: rid,
      }),
    ),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — ajuste de meta não cumprida
// ---------------------------------------------------------------------------
/** Materializa (sem duplicar) as linhas dos últimos dias planejados sem registro, pra detectar déficits ao abrir o módulo. */
export async function checkForMissedTargets() {
  const state = snapshot();
  const userId = await ensureSession();
  const iso = todayISO();
  const toInsert: Row[] = [];
  for (const book of state.books.filter((b) => b.status === "reading")) {
    const plan = planFor(state.plans, book.id);
    const routine = routineFor(state.routines, book.id);
    if (!plan || !routine) continue;
    const lookbackStart = toISODate(addDays(new Date(), -14));
    const days = plannedDaysBetween(
      routine,
      lookbackStart,
      toISODate(addDays(new Date(), -1)),
    ).filter((d) => d < iso);
    for (const date of days) {
      const has = state.dailyTargets.some((t) => t.bookId === book.id && t.date === date);
      if (has) continue;
      const computed = computePlanDailyAmount(book, plan, routine);
      toInsert.push({
        user_id: userId,
        book_id: book.id,
        date,
        planned_amount: computed.value,
        completed_amount: 0,
        unit: computed.unit,
        adjustment_status: "none",
      });
    }
  }
  if (toInsert.length > 0) {
    await supabase.from("reading_daily_targets").upsert(toInsert, { onConflict: "book_id,date" });
    await invalidate();
  }
}

export async function redistributeMissedTarget(dailyTargetId: string) {
  const state = snapshot();
  const target = state.dailyTargets.find((t) => t.id === dailyTargetId);
  if (!target) return;
  const userId = await ensureSession();
  const missed = target.plannedAmount - target.completedAmount;
  if (missed <= 0) {
    await supabase
      .from("reading_daily_targets")
      .update({ adjustment_status: "redistributed" })
      .eq("id", dailyTargetId);
    await invalidate();
    return;
  }
  const book = state.books.find((b) => b.id === target.bookId);
  const plan = planFor(state.plans, target.bookId);
  const routine = routineFor(state.routines, target.bookId);
  if (!book || !plan || !routine) {
    await supabase
      .from("reading_daily_targets")
      .update({ adjustment_status: "redistributed" })
      .eq("id", dailyTargetId);
    await invalidate();
    return;
  }
  const horizonEnd = plan.deadline ?? toISODate(addDays(new Date(), 30));
  const days = plannedDaysBetween(routine, toISODate(addDays(new Date(), 1)), horizonEnd);
  if (days.length > 0) {
    const share = Math.floor(missed / days.length);
    let remainder = missed - share * days.length;
    for (const date of days) {
      const add = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      if (add <= 0) continue;
      const existing = snapshot().dailyTargets.find((t) => t.bookId === book.id && t.date === date);
      if (existing) {
        await supabase
          .from("reading_daily_targets")
          .update({ planned_amount: existing.plannedAmount + add })
          .eq("id", existing.id);
      } else {
        const base = computePlanDailyAmount(book, plan, routine);
        await supabase.from("reading_daily_targets").upsert(
          {
            user_id: userId,
            book_id: book.id,
            date,
            planned_amount: base.value + add,
            completed_amount: 0,
            unit: base.unit,
            adjustment_status: "none",
          },
          { onConflict: "book_id,date" },
        );
      }
    }
  }
  await supabase
    .from("reading_daily_targets")
    .update({ adjustment_status: "redistributed" })
    .eq("id", dailyTargetId);
  await invalidate();
}

export async function moveMissedTarget(dailyTargetId: string, targetDate: string) {
  const state = snapshot();
  const target = state.dailyTargets.find((t) => t.id === dailyTargetId);
  if (!target) return;
  const userId = await ensureSession();
  const missed = Math.max(0, target.plannedAmount - target.completedAmount);
  if (missed > 0) {
    const book = state.books.find((b) => b.id === target.bookId);
    const plan = planFor(state.plans, target.bookId);
    const routine = routineFor(state.routines, target.bookId);
    const existing = state.dailyTargets.find(
      (t) => t.bookId === target.bookId && t.date === targetDate,
    );
    if (existing) {
      await supabase
        .from("reading_daily_targets")
        .update({ planned_amount: existing.plannedAmount + missed })
        .eq("id", existing.id);
    } else if (book && plan && routine) {
      const base = computePlanDailyAmount(book, plan, routine);
      await supabase.from("reading_daily_targets").upsert(
        {
          user_id: userId,
          book_id: book.id,
          date: targetDate,
          planned_amount: base.value + missed,
          completed_amount: 0,
          unit: base.unit,
          adjustment_status: "none",
        },
        { onConflict: "book_id,date" },
      );
    }
  }
  await supabase
    .from("reading_daily_targets")
    .update({ adjustment_status: "moved" })
    .eq("id", dailyTargetId);
  await invalidate();
}

export async function keepMissedTarget(dailyTargetId: string) {
  await supabase
    .from("reading_daily_targets")
    .update({ adjustment_status: "kept" })
    .eq("id", dailyTargetId);
  await invalidate();
}
