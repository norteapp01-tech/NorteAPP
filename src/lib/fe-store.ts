import { useQuery } from "@tanstack/react-query";
import { toISODate, addDays, todayISO, createRoutine, removeRoutine } from "./goals-store";
import { startOfWeekLocal } from "./format-utils";
import type { WeekStart } from "./profile-store";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { nowDate } from "./test-clock";

/** Data que rege o momento espiritual — agenda se existir, senão o prazo (mesma regra do core). */
function relevantDate(e: { dueDate: string; agendaDate?: string }): string {
  return e.agendaDate ?? e.dueDate;
}

// ---------------------------------------------------------------------------
// Fé — "O Norte não mede o quanto você busca Deus. Ele ajuda você a abrir
// espaço para buscá-Lo." Nada aqui é streak, XP ou ranking — a única
// visualização de constância é o "Ritmo" (seção mais abaixo), sempre
// derivado dos registros reais, nunca um contador administrado à parte.
//
// Persistida no Supabase (mesmo padrão de goals-store.ts). Atividades
// agendáveis usam `routine_links` pra apontar pra `routines` do núcleo (uma
// Routine por dia da semana escolhido) — nunca duplicam a Agenda.
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

const EMPTY_STATE: State = {
  prayerSubjects: [],
  prayerNotes: [],
  purposes: [],
  bibleReadingLogs: [],
  readingFrequency: "none",
  notebookEntries: [],
  spiritualActivities: [],
  prayerActivityDates: [],
};

// ---------------------------------------------------------------------------
// Seletores puros — nada muda aqui, seguem operando sobre arrays simples.
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

export type WeeklyRhythm = {
  oracao: string[];
  palavra: string[];
  comunhao: string[];
  reflexao: string[];
};

/** Nada de streak — só os dias distintos desta semana em que cada dimensão aconteceu.
 * "Semana" respeita a preferência de primeiro dia salva em Configurações. */
