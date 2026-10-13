import { addDaysISO, dayIndex, instantToZoned, minutesBetween, zonedTimeToUtc } from "./time.ts";
import { dayShiftBetween, formatRecurrence, parseRecurrence, type Rule } from "./rrule.ts";

// ---------------------------------------------------------------------------
// Mapeamento entre o evento do Google e o compromisso do Norte.
//
// Os dois lados passam por UMA forma intermediária (`NormalEvent`). É ela que
// se compara, se transforma em hash e se converte para cada lado — assim "mudou
// ou não mudou" é uma pergunta só, nos dois sentidos.
// ---------------------------------------------------------------------------

export type GoogleDateTime = { date?: string; dateTime?: string; timeZone?: string };

export type GoogleEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleDateTime;
  end?: GoogleDateTime;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: GoogleDateTime;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  source?: { url?: string; title?: string };
  colorId?: string;
  updated?: string;
  htmlLink?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export type NormalEvent = {
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string | null;
  /** Fim INCLUSIVO para dia inteiro; data do fim para evento com hora. */
  endDate: string;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  link: string | null;
  cancelled: boolean;
  rule: Rule | null;
  exdates: string[];
};

export type Session = { date: string; start: string; end: string | null };

const MAX_DAYS = 31;

const clean = (v: string | undefined | null) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/** Hash estável (cyrb53) — não é segurança, é identidade de conteúdo. */
export function contentHash(value: unknown): string {
  const str = JSON.stringify(value);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/** Só o que é compartilhado entre os dois lados entra no hash. O link fica de
 * fora de propósito: do Google só vem o Meet/origem, e do Norte só vai na
 * criação — comparar esse campo faria cada eco parecer uma mudança. */
export function normalHash(n: NormalEvent): string {
  return contentHash({
    t: n.title.trim(),
    a: n.allDay,
    sd: n.startDate,
    st: n.allDay ? null : n.startTime,
    ed: n.endDate,
    et: n.allDay ? null : n.endTime,
    l: n.location ?? null,
    n: n.notes ?? null,
    c: n.cancelled,
    r: n.rule ?? null,
    x: [...n.exdates].sort(),
  });
}

function meetLink(ev: GoogleEvent): string | null {
  if (ev.hangoutLink) return ev.hangoutLink;
  const video = ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return video?.uri ?? null;
}

/** Instante do Google → data e hora no fuso do Norte. */
function toZoned(
  dt: GoogleDateTime | undefined,
  zone: string,
): { date: string; time: string } | null {
  if (!dt?.dateTime) return null;
  // Sem offset (raro): vale como hora local do fuso do próprio evento.
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(dt.dateTime)) {
    const [date, time] = dt.dateTime.split("T");
    const instant = zonedTimeToUtc(date, time.slice(0, 5), dt.timeZone ?? zone);
    return instantToZoned(instant.toISOString(), zone);
  }
  return instantToZoned(dt.dateTime, zone);
}

export type FromGoogle = {
  normal: NormalEvent;
  /** Uma sessão normalmente; várias quando o evento atravessa mais de um dia. */
  sessions: Session[];
  multiDay: boolean;
  unsupported?: string;
};

