import { useSyncExternalStore } from "react";
import { toISODate, addDays, todayISO, createRoutine, removeRoutine } from "./goals-store";

/** Data que rege o momento espiritual — agenda se existir, senão o prazo (mesma regra do core). */
function relevantDate(e: { dueDate: string; agendaDate?: string }): string {
  return e.agendaDate ?? e.dueDate;
}

// ---------------------------------------------------------------------------
// Fé — "O Norte não mede o quanto você busca Deus. Ele ajuda você a abrir
// espaço para buscá-Lo." Nada aqui é streak, XP ou ranking — a única
// visualização de constância é o "Ritmo" (seção mais abaixo), sempre
// derivado dos registros reais, nunca um contador administrado à parte.
// ---------------------------------------------------------------------------

export type PrayerSubjectStatus = "em_oracao" | "quero_agradecer" | "encerrada";
export type PrayerSubject = {
  id: string;
  title: string;
  description: string;
  status: PrayerSubjectStatus;
  createdAt: string;
  updatedAt: string;
};
export type PrayerNote = { id: string; subjectId: string; text: string; createdAt: string };

export type Purpose = {
  id: string;
  title: string;
  intention: string;
  why?: string;
  startDate?: string;
  endDate?: string;
  spiritualActivityId?: string;
  archived: boolean;
  createdAt: string;
};

export type BibleReadingLog = {
  id: string;
  book: string;
  chapter: number;
  verseRange?: string;
  date: string;
  reflection?: string;
  createdAt: string;
};

export type ReadingFrequency = "none" | "2x" | "3x" | "5x" | "daily";

export type NotebookEntryType =
  "deus_falou" | "oracao" | "gratidao" | "versiculo" | "aprendizado" | "testemunho" | "livre";

export type NotebookEntry = {
  id: string;
  type: NotebookEntryType;
  content: string;
  verseReference?: string;
  verseText?: string;
  context?: string;
  createdAt: string;
  lastResurfacedAt?: string;
  resurfaceCount: number;
};

export type SpiritualActivityKind =
  "momento" | "oracao" | "leitura" | "culto" | "celula" | "discipulado" | "servico" | "proposito";

export type SpiritualActivity = {
  id: string;
  kind: SpiritualActivityKind;
  title: string;
  weekdays: number[];
  time: string;
  durationMinutes?: number;
  goalsRoutineIds: string[];
  purposeId?: string;
};

export const kindLabel: Record<SpiritualActivityKind, string> = {
  momento: "Momento com Deus",
  oracao: "Oração",
  leitura: "Leitura bíblica",
  culto: "Culto",
  celula: "Célula",
  discipulado: "Discipulado",
  servico: "Serviço",
  proposito: "Propósito",
};

/** 66 livros — dado de referência fixo (número de capítulos), não mock de conteúdo. */
export const BIBLE_BOOKS: { name: string; chapters: number }[] = [
  { name: "Gênesis", chapters: 50 },
  { name: "Êxodo", chapters: 40 },
  { name: "Levítico", chapters: 27 },
  { name: "Números", chapters: 36 },
  { name: "Deuteronômio", chapters: 34 },
  { name: "Josué", chapters: 24 },
  { name: "Juízes", chapters: 21 },
  { name: "Rute", chapters: 4 },
  { name: "1 Samuel", chapters: 31 },
  { name: "2 Samuel", chapters: 24 },
  { name: "1 Reis", chapters: 22 },
  { name: "2 Reis", chapters: 25 },
  { name: "1 Crônicas", chapters: 29 },
  { name: "2 Crônicas", chapters: 36 },
  { name: "Esdras", chapters: 10 },
  { name: "Neemias", chapters: 13 },
  { name: "Ester", chapters: 10 },
  { name: "Jó", chapters: 42 },
  { name: "Salmos", chapters: 150 },
  { name: "Provérbios", chapters: 31 },
  { name: "Eclesiastes", chapters: 12 },
  { name: "Cantares", chapters: 8 },
  { name: "Isaías", chapters: 66 },
  { name: "Jeremias", chapters: 52 },
  { name: "Lamentações", chapters: 5 },
  { name: "Ezequiel", chapters: 48 },
  { name: "Daniel", chapters: 12 },
  { name: "Oséias", chapters: 14 },
  { name: "Joel", chapters: 3 },
  { name: "Amós", chapters: 9 },
  { name: "Obadias", chapters: 1 },
  { name: "Jonas", chapters: 4 },
  { name: "Miquéias", chapters: 7 },
  { name: "Naum", chapters: 3 },
  { name: "Habacuque", chapters: 3 },
  { name: "Sofonias", chapters: 3 },
  { name: "Ageu", chapters: 2 },
  { name: "Zacarias", chapters: 14 },
  { name: "Malaquias", chapters: 4 },
  { name: "Mateus", chapters: 28 },
  { name: "Marcos", chapters: 16 },
  { name: "Lucas", chapters: 24 },
  { name: "João", chapters: 21 },
  { name: "Atos", chapters: 28 },
  { name: "Romanos", chapters: 16 },
  { name: "1 Coríntios", chapters: 16 },
  { name: "2 Coríntios", chapters: 13 },
  { name: "Gálatas", chapters: 6 },
  { name: "Efésios", chapters: 6 },
  { name: "Filipenses", chapters: 4 },
  { name: "Colossenses", chapters: 4 },
  { name: "1 Tessalonicenses", chapters: 5 },
  { name: "2 Tessalonicenses", chapters: 3 },
  { name: "1 Timóteo", chapters: 6 },
  { name: "2 Timóteo", chapters: 4 },
  { name: "Tito", chapters: 3 },
  { name: "Filemom", chapters: 1 },
  { name: "Hebreus", chapters: 13 },
  { name: "Tiago", chapters: 5 },
  { name: "1 Pedro", chapters: 5 },
  { name: "2 Pedro", chapters: 3 },
  { name: "1 João", chapters: 5 },
  { name: "2 João", chapters: 1 },
  { name: "3 João", chapters: 1 },
  { name: "Judas", chapters: 1 },
  { name: "Apocalipse", chapters: 22 },
];
export function chaptersOf(book: string): number | undefined {
  return BIBLE_BOOKS.find((b) => b.name === book)?.chapters;
}

