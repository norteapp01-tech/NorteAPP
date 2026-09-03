import { useSyncExternalStore } from "react";
import { toISODate, todayISO, addDays, createRoutine, removeRoutine } from "./goals-store";
import type { SearchBookResult } from "./book-search-service";

// ---------------------------------------------------------------------------
// Central de leitura — domínio auto-contido, mesmo padrão reativo dos outros
// stores (goals-store.ts, workout-store.ts). A integração com Agenda/Rotina
// reaproveita createRoutine/removeRoutine do goals-store, sem tocar nele.
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
  selectedReadingBookId: string | null;
};

let seq = 0;
function genId(prefix: string) {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Helpers puros de formatação/cálculo
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
// Seletores
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
// Seed — ecoa o que já existia como ilustração (Sapiens em andamento), agora
// como dado real de verdade. Não é "migração": não havia dado real antes.
// ---------------------------------------------------------------------------
function buildSeedState(): State {
  const now = new Date();
  const bookId = "bk-sapiens";
  const books: Book[] = [
    {
      id: bookId,
      title: "Sapiens: Uma Breve História da Humanidade",
      authors: ["Yuval Noah Harari"],
      coverUrl: undefined,
      format: "physical",
      progressMode: "pages",
      status: "reading",
      totalPages: 512,
      currentPage: 164,
      metadataProvider: "manual",
      startedAt: toISODate(addDays(now, -21)),
      createdAt: toISODate(addDays(now, -21)),
      updatedAt: toISODate(addDays(now, -1)),
    },
  ];

  const plans: ReadingPlan[] = [
    {
      id: genId("rpl"),
      bookId,
      type: "deadline",
      deadline: toISODate(addDays(now, 40)),
      active: true,
      createdAt: toISODate(addDays(now, -21)),
      updatedAt: toISODate(addDays(now, -21)),
    },
  ];

  const routines: ReadingRoutine[] = [
    {
      id: genId("rr"),
      bookId,
      weekdays: [1, 2, 3, 4, 5],
      time: "21:00",
      desiredDurationMinutes: 20,
      active: true,
      goalsRoutineIds: [],
    },
  ];

  const sessions: ReadingSession[] = [];
  const notes: ReadingNote[] = [];
  const dailyTargets: ReadingDailyTarget[] = [];
  const activityDates: string[] = [];

  // Cobre todo dia de semana (rotina é seg-sex) dentro da janela de 14 dias que
  // checkForMissedTargets olha pra trás — sem isso, dias "não registrados" no seed
  // apareceriam como meta não cumprida em massa assim que o app abre.
  const seedDays: number[] = [];
  for (let offset = 13; offset >= 1; offset--) {
    const d = addDays(now, -offset);
    if (d.getDay() >= 1 && d.getDay() <= 5) seedDays.push(offset);
  }
  let page = 40;
  for (const offset of [...seedDays].reverse()) {
    const date = toISODate(addDays(now, -offset));
    // Um único dia fica deliberadamente abaixo da meta, pra demonstrar o ajuste sem
    // encher o seed de dias "perdidos" — os demais cumprem a meta de 12 páginas.
    const pagesRead = offset === 4 ? 7 : 12;
    const startPage = page;
    page += pagesRead;
    const startedAt = new Date(addDays(now, -offset));
    startedAt.setHours(21, 0, 0, 0);
    const endedAt = new Date(startedAt.getTime() + 22 * 60 * 1000);
    sessions.push({
      id: genId("rs"),
      bookId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      pausedDurationSeconds: 0,
      durationSeconds: 22 * 60,
      startPage,
      endPage: page,
      pagesRead,
      status: "completed",
    });
    dailyTargets.push({
      id: genId("drt"),
      bookId,
      date,
      plannedAmount: 12,
      completedAmount: pagesRead,
      unit: "pages",
      adjustmentStatus: "none",
    });
    activityDates.push(date);
  }

  notes.push(
    {
      id: genId("rn"),
      bookId,
      type: "insight",
      content:
        "Dinheiro é a maior ficção compartilhada — só funciona porque todo mundo acredita nela ao mesmo tempo.",
      tags: ["economia", "cooperação"],
      pageNumber: 132,
      createdAt: new Date(addDays(now, -16)).toISOString(),
      updatedAt: new Date(addDays(now, -16)).toISOString(),
      resurfaceCount: 0,
    },
    {
      id: genId("rn"),
      bookId,
      type: "quote",
      content:
        "Capítulos sobre a revolução cognitiva mostram como a linguagem permitiu fofoca — e a fofoca permitiu cooperação em massa.",
      tags: ["linguagem"],
      pageNumber: 58,
      createdAt: new Date(addDays(now, -18)).toISOString(),
      updatedAt: new Date(addDays(now, -18)).toISOString(),
      resurfaceCount: 0,
    },
  );

  return {
    books,
    sessions,
    notes,
    plans,
    routines,
    dailyTargets,
    activityDates,
    selectedReadingBookId: bookId,
  };
}

// ---------------------------------------------------------------------------
// Store reativo
// ---------------------------------------------------------------------------
let state: State = buildSeedState();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => state;

function set(updater: (s: State) => State) {
  state = updater(state);
  emit();
}

export function useReadingStore<T>(selector: (s: State) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector(snap);
}

function recordActivity(s: State, date = todayISO()): State {
  if (s.activityDates.includes(date)) return s;
  return { ...s, activityDates: [...s.activityDates, date] };
}

function bumpDailyTargetCompleted(
  s: State,
  bookId: string,
  date: string,
  delta: number,
  book: Book,
  plan: ReadingPlan | undefined,
  routine: ReadingRoutine | undefined,
): ReadingDailyTarget[] {
  const idx = s.dailyTargets.findIndex((t) => t.bookId === bookId && t.date === date);
  if (idx >= 0) {
    return s.dailyTargets.map((t, i) =>
      i === idx ? { ...t, completedAmount: t.completedAmount + delta } : t,
    );
  }
  if (!plan || !routine) return s.dailyTargets;
  const computed = computePlanDailyAmount(book, plan, routine);
  return [
    ...s.dailyTargets,
    {
      id: genId("drt"),
      bookId,
      date,
      plannedAmount: computed.value,
      completedAmount: delta,
      unit: computed.unit,
      adjustmentStatus: "none",
    },
  ];
}

// ---------------------------------------------------------------------------
// Ações — livros
// ---------------------------------------------------------------------------
function defaultProgressMode(format: BookFormat): ProgressMode {
  if (format === "audiobook") return "time";
  return "pages";
}

export function addBookFromSearch(
  result: SearchBookResult,
  opts: {
    format: BookFormat;
    status: "reading" | "want_to_read";
    progressMode?: ProgressMode;
    totalPages?: number;
    totalSeconds?: number;
  },
): string {
  const id = genId("bk");
  const now = new Date().toISOString();
  const mode = opts.progressMode ?? defaultProgressMode(opts.format);
  const book: Book = {
    id,
    title: result.title,
    authors: result.authors,
    coverUrl: result.coverUrl,
    isbn: result.isbn,
    externalId: result.externalId,
    metadataProvider: result.provider,
    format: opts.format,
    progressMode: mode,
    status: opts.status,
    totalPages: mode === "pages" ? (opts.totalPages ?? result.pageCount) : undefined,
    totalSeconds: mode === "time" ? opts.totalSeconds : undefined,
    currentPage: mode === "pages" ? 0 : undefined,
    currentPercentage: mode === "percentage" ? 0 : undefined,
    currentSeconds: mode === "time" ? 0 : undefined,
    startedAt: opts.status === "reading" ? todayISO() : undefined,
    createdAt: now,
    updatedAt: now,
  };
  set((s) => ({
    ...s,
    books: [book, ...s.books],
    selectedReadingBookId: opts.status === "reading" ? id : s.selectedReadingBookId,
  }));
  return id;
}

export function addBookManual(input: {
  title: string;
  authors?: string[];
  format: BookFormat;
  status: "reading" | "want_to_read";
  progressMode?: ProgressMode;
  coverImage?: string;
  totalPages?: number;
  totalSeconds?: number;
}): string {
  const id = genId("bk");
  const now = new Date().toISOString();
  const mode = input.progressMode ?? defaultProgressMode(input.format);
  const book: Book = {
    id,
    title: input.title.trim(),
    authors: input.authors ?? [],
    coverImage: input.coverImage,
    metadataProvider: "manual",
    format: input.format,
    progressMode: mode,
    status: input.status,
    totalPages: mode === "pages" ? input.totalPages : undefined,
    totalSeconds: mode === "time" ? input.totalSeconds : undefined,
    currentPage: mode === "pages" ? 0 : undefined,
    currentPercentage: mode === "percentage" ? 0 : undefined,
    currentSeconds: mode === "time" ? 0 : undefined,
    startedAt: input.status === "reading" ? todayISO() : undefined,
    createdAt: now,
    updatedAt: now,
  };
  set((s) => ({
    ...s,
    books: [book, ...s.books],
    selectedReadingBookId: input.status === "reading" ? id : s.selectedReadingBookId,
  }));
  return id;
}

/** "+ Quero ler" — só o nome, extremamente rápido. */
export function quickAddWantToRead(title: string): string {
  const id = genId("bk");
  const now = new Date().toISOString();
  const book: Book = {
    id,
    title: title.trim(),
    authors: [],
    format: "physical",
    progressMode: "pages",
    status: "want_to_read",
    metadataProvider: "manual",
    createdAt: now,
    updatedAt: now,
  };
  set((s) => ({ ...s, books: [book, ...s.books] }));
  return id;
}

export type UpdateBookResult = { ok: boolean; error?: string };

export function updateBook(
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
): UpdateBookResult {
  const book = state.books.find((b) => b.id === id);
  if (!book) return { ok: false, error: "livro não encontrado" };
  if (patch.totalPages !== undefined && (book.currentPage ?? 0) > patch.totalPages) {
    return { ok: false, error: "o total não pode ser menor que o progresso atual" };
  }
  if (patch.totalSeconds !== undefined && (book.currentSeconds ?? 0) > patch.totalSeconds) {
    return { ok: false, error: "o total não pode ser menor que o progresso atual" };
  }
  set((s) => ({
    ...s,
    books: s.books.map((b) =>
      b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b,
    ),
  }));
  return { ok: true };
}

export function startReading(bookId: string) {
  set((s) => ({
    ...s,
    books: s.books.map((b) =>
      b.id === bookId
        ? {
            ...b,
            status: "reading",
            startedAt: b.startedAt ?? todayISO(),
            updatedAt: new Date().toISOString(),
          }
        : b,
    ),
    selectedReadingBookId: bookId,
  }));
}

export function pauseBook(bookId: string) {
  set((s) => ({
    ...s,
    books: s.books.map((b) =>
      b.id === bookId
        ? {
            ...b,
            status: "paused",
            pausedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : b,
    ),
    selectedReadingBookId:
      s.selectedReadingBookId === bookId
        ? (s.books.find((b) => b.status === "reading" && b.id !== bookId)?.id ?? null)
        : s.selectedReadingBookId,
  }));
}

export function resumeBook(bookId: string, opts: { recalcPlan: boolean }) {
  set((s) => {
    let plans = s.plans;
    if (opts.recalcPlan) {
      plans = s.plans.map((p) => (p.bookId === bookId && p.active ? { ...p, active: false } : p));
    }
    return {
      ...s,
      plans,
      books: s.books.map((b) =>
        b.id === bookId
          ? { ...b, status: "reading", pausedAt: undefined, updatedAt: new Date().toISOString() }
          : b,
      ),
      selectedReadingBookId: bookId,
    };
  });
}

export function completeBook(
  bookId: string,
  extra?: { rating?: number; mainTakeaway?: string; personalReflection?: string },
) {
  set((s) => ({
    ...s,
    books: s.books.map((b) =>
      b.id === bookId
        ? {
            ...b,
            status: "completed",
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...extra,
          }
        : b,
    ),
    selectedReadingBookId:
      s.selectedReadingBookId === bookId
        ? (s.books.find((b) => b.status === "reading" && b.id !== bookId)?.id ?? null)
        : s.selectedReadingBookId,
  }));
}

/** Só remove livros que nunca viraram leitura de fato (quero ler) — sem histórico pra perder. */
export async function removeBook(bookId: string) {
  const routine = routineFor(state.routines, bookId);
  if (routine) await Promise.all(routine.goalsRoutineIds.map((gid) => removeRoutine(gid)));
  set((s) => ({
    ...s,
    books: s.books.filter((b) => b.id !== bookId),
    plans: s.plans.filter((p) => p.bookId !== bookId),
    routines: s.routines.filter((r) => r.bookId !== bookId),
    selectedReadingBookId: s.selectedReadingBookId === bookId ? null : s.selectedReadingBookId,
  }));
}

export function setSelectedReadingBookId(id: string | null) {
  set((s) => ({ ...s, selectedReadingBookId: id }));
}

export type UpdateProgressResult = {
  ok: boolean;
  needsConfirmation?: boolean;
  error?: string;
  completed?: boolean;
};

export function updateProgress(
  bookId: string,
  newValue: number,
  opts?: { confirm?: boolean },
): UpdateProgressResult {
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

  const delta = newValue - current;
  const iso = todayISO();
  set((s) => {
    const b = s.books.find((x) => x.id === bookId)!;
    const updatedBook: Book =
      b.progressMode === "pages"
        ? { ...b, currentPage: newValue, updatedAt: new Date().toISOString() }
        : b.progressMode === "percentage"
          ? { ...b, currentPercentage: newValue, updatedAt: new Date().toISOString() }
          : { ...b, currentSeconds: newValue, updatedAt: new Date().toISOString() };
    const plan = planFor(s.plans, bookId);
    const routine = routineFor(s.routines, bookId);
    const dailyTargets =
      delta > 0
        ? bumpDailyTargetCompleted(s, bookId, iso, delta, updatedBook, plan, routine)
        : s.dailyTargets;
    const next = {
      ...s,
      books: s.books.map((x) => (x.id === bookId ? updatedBook : x)),
      dailyTargets,
    };
    return delta > 0 ? recordActivity(next, iso) : next;
  });
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

export function startSession(bookId: string): StartSessionResult {
  const existing = activeSession(state.sessions);
  if (existing && existing.bookId !== bookId) return { ok: false, conflictSessionId: existing.id };
  if (existing && existing.bookId === bookId) return { ok: true, sessionId: existing.id };
  const book = state.books.find((b) => b.id === bookId);
  const id = genId("rs");
  const session: ReadingSession = {
    id,
    bookId,
    startedAt: new Date().toISOString(),
    pausedDurationSeconds: 0,
    startPage: book?.progressMode === "pages" ? (book.currentPage ?? 0) : undefined,
    startPercentage:
      book?.progressMode === "percentage" ? (book.currentPercentage ?? 0) : undefined,
    startProgressSeconds: book?.progressMode === "time" ? (book.currentSeconds ?? 0) : undefined,
    status: "active",
  };
  set((s) => ({ ...s, sessions: [session, ...s.sessions] }));
  return { ok: true, sessionId: id };
}

export function pauseSession(sessionId: string) {
  set((s) => ({
    ...s,
    sessions: s.sessions.map((sess) =>
      sess.id === sessionId && !sess.pausedSince
        ? { ...sess, pausedSince: new Date().toISOString() }
        : sess,
    ),
  }));
}

export function resumeSession(sessionId: string) {
  set((s) => ({
    ...s,
    sessions: s.sessions.map((sess) => {
      if (sess.id !== sessionId || !sess.pausedSince) return sess;
      const extra = Math.max(0, (Date.now() - new Date(sess.pausedSince).getTime()) / 1000);
      return {
        ...sess,
        pausedDurationSeconds: sess.pausedDurationSeconds + extra,
        pausedSince: undefined,
      };
    }),
  }));
}

export type FinishSessionResult = {
  ok: boolean;
  completed?: boolean;
  pagesOrUnitsRead?: number;
  durationSeconds?: number;
  metTarget?: boolean;
};

export function finishSession(sessionId: string, endingValue: number): FinishSessionResult {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { ok: false };
  const book = state.books.find((b) => b.id === session.bookId);
  if (!book) return { ok: false };

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

  let metTarget = false;
  set((s) => {
    const endedAt = new Date().toISOString();
    const updatedSession: ReadingSession = {
      ...session,
      endedAt,
      durationSeconds,
      status: "completed",
      endPage: book.progressMode === "pages" ? safeEndingValue : undefined,
      endPercentage: book.progressMode === "percentage" ? safeEndingValue : undefined,
      endProgressSeconds: book.progressMode === "time" ? safeEndingValue : undefined,
      ...progress,
    };
    const updatedBook: Book =
      book.progressMode === "pages"
        ? { ...book, currentPage: safeEndingValue, updatedAt: endedAt }
        : book.progressMode === "percentage"
          ? { ...book, currentPercentage: safeEndingValue, updatedAt: endedAt }
          : { ...book, currentSeconds: safeEndingValue, updatedAt: endedAt };
    const delta = safeEndingValue - startValue;
    const plan = planFor(s.plans, book.id);
    const routine = routineFor(s.routines, book.id);
    const dailyTargets =
      delta > 0
        ? bumpDailyTargetCompleted(s, book.id, iso, delta, updatedBook, plan, routine)
        : s.dailyTargets;
    const targetRow = dailyTargets.find((t) => t.bookId === book.id && t.date === iso);
    metTarget = !!targetRow && targetRow.completedAmount >= targetRow.plannedAmount;
    const next: State = {
      ...s,
      sessions: s.sessions.map((x) => (x.id === sessionId ? updatedSession : x)),
      books: s.books.map((x) => (x.id === book.id ? updatedBook : x)),
      dailyTargets,
    };
    return recordActivity(next, iso);
  });

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
export function addNote(input: {
  bookId: string;
  sessionId?: string;
  type: ReadingNoteType;
  content: string;
  tags?: string[];
  pageNumber?: number;
  percentage?: number;
  timestampSeconds?: number;
}): string {
  const id = genId("rn");
  const now = new Date().toISOString();
  const note: ReadingNote = {
    id,
    bookId: input.bookId,
    sessionId: input.sessionId,
    type: input.type,
    content: input.content.trim(),
    tags: input.tags ?? [],
    pageNumber: input.pageNumber,
    percentage: input.percentage,
    timestampSeconds: input.timestampSeconds,
    createdAt: now,
    updatedAt: now,
    resurfaceCount: 0,
  };
  set((s) => ({ ...s, notes: [note, ...s.notes] }));
  return id;
}

export function markResurfaced(noteId: string) {
  set((s) => ({
    ...s,
    notes: s.notes.map((n) =>
      n.id === noteId
        ? { ...n, lastResurfacedAt: new Date().toISOString(), resurfaceCount: n.resurfaceCount + 1 }
        : n,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Ações — plano e rotina
// ---------------------------------------------------------------------------
export function setReadingPlan(
  bookId: string,
  input: { type: ReadingPlanType; deadline?: string; targetAmount?: number },
) {
  const book = state.books.find((b) => b.id === bookId);
  const unit = book ? targetUnitForBook(book) : "pages";
  set((s) => {
    const plans = s.plans.map((p) =>
      p.bookId === bookId && p.active ? { ...p, active: false } : p,
    );
    const now = new Date().toISOString();
    const plan: ReadingPlan = {
      id: genId("rpl"),
      bookId,
      type: input.type,
      deadline: input.type === "deadline" ? input.deadline : undefined,
      targetPages:
        input.type === "daily_target" && unit === "pages" ? input.targetAmount : undefined,
      targetPercentage:
        input.type === "daily_target" && unit === "percentage" ? input.targetAmount : undefined,
      targetSeconds:
        input.type === "daily_target" && unit === "seconds" ? input.targetAmount : undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    return { ...s, plans: [...plans, plan] };
  });
}

/** Cria/edita a rotina de leitura do livro — recria as Routine do goals-store sem duplicar. */
export async function setReadingRoutine(
  bookId: string,
  input: { weekdays: number[]; time: string; desiredDurationMinutes?: number },
) {
  const book = state.books.find((b) => b.id === bookId);
  const existing = routineFor(state.routines, bookId);
  if (existing) {
    await Promise.all(existing.goalsRoutineIds.map((gid) => removeRoutine(gid)));
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
  set((s) => {
    const routines = s.routines.map((r) =>
      r.bookId === bookId && r.active ? { ...r, active: false } : r,
    );
    const routine: ReadingRoutine = {
      id: genId("rr"),
      bookId,
      weekdays: input.weekdays,
      time: input.time,
      desiredDurationMinutes: input.desiredDurationMinutes,
      active: true,
      goalsRoutineIds,
    };
    return { ...s, routines: [...routines, routine] };
  });
}

// ---------------------------------------------------------------------------
// Ações — ajuste de meta não cumprida
// ---------------------------------------------------------------------------
/** Materializa (sem duplicar) as linhas dos últimos dias planejados sem registro, pra detectar déficits ao abrir o módulo. */
export function checkForMissedTargets() {
  set((s) => {
    const dailyTargets = [...s.dailyTargets];
    const iso = todayISO();
    for (const book of s.books.filter((b) => b.status === "reading")) {
      const plan = planFor(s.plans, book.id);
      const routine = routineFor(s.routines, book.id);
      if (!plan || !routine) continue;
      const lookbackStart = toISODate(addDays(new Date(), -14));
      const days = plannedDaysBetween(
        routine,
        lookbackStart,
        toISODate(addDays(new Date(), -1)),
      ).filter((d) => d < iso);
      for (const date of days) {
        const has = dailyTargets.some((t) => t.bookId === book.id && t.date === date);
        if (has) continue;
        const computed = computePlanDailyAmount(book, plan, routine);
        dailyTargets.push({
          id: genId("drt"),
          bookId: book.id,
          date,
          plannedAmount: computed.value,
          completedAmount: 0,
          unit: computed.unit,
          adjustmentStatus: "none",
        });
      }
    }
    return { ...s, dailyTargets };
  });
}

export function redistributeMissedTarget(dailyTargetId: string) {
  set((s) => {
    const target = s.dailyTargets.find((t) => t.id === dailyTargetId);
    if (!target) return s;
    const missed = target.plannedAmount - target.completedAmount;
    const markResolved = (list: ReadingDailyTarget[]) =>
      list.map((t) =>
        t.id === dailyTargetId ? { ...t, adjustmentStatus: "redistributed" as const } : t,
      );
    if (missed <= 0) return { ...s, dailyTargets: markResolved(s.dailyTargets) };
    const book = s.books.find((b) => b.id === target.bookId);
    const plan = planFor(s.plans, target.bookId);
    const routine = routineFor(s.routines, target.bookId);
    if (!book || !plan || !routine) return { ...s, dailyTargets: markResolved(s.dailyTargets) };
    const horizonEnd = plan.deadline ?? toISODate(addDays(new Date(), 30));
    const days = plannedDaysBetween(routine, toISODate(addDays(new Date(), 1)), horizonEnd);
    if (days.length === 0) return { ...s, dailyTargets: markResolved(s.dailyTargets) };
    const share = Math.floor(missed / days.length);
    let remainder = missed - share * days.length;
    const dailyTargets = [...s.dailyTargets];
    for (const date of days) {
      const add = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      if (add <= 0) continue;
      const idx = dailyTargets.findIndex((t) => t.bookId === book.id && t.date === date);
      if (idx >= 0) {
        dailyTargets[idx] = {
          ...dailyTargets[idx],
          plannedAmount: dailyTargets[idx].plannedAmount + add,
        };
      } else {
        const base = computePlanDailyAmount(book, plan, routine);
        dailyTargets.push({
          id: genId("drt"),
          bookId: book.id,
          date,
          plannedAmount: base.value + add,
          completedAmount: 0,
          unit: base.unit,
          adjustmentStatus: "none",
        });
      }
    }
    return { ...s, dailyTargets: markResolved(dailyTargets) };
  });
}

export function moveMissedTarget(dailyTargetId: string, targetDate: string) {
  set((s) => {
    const target = s.dailyTargets.find((t) => t.id === dailyTargetId);
    if (!target) return s;
    const missed = Math.max(0, target.plannedAmount - target.completedAmount);
    const markResolved = (list: ReadingDailyTarget[]) =>
      list.map((t) => (t.id === dailyTargetId ? { ...t, adjustmentStatus: "moved" as const } : t));
    if (missed <= 0) return { ...s, dailyTargets: markResolved(s.dailyTargets) };
    const book = s.books.find((b) => b.id === target.bookId);
    const plan = planFor(s.plans, target.bookId);
    const routine = routineFor(s.routines, target.bookId);
    const dailyTargets = [...s.dailyTargets];
    const idx = dailyTargets.findIndex((t) => t.bookId === target.bookId && t.date === targetDate);
    if (idx >= 0) {
      dailyTargets[idx] = {
        ...dailyTargets[idx],
        plannedAmount: dailyTargets[idx].plannedAmount + missed,
      };
    } else if (book && plan && routine) {
      const base = computePlanDailyAmount(book, plan, routine);
      dailyTargets.push({
        id: genId("drt"),
        bookId: book.id,
        date: targetDate,
        plannedAmount: base.value + missed,
        completedAmount: 0,
        unit: base.unit,
        adjustmentStatus: "none",
      });
    }
    return { ...s, dailyTargets: markResolved(dailyTargets) };
  });
}

export function keepMissedTarget(dailyTargetId: string) {
  set((s) => ({
    ...s,
    dailyTargets: s.dailyTargets.map((t) =>
      t.id === dailyTargetId ? { ...t, adjustmentStatus: "kept" as const } : t,
    ),
  }));
}