export function weeklyRhythm(
  state: State,
  executions: { dueDate: string; agendaDate?: string; status: string; routineId?: string }[],
  weekStart: WeekStart = "monday",
): WeeklyRhythm {
  const start = toISODate(startOfWeekLocal(nowDate(), weekStart));
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
  const cutoff = toISODate(addDays(nowDate(), -7));
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

function mapPrayerSubject(r: Row): PrayerSubject {
  return {
    id: r.id as string,
    title: r.title as string,
    description: (r.description as string) ?? "",
    status: r.status as PrayerSubjectStatus,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapPrayerNote(r: Row): PrayerNote {
  return {
    id: r.id as string,
    subjectId: r.subject_id as string,
    text: r.text as string,
    createdAt: r.created_at as string,
  };
}

function mapPurpose(r: Row): Purpose {
  return {
    id: r.id as string,
    title: r.title as string,
    intention: r.intention as string,
    why: (r.why as string) ?? undefined,
    startDate: (r.start_date as string) ?? undefined,
    endDate: (r.end_date as string) ?? undefined,
    spiritualActivityId: (r.spiritual_activity_id as string) ?? undefined,
    archived: r.archived as boolean,
    createdAt: r.created_at as string,
  };
}

function mapBibleReadingLog(r: Row): BibleReadingLog {
  return {
    id: r.id as string,
    book: r.book as string,
    chapter: r.chapter as number,
    verseRange: (r.verse_range as string) ?? undefined,
    date: r.date as string,
    reflection: (r.reflection as string) ?? undefined,
    createdAt: r.created_at as string,
  };
}

function mapNotebookEntry(r: Row): NotebookEntry {
  return {
    id: r.id as string,
    type: r.type as NotebookEntryType,
    content: (r.content as string) ?? "",
    verseReference: (r.verse_reference as string) ?? undefined,
    verseText: (r.verse_text as string) ?? undefined,
    context: (r.context as string) ?? undefined,
    createdAt: r.created_at as string,
    lastResurfacedAt: (r.last_resurfaced_at as string) ?? undefined,
    resurfaceCount: (r.resurface_count as number) ?? 0,
  };
}

function mapSpiritualActivity(r: Row, links: Row[]): SpiritualActivity {
  const sorted = [...links].sort((a, b) => (a.weekday as number) - (b.weekday as number));
  return {
    id: r.id as string,
    kind: r.kind as SpiritualActivityKind,
    title: r.title as string,
    weekdays: sorted.map((l) => l.weekday as number),
    time: r.time as string,
    durationMinutes: (r.duration_minutes as number) ?? undefined,
    goalsRoutineIds: sorted.map((l) => l.core_routine_id as string),
  };
}

async function fetchState(): Promise<State> {
  const [
    subjectsRes,
    notesRes,
    purposesRes,
    bibleRes,
    freqRes,
    entriesRes,
    activitiesRes,
    linksRes,
    prayerLogRes,
  ] = await Promise.all([
    supabase.from("prayer_subjects").select("*").order("created_at", { ascending: false }),
    supabase.from("prayer_notes").select("*").order("created_at", { ascending: false }),
    supabase.from("purposes").select("*").order("created_at", { ascending: false }),
    supabase.from("bible_reading_logs").select("*").order("date", { ascending: false }),
    supabase.from("reading_frequency_pref").select("*").maybeSingle(),
    supabase.from("notebook_entries").select("*").order("created_at", { ascending: false }),
    supabase.from("spiritual_activities").select("*"),
    supabase.from("routine_links").select("*").eq("source_type", "spiritual_activity"),
    supabase.from("prayer_activity_log").select("date"),
  ]);
  const subjectRows = unwrap(subjectsRes);
  const noteRows = unwrap(notesRes);
  const purposeRows = unwrap(purposesRes);
  const bibleRows = unwrap(bibleRes);
  if (freqRes.error) throw new Error(freqRes.error.message);
  const entryRows = unwrap(entriesRes);
  const activityRows = unwrap(activitiesRes);
  const linkRows = unwrap(linksRes);
  const prayerLogRows = unwrap(prayerLogRes);

  const linksByActivity = groupBy(linkRows as Row[], "source_id");

  return {
    prayerSubjects: (subjectRows as Row[]).map(mapPrayerSubject),
    prayerNotes: (noteRows as Row[]).map(mapPrayerNote),
    purposes: (purposeRows as Row[]).map(mapPurpose),
    bibleReadingLogs: (bibleRows as Row[]).map(mapBibleReadingLog),
    readingFrequency: freqRes.data ? ((freqRes.data as Row).frequency as ReadingFrequency) : "none",
    notebookEntries: (entryRows as Row[]).map(mapNotebookEntry),
    spiritualActivities: (activityRows as Row[]).map((r) =>
      mapSpiritualActivity(r, linksByActivity[r.id as string] ?? []),
    ),
    prayerActivityDates: (prayerLogRows as Row[]).map((r) => r.date as string),
  };
}

const QUERY_KEY = ["fe-domain"] as const;
function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

export function useFeStore<T>(selector: (s: State) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return selector(data ?? EMPTY_STATE);
}

// ---------------------------------------------------------------------------
// Ações — orações
// ---------------------------------------------------------------------------
export async function addPrayerSubject(input: {
  title: string;
  description: string;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("prayer_subjects")
      .insert({ user_id: userId, title: input.title.trim(), description: input.description.trim() })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function updatePrayerSubject(
  id: string,
  patch: { title?: string; description?: string },
) {
  const dbPatch: Row = {};
  if (patch.title !== undefined) dbPatch.title = patch.title.trim();
  if (patch.description !== undefined) dbPatch.description = patch.description.trim();
  unwrap(await supabase.from("prayer_subjects").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

export async function setPrayerSubjectStatus(id: string, status: PrayerSubjectStatus) {
  unwrap(await supabase.from("prayer_subjects").update({ status }).eq("id", id).select().single());
  await invalidate();
}

export async function addPrayerNote(subjectId: string, text: string) {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("prayer_notes")
      .insert({ user_id: userId, subject_id: subjectId, text: text.trim() })
      .select()
      .single(),
  );
  await invalidate();
}

export function notesForSubject(notes: PrayerNote[], subjectId: string): PrayerNote[] {
  return notes
    .filter((n) => n.subjectId === subjectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Marca que houve um momento de oração hoje — só a data, sem conteúdo, alimenta o Ritmo. */
export async function recordPrayerActivity(date: string = todayISO()) {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("prayer_activity_log")
      .upsert({ user_id: userId, date }, { onConflict: "user_id,date" })
      .select()
      .single(),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — jornada bíblica
// ---------------------------------------------------------------------------
export async function logBibleReading(input: {
  book: string;
  chapter: number;
  verseRange?: string;
  date?: string;
  reflection?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("bible_reading_logs")
      .insert({
        user_id: userId,
        book: input.book,
        chapter: input.chapter,
        verse_range: input.verseRange,
        date: input.date ?? todayISO(),
        reflection: input.reflection?.trim() || null,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function setReadingFrequency(freq: ReadingFrequency) {
  const userId = await ensureSession();
  unwrap(
    await supabase
      .from("reading_frequency_pref")
      .upsert({ user_id: userId, frequency: freq }, { onConflict: "user_id" })
      .select()
      .single(),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — caderno
// ---------------------------------------------------------------------------
export async function addNotebookEntry(input: {
  type: NotebookEntryType;
  content: string;
  verseReference?: string;
  verseText?: string;
  context?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("notebook_entries")
      .insert({
        user_id: userId,
        type: input.type,
        content: input.content.trim(),
        verse_reference: input.verseReference,
        verse_text: input.verseText,
        context: input.context?.trim() || null,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function saveVerseOfDay(reference: string, text: string) {
  await addNotebookEntry({
    type: "versiculo",
    content: "",
    verseReference: reference,
    verseText: text,
  });
}

export async function reflectOnVerse(reference: string, text: string, reflection: string) {
  await addNotebookEntry({
    type: "versiculo",
    content: reflection,
    verseReference: reference,
    verseText: text,
  });
}

export async function markResurfaced(id: string) {
  const row = unwrap<Row>(
    await supabase.from("notebook_entries").select("resurface_count").eq("id", id).single(),
  );
  unwrap(
    await supabase
      .from("notebook_entries")
      .update({
        last_resurfaced_at: nowDate().toISOString(),
        resurface_count: ((row.resurface_count as number) ?? 0) + 1,
      })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Ações — propósitos
// ---------------------------------------------------------------------------
export async function createPurpose(input: {
  title: string;
  intention: string;
  why?: string;
  startDate?: string;
  endDate?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("purposes")
      .insert({
        user_id: userId,
        title: input.title.trim(),
        intention: input.intention.trim(),
        why: input.why?.trim() || null,
        start_date: input.startDate,
        end_date: input.endDate,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function linkPurposeToActivity(purposeId: string, spiritualActivityId: string) {
  unwrap(
    await supabase
      .from("purposes")
      .update({ spiritual_activity_id: spiritualActivityId })
      .eq("id", purposeId)
      .select()
      .single(),
  );
  await invalidate();
}

export async function archivePurpose(id: string) {
  unwrap(await supabase.from("purposes").update({ archived: true }).eq("id", id).select().single());
  await invalidate();
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
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("spiritual_activities")
      .insert({
        user_id: userId,
        kind: input.kind,
        title: input.title.trim(),
        time: input.time,
        duration_minutes: input.durationMinutes,
      })
      .select()
      .single(),
  );
  const goalsRoutineIds = await Promise.all(
    input.weekdays.map((weekday) =>
      createRoutine({ category: "fe", title: input.title, weekday, time: input.time }),
    ),
  );
  await Promise.all(
    goalsRoutineIds.map((rid, i) =>
      supabase.from("routine_links").insert({
        user_id: userId,
        source_type: "spiritual_activity",
        source_id: row.id,
        weekday: input.weekdays[i],
        core_routine_id: rid,
      }),
    ),
  );
  await invalidate();
  return row.id;
}

/** Recria as Routine do goals-store sem duplicar — apagar a Routine já apaga o
 * routine_link em cascata (FK), não precisa de um passo manual pra isso. */
export async function updateSpiritualActivity(
  id: string,
  input: { title: string; weekdays: number[]; time: string; durationMinutes?: number },
) {
  const userId = await ensureSession();
  const { data: existingLinks } = await supabase
    .from("routine_links")
    .select("core_routine_id")
    .eq("source_type", "spiritual_activity")
    .eq("source_id", id);
  await Promise.all((existingLinks ?? []).map((l) => removeRoutine(l.core_routine_id as string)));
  const goalsRoutineIds = await Promise.all(
    input.weekdays.map((weekday) =>
      createRoutine({ category: "fe", title: input.title, weekday, time: input.time }),
    ),
  );
  await Promise.all(
    goalsRoutineIds.map((rid, i) =>
      supabase.from("routine_links").insert({
        user_id: userId,
        source_type: "spiritual_activity",
        source_id: id,
        weekday: input.weekdays[i],
        core_routine_id: rid,
      }),
    ),
  );
  unwrap(
    await supabase
      .from("spiritual_activities")
      .update({
        title: input.title.trim(),
        time: input.time,
        duration_minutes: input.durationMinutes,
      })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

export async function removeSpiritualActivity(id: string) {
  const { data: existingLinks } = await supabase
    .from("routine_links")
    .select("core_routine_id")
    .eq("source_type", "spiritual_activity")
    .eq("source_id", id);
  await Promise.all((existingLinks ?? []).map((l) => removeRoutine(l.core_routine_id as string)));
  await supabase.from("spiritual_activities").delete().eq("id", id);
  await invalidate();
}