export function googleToNormal(ev: GoogleEvent, zone: string): FromGoogle {
  const title = clean(ev.summary) ?? "(sem título)";
  const cancelled = ev.status === "cancelled";
  const base = {
    title,
    location: clean(ev.location),
    notes: clean(ev.description),
    link: meetLink(ev) ?? clean(ev.source?.url),
    cancelled,
  };

  let allDay = false;
  let startDate: string;
  let startTime: string | null = null;
  let endDate: string;
  let endTime: string | null = null;

  if (ev.start?.date) {
    allDay = true;
    startDate = ev.start.date;
    endDate = ev.end?.date ? addDaysISO(ev.end.date, -1) : startDate;
    if (endDate < startDate) endDate = startDate;
  } else {
    const s = toZoned(ev.start, zone);
    const e = toZoned(ev.end, zone) ?? s;
    if (!s || !e) {
      // Evento cancelado costuma vir sem horário: só o id importa.
      const empty: NormalEvent = {
        ...base,
        allDay: false,
        startDate: "1970-01-01",
        startTime: "00:00",
        endDate: "1970-01-01",
        endTime: "00:00",
        rule: null,
        exdates: [],
      };
      return { normal: empty, sessions: [], multiDay: false };
    }
    startDate = s.date;
    startTime = s.time;
    endDate = e.date;
    endTime = e.time;
  }

  // Repetição: o fuso do EVENTO (não o do Norte) decide em que dia cai o BYDAY.
  let rule: Rule | null = null;
  let exdates: string[] = [];
  let unsupported: string | undefined;
  if (ev.recurrence?.length) {
    const eventZone = ev.start?.timeZone ?? zone;
    const eventStart = ev.start?.dateTime
      ? instantToZoned(ev.start.dateTime, eventZone).date
      : startDate;
    const parsed = parseRecurrence(ev.recurrence, {
      startDate,
      zone,
      dayShift: dayShiftBetween(eventStart, startDate),
    });
    rule = parsed.rule;
    exdates = parsed.exdates;
    unsupported = parsed.unsupported;
  }

  let sessions: Session[];
  let multiDay = false;
  if (allDay) {
    const days = dayIndex(endDate) - dayIndex(startDate) + 1;
    multiDay = days > 1;
    if (days > MAX_DAYS) {
      return {
        normal: { ...base, allDay, startDate, startTime, endDate, endTime, rule, exdates },
        sessions: [{ date: startDate, start: "", end: null }],
        multiDay: true,
        unsupported: "Evento de dia inteiro longo demais para o Norte.",
      };
    }
    sessions = Array.from({ length: days }, (_, i) => ({
      date: addDaysISO(startDate, i),
      start: "",
      end: null,
    }));
  } else {
    const minutes = minutesBetween(startDate, startTime!, endDate, endTime!);
    if (minutes > 1440) {
      multiDay = true;
      const days = dayIndex(endDate) - dayIndex(startDate) + 1;
      if (days > MAX_DAYS)
        return {
          normal: { ...base, allDay, startDate, startTime, endDate, endTime, rule, exdates },
          sessions: [{ date: startDate, start: startTime!, end: "00:00" }],
          multiDay: true,
          unsupported: "Evento longo demais para o Norte.",
        };
      sessions = Array.from({ length: days }, (_, i) => {
        const date = addDaysISO(startDate, i);
        return {
          date,
          start: i === 0 ? startTime! : "00:00",
          end: i === days - 1 ? endTime! : "00:00",
        };
      });
    } else {
      // 00:00 no FIM significa meia-noite do fim do dia; fim == início, 15 minutos.
      sessions = [
        { date: startDate, start: startTime!, end: endTime === startTime ? endTime : endTime },
      ];
    }
  }

  return {
    normal: { ...base, allDay, startDate, startTime, endDate, endTime, rule, exdates },
    sessions,
    multiDay,
    unsupported,
  };
}

export type GooglePayload = {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleDateTime;
  end: GoogleDateTime;
  recurrence?: string[];
  source?: { url: string; title: string };
  status?: "confirmed" | "cancelled";
  extendedProperties?: { private: Record<string, string> };
};