type State = {
  prayerSubjects: PrayerSubject[];
  prayerNotes: PrayerNote[];
  purposes: Purpose[];
  bibleReadingLogs: BibleReadingLog[];
  readingFrequency: ReadingFrequency;
  notebookEntries: NotebookEntry[];
  spiritualActivities: SpiritualActivity[];
  prayerActivityDates: string[];
};

let seq = 0;
function genId(prefix: string) {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

// ---------------------------------------------------------------------------
// Seletores puros
// ---------------------------------------------------------------------------
export function currentBook(logs: BibleReadingLog[]): string | undefined {
  return [...logs].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  )[0]?.book;
}

export function progressForBook(
  book: string,
  logs: BibleReadingLog[],
): { chapter: number; total?: number; pct: number } {
  const bookLogs = logs.filter((l) => l.book === book);
  const chapter = bookLogs.length > 0 ? Math.max(...bookLogs.map((l) => l.chapter)) : 0;
  const total = chaptersOf(book);
  const pct = total ? Math.min(100, Math.round((chapter / total) * 100)) : 0;
  return { chapter, total, pct };
}

export function savedVerses(entries: NotebookEntry[]): NotebookEntry[] {
  return entries
    .filter((e) => e.type === "versiculo")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function notebookTimeline(entries: NotebookEntry[], query = ""): NotebookEntry[] {
  const q = query.trim().toLowerCase();
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!q) return sorted;
  return sorted.filter(
    (e) =>
      e.content.toLowerCase().includes(q) ||
      e.verseReference?.toLowerCase().includes(q) ||
      e.verseText?.toLowerCase().includes(q),
  );
}

function weekStartISO(date = new Date()): string {
  const day = date.getDay(); // 0=domingo
  const monday = addDays(date, day === 0 ? -6 : 1 - day);
  return toISODate(monday);
}

export type WeeklyRhythm = {
  oracao: string[];
  palavra: string[];
  comunhao: string[];
  reflexao: string[];
};