/** Forma intermediária → corpo do evento para o Google. */
export function normalToGoogle(
  n: NormalEvent,
  zone: string,
  meta: { norteId?: string; norteKind?: string; session?: string } = {},
): GooglePayload {
  const payload: GooglePayload = {
    summary: n.title,
    description: n.notes ?? "",
    location: n.location ?? "",
    start: n.allDay
      ? { date: n.startDate }
      : { dateTime: `${n.startDate}T${n.startTime}:00`, timeZone: zone },
    end: n.allDay
      ? { date: addDaysISO(n.endDate, 1) }
      : { dateTime: `${n.endDate}T${n.endTime}:00`, timeZone: zone },
  };
  if (n.link) payload.source = { url: n.link, title: "Norte" };
  if (n.rule) {
    payload.recurrence = formatRecurrence({
      rule: n.rule,
      startDate: n.startDate,
      startTime: n.startTime ?? undefined,
      allDay: n.allDay,
      zone,
      exdates: n.exdates,
    });
  }
  if (meta.norteId)
    payload.extendedProperties = {
      private: {
        norteId: meta.norteId,
        norteKind: meta.norteKind ?? "execution",
        ...(meta.session ? { norteSession: meta.session } : {}),
      },
    };
  return payload;
}

// ---------------------------------------------------------------------------
// Norte (linhas do banco) ↔ forma intermediária
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

const text = (v: unknown) => clean(typeof v === "string" ? v : null);

/** Uma sessão de um compromisso do Norte → evento. */
export function executionToNormal(
  row: Row,
  session: { date: string; start: string; end: string | null },
): NormalEvent {
  const allDay = Boolean(row.all_day) || !session.start;
  let endDate = session.date;
  let endTime: string | null = null;
  if (!allDay) {
    const end = session.end;
    endTime = end && end !== "" ? end.slice(0, 5) : null;
    if (!endTime) {
      // Sem fim: uma hora.
      const total = Number(session.start.slice(0, 2)) * 60 + Number(session.start.slice(3, 5)) + 60;
      endTime = `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      if (total >= 1440) endDate = addDaysISO(session.date, 1);
    } else if (endTime === "00:00" || endTime <= session.start.slice(0, 5)) {
      // Termina à meia-noite ou vira o dia: o fim é no dia seguinte.
      endDate = addDaysISO(session.date, 1);
    }
  }
  return {
    title: String(row.title ?? ""),
    allDay,
    startDate: session.date,
    startTime: allDay ? null : session.start.slice(0, 5),
    endDate,
    endTime,
    location: text(row.location),
    notes: text(row.notes),
    link: text(row.link),
    cancelled: row.status === "cancelada",
    rule: null,
    exdates: [],
  };
}

export function seriesToNormal(row: Row, exdates: string[]): NormalEvent {
  const allDay = Boolean(row.all_day) || !row.start_time;
  const startDate = String(row.start_date);
  const start = allDay ? null : String(row.start_time).slice(0, 5);
  let endDate = startDate;
  let end: string | null = null;
  if (!allDay) {
    const e = text(row.end_time);
    if (e) {
      end = e.slice(0, 5);
      if (end === "00:00" || end <= start!) endDate = addDaysISO(startDate, 1);
    } else {
      const total = Number(start!.slice(0, 2)) * 60 + Number(start!.slice(3, 5)) + 60;
      end = `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      if (total >= 1440) endDate = addDaysISO(startDate, 1);
    }
  }
  const rule = row.rule as Rule;
  return {
    title: String(row.title ?? ""),
    allDay,
    startDate,
    startTime: start,
    endDate,
    endTime: end,
    location: text(row.location),
    notes: text(row.notes),
    link: text(row.link),
    cancelled: false,
    rule,
    exdates,
  };
}

/** Sessões de um compromisso do Norte (as legadas viram uma sessão). */
export function sessionsOfExecution(
  row: Row,
): { key: string; date: string; start: string; end: string | null }[] {
  const legacyKey = `legacy-${row.id}`;
  const raw = Array.isArray(row.agenda_sessions) ? (row.agenda_sessions as Row[]) : [];
  if (raw.length > 0)
    return raw.map((s) => ({
      key: String(s.id),
      date: String(s.date),
      start: String(s.startTime ?? ""),
      end: (s.endTime as string | undefined) ?? null,
    }));
  if (row.agenda_date)
    return [
      {
        key: legacyKey,
        date: String(row.agenda_date),
        start: String(row.start_time ?? ""),
        end: (row.end_time as string | null) ?? null,
      },
    ];
  return [];
}