/** Nada de streak — só os dias distintos desta semana em que cada dimensão aconteceu. */
export function weeklyRhythm(
  state: State,
  executions: { dueDate: string; agendaDate?: string; status: string; routineId?: string }[],
): WeeklyRhythm {
  const start = weekStartISO();
  const today = todayISO();
  const inWeek = (d: string) => d >= start && d <= today;

  const activityIdsByKind = (kinds: SpiritualActivityKind[]) =>
    new Set(
      state.spiritualActivities
        .filter((a) => kinds.includes(a.kind))
        .flatMap((a) => a.goalsRoutineIds),
    );

  const completedDatesForKinds = (kinds: SpiritualActivityKind[]) => {
    const routineIds = activityIdsByKind(kinds);
    return executions
      .filter(
        (e) =>
          e.status === "concluida" &&
          e.routineId &&
          routineIds.has(e.routineId) &&
          inWeek(relevantDate(e)),
      )
      .map((e) => relevantDate(e));
  };

  const oracao = new Set([
    ...state.prayerActivityDates.filter(inWeek),
    ...completedDatesForKinds(["momento", "oracao"]),
  ]);
  const palavra = new Set([
    ...state.bibleReadingLogs.map((l) => l.date).filter(inWeek),
    ...completedDatesForKinds(["leitura"]),
  ]);
  const comunhao = new Set(completedDatesForKinds(["culto", "celula", "discipulado", "servico"]));
  const reflexao = new Set(
    state.notebookEntries.map((e) => e.createdAt.slice(0, 10)).filter(inWeek),
  );

  return {
    oracao: [...oracao].sort(),
    palavra: [...palavra].sort(),
    comunhao: [...comunhao].sort(),
    reflexao: [...reflexao].sort(),
  };
}

export function nextSpiritualMoment(
  activities: SpiritualActivity[],
  executions: {
    id: string;
    dueDate: string;
    agendaDate?: string;
    startTime?: string;
    status: string;
    routineId?: string;
    title: string;
  }[],
): { execution: (typeof executions)[number]; activity: SpiritualActivity } | null {
  const routineToActivity = new Map<string, SpiritualActivity>();
  for (const a of activities) for (const rid of a.goalsRoutineIds) routineToActivity.set(rid, a);

  const upcoming = executions
    .filter((e) => e.status === "planejada" && e.routineId && routineToActivity.has(e.routineId))
    .sort((a, b) =>
      (relevantDate(a) + (a.startTime ?? "")).localeCompare(relevantDate(b) + (b.startTime ?? "")),
    );
  const execution = upcoming[0];
  if (!execution) return null;
  const activity = routineToActivity.get(execution.routineId!);
  if (!activity) return null;
  return { execution, activity };
}

export function activePurpose(purposes: Purpose[]): Purpose | undefined {
  return [...purposes]
    .filter((p) => !p.archived)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function getResurfacingCandidate(entries: NotebookEntry[]): NotebookEntry | null {
  const cutoff = toISODate(addDays(new Date(), -7));
  const eligible = entries.filter((e) => e.createdAt.slice(0, 10) <= cutoff);
  if (eligible.length === 0) return null;
  const today = todayISO();
  const shownToday = eligible.find(
    (e) => e.lastResurfacedAt && e.lastResurfacedAt.slice(0, 10) === today,
  );
  if (shownToday) return shownToday;
  const neverShown = eligible.filter((e) => !e.lastResurfacedAt);
  if (neverShown.length > 0) return neverShown[0];
  return [...eligible].sort((a, b) =>
    (a.lastResurfacedAt as string).localeCompare(b.lastResurfacedAt as string),
  )[0];
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
function buildSeedState(): State {
  const now = new Date();

  const prayerSubjects: PrayerSubject[] = [
    {
      id: "ps-familia",
      title: "Família",
      description: "Saúde e proteção da minha família.",
      status: "em_oracao",
      createdAt: toISODate(addDays(now, -20)),
      updatedAt: toISODate(addDays(now, -2)),
    },
    {
      id: "ps-trabalho",
      title: "Trabalho",
      description: "Sabedoria para uma decisão profissional.",
      status: "em_oracao",
      createdAt: toISODate(addDays(now, -14)),
      updatedAt: toISODate(addDays(now, -5)),
    },
    {
      id: "ps-eu",
      title: "Eu",
      description: "Quero ter mais sabedoria nessa fase.",
      status: "quero_agradecer",
      createdAt: toISODate(addDays(now, -30)),
      updatedAt: toISODate(addDays(now, -1)),
    },
  ];

  const purposes: Purpose[] = [
    {
      id: "purp-constancia",
      title: "Constância com Deus",
      intention: "Separar espaço mesmo nos dias corridos.",
      why: "Tenho sentido falta de presença nos dias mais corridos.",
      archived: false,
      createdAt: toISODate(addDays(now, -21)),
    },
  ];

  const bibleReadingLogs: BibleReadingLog[] = [
    {
      id: "brl1",
      book: "João",
      chapter: 3,
      date: toISODate(addDays(now, -12)),
      createdAt: new Date(addDays(now, -12)).toISOString(),
    },
    {
      id: "brl2",
      book: "João",
      chapter: 5,
      date: toISODate(addDays(now, -8)),
      createdAt: new Date(addDays(now, -8)).toISOString(),
    },
    {
      id: "brl3",
      book: "João",
      chapter: 6,
      date: toISODate(addDays(now, -5)),
      reflection:
        "A multiplicação dos pães me lembrou que o pouco que ofereço já é suficiente nas mãos de Deus.",
      createdAt: new Date(addDays(now, -5)).toISOString(),
    },
    {
      id: "brl4",
      book: "João",
      chapter: 8,
      date: toISODate(addDays(now, -1)),
      createdAt: new Date(addDays(now, -1)).toISOString(),
    },
  ];

  const notebookEntries: NotebookEntry[] = [
    {
      id: "ne1",
      type: "deus_falou",
      content: "Tenho tentado controlar coisas que não estão nas minhas mãos.",
      verseReference: "Provérbios 3:5",
      createdAt: new Date(addDays(now, -3)).toISOString(),
      resurfaceCount: 0,
    },
    {
      id: "ne2",
      type: "gratidao",
      content: "Sou grato pela minha família.",
      createdAt: new Date(addDays(now, -10)).toISOString(),
      resurfaceCount: 0,
    },
    {
      id: "ne3",
      type: "versiculo",
      content: "",
      verseReference: "Isaías 41:10",
      verseText: "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus.",
      createdAt: new Date(addDays(now, -18)).toISOString(),
      resurfaceCount: 0,
    },
  ];

  return {
    prayerSubjects,
    prayerNotes: [],
    purposes,
    bibleReadingLogs,
    readingFrequency: "3x",
    notebookEntries,
    spiritualActivities: [],
    prayerActivityDates: [toISODate(addDays(now, -2)), toISODate(addDays(now, -1))],
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

export function useFeStore<T>(selector: (s: State) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector(snap);
}

// ---------------------------------------------------------------------------
// Ações — orações
// ---------------------------------------------------------------------------
export function addPrayerSubject(input: { title: string; description: string }): string {
  const id = genId("ps");
  const now = new Date().toISOString();
  set((s) => ({
    ...s,
    prayerSubjects: [
      ...s.prayerSubjects,
      {
        id,
        title: input.title.trim(),
        description: input.description.trim(),
        status: "em_oracao",
        createdAt: now,
        updatedAt: now,
      },
    ],
  }));
  return id;
}

export function updatePrayerSubject(id: string, patch: { title?: string; description?: string }) {
  set((s) => ({
    ...s,
    prayerSubjects: s.prayerSubjects.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
    ),
  }));
}

export function setPrayerSubjectStatus(id: string, status: PrayerSubjectStatus) {
  set((s) => ({
    ...s,
    prayerSubjects: s.prayerSubjects.map((p) =>
      p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p,
    ),
  }));
}

export function addPrayerNote(subjectId: string, text: string) {
  const id = genId("pn");
  set((s) => ({
    ...s,
    prayerNotes: [
      { id, subjectId, text: text.trim(), createdAt: new Date().toISOString() },
      ...s.prayerNotes,
    ],
  }));
}

export function notesForSubject(notes: PrayerNote[], subjectId: string): PrayerNote[] {
  return notes
    .filter((n) => n.subjectId === subjectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Marca que houve um momento de oração hoje — só a data, sem conteúdo, alimenta o Ritmo. */
export function recordPrayerActivity(date: string = todayISO()) {
  set((s) =>
    s.prayerActivityDates.includes(date)
      ? s
      : { ...s, prayerActivityDates: [...s.prayerActivityDates, date] },
  );
}

// ---------------------------------------------------------------------------
// Ações — jornada bíblica
// ---------------------------------------------------------------------------
export function logBibleReading(input: {
  book: string;
  chapter: number;
  verseRange?: string;
  date?: string;
  reflection?: string;
}): string {
  const id = genId("brl");
  set((s) => ({
    ...s,
    bibleReadingLogs: [
      {
        id,
        book: input.book,
        chapter: input.chapter,
        verseRange: input.verseRange,
        date: input.date ?? todayISO(),
        reflection: input.reflection?.trim() || undefined,
        createdAt: new Date().toISOString(),
      },
      ...s.bibleReadingLogs,
    ],
  }));
  return id;
}

export function setReadingFrequency(freq: ReadingFrequency) {
  set((s) => ({ ...s, readingFrequency: freq }));
}

// ---------------------------------------------------------------------------
// Ações — caderno
// ---------------------------------------------------------------------------
export function addNotebookEntry(input: {
  type: NotebookEntryType;
  content: string;
  verseReference?: string;
  verseText?: string;
  context?: string;
}): string {
  const id = genId("ne");
  set((s) => ({
    ...s,
    notebookEntries: [
      {
        id,
        type: input.type,
        content: input.content.trim(),
        verseReference: input.verseReference,
        verseText: input.verseText,
        context: input.context?.trim() || undefined,
        createdAt: new Date().toISOString(),
        resurfaceCount: 0,
      },
      ...s.notebookEntries,
    ],
  }));
  return id;
}

export function saveVerseOfDay(reference: string, text: string) {
  addNotebookEntry({ type: "versiculo", content: "", verseReference: reference, verseText: text });
}

export function reflectOnVerse(reference: string, text: string, reflection: string) {
  addNotebookEntry({
    type: "versiculo",
    content: reflection,
    verseReference: reference,
    verseText: text,
  });
}

export function markResurfaced(id: string) {
  set((s) => ({
    ...s,
    notebookEntries: s.notebookEntries.map((e) =>
      e.id === id
        ? { ...e, lastResurfacedAt: new Date().toISOString(), resurfaceCount: e.resurfaceCount + 1 }
        : e,
    ),
  }));
}

// ---------------------------------------------------------------------------
// Ações — propósitos
// ---------------------------------------------------------------------------
export function createPurpose(input: {
  title: string;
  intention: string;
  why?: string;
  startDate?: string;
  endDate?: string;
}): string {
  const id = genId("purp");
  set((s) => ({
    ...s,
    purposes: [
      ...s.purposes,
      {
        id,
        title: input.title.trim(),
        intention: input.intention.trim(),
        why: input.why?.trim() || undefined,
        startDate: input.startDate,
        endDate: input.endDate,
        archived: false,
        createdAt: new Date().toISOString(),
      },
    ],
  }));
  return id;
}

export function linkPurposeToActivity(purposeId: string, spiritualActivityId: string) {
  set((s) => ({
    ...s,
    purposes: s.purposes.map((p) => (p.id === purposeId ? { ...p, spiritualActivityId } : p)),
  }));
}

export function archivePurpose(id: string) {
  set((s) => ({
    ...s,
    purposes: s.purposes.map((p) => (p.id === id ? { ...p, archived: true } : p)),
  }));
}

// ---------------------------------------------------------------------------
// Ações — atividades espirituais agendáveis (reaproveita goals-store Routine)
// ---------------------------------------------------------------------------
export async function createSpiritualActivity(input: {
  kind: SpiritualActivityKind;
  title: string;
  weekdays: number[];
  time: string;
  durationMinutes?: number;
  purposeId?: string;
}): Promise<string> {
  const goalsRoutineIds = await Promise.all(
    input.weekdays.map((weekday) =>
      createRoutine({ category: "fe", title: input.title, weekday, time: input.time }),
    ),
  );
  const id = genId("sa");
  set((s) => ({
    ...s,
    spiritualActivities: [
      ...s.spiritualActivities,
      {
        id,
        kind: input.kind,
        title: input.title.trim(),
        weekdays: input.weekdays,
        time: input.time,
        durationMinutes: input.durationMinutes,
        goalsRoutineIds,
        purposeId: input.purposeId,
      },
    ],
  }));
  return id;
}

/** Recria as Routine do goals-store sem duplicar (mesmo padrão de setReadingRoutine). */
export async function updateSpiritualActivity(
  id: string,
  input: { title: string; weekdays: number[]; time: string; durationMinutes?: number },
) {
  const existing = state.spiritualActivities.find((a) => a.id === id);
  if (!existing) return;
  await Promise.all(existing.goalsRoutineIds.map((rid) => removeRoutine(rid)));
  const goalsRoutineIds = await Promise.all(
    input.weekdays.map((weekday) =>
      createRoutine({ category: "fe", title: input.title, weekday, time: input.time }),
    ),
  );
  set((s) => ({
    ...s,
    spiritualActivities: s.spiritualActivities.map((a) =>
      a.id === id
        ? {
            ...a,
            title: input.title.trim(),
            weekdays: input.weekdays,
            time: input.time,
            durationMinutes: input.durationMinutes,
            goalsRoutineIds,
          }
        : a,
    ),
  }));
}

export async function removeSpiritualActivity(id: string) {
  const existing = state.spiritualActivities.find((a) => a.id === id);
  if (existing) await Promise.all(existing.goalsRoutineIds.map((rid) => removeRoutine(rid)));
  set((s) => ({ ...s, spiritualActivities: s.spiritualActivities.filter((a) => a.id !== id) }));
}
