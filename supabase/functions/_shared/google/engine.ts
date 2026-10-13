import { GoogleApiError, type GoogleCalendarApi } from "./api.ts";
import {
  executionToNormal,
  googleToNormal,
  normalHash,
  normalToGoogle,
  seriesToNormal,
  sessionsOfExecution,
  type FromGoogle,
  type GoogleEvent,
  type GooglePayload,
  type NormalEvent,
} from "./mapping.ts";
import { addDaysISO, dateAndTimeInZone } from "./time.ts";

// ---------------------------------------------------------------------------
// Motor de sincronização Norte ↔ Google Agenda.
//
// Como duplicação e ciclos são evitados
//  * Cada evento/série do Norte tem UM vínculo (`agenda_external_links`) com o
//    id do evento no Google. Sem vínculo → cria; com vínculo → atualiza.
//  * O vínculo guarda `synced_hash`: o hash do conteúdo em que os dois lados
//    concordaram pela última vez. Se o conteúdo atual de um lado é igual a ele,
//    não houve mudança ali — e o "eco" do que acabamos de enviar (ou receber)
//    nunca vira uma nova alteração.
//  * Se OS DOIS lados mudaram desde esse ponto e divergem, nada é sobrescrito:
//    o vínculo vira `conflict`, com os dois conteúdos guardados, e a pessoa decide.
//  * Eventos criados no Norte levam `norteId` nas propriedades privadas do
//    Google, o que permite religar (em vez de duplicar) se um vínculo se perder.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Result<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
/** O subconjunto do cliente do Supabase que o motor usa (service role). */
export type Db = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Conn = { id: string; user_id: string; time_zone: string; push_routines: boolean };
export type Cal = {
  id: string;
  connection_id: string;
  user_id: string;
  google_calendar_id: string;
  summary: string;
  background_color: string | null;
  access_role: string;
  selected: boolean;
  push_new_events: boolean;
};

export type Stats = Record<string, number>;

export type Ctx = {
  db: Db;
  api: GoogleCalendarApi;
  conn: Conn;
  zone: string;
  now: () => Date;
  stats: Stats;
  newId: () => string;
};

/** Erro que a PESSOA precisa resolver (não adianta repetir sozinho). */
export class SyncUserError extends Error {}

const bump = (ctx: Ctx, key: string, n = 1) => void (ctx.stats[key] = (ctx.stats[key] ?? 0) + n);

async function q<T>(p: Result<T>): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const todayIn = (ctx: Ctx) => dateAndTimeInZone(ctx.now(), ctx.zone).date;
const isReadOnlyRole = (role: string) => role === "reader" || role === "freeBusyReader";

// ---------------------------------------------------------------------------
// Acesso a dados
// ---------------------------------------------------------------------------

async function linkByEvent(ctx: Ctx, calId: string, eventId: string): Promise<Row | null> {
  return q<Row | null>(
    ctx.db
      .from("agenda_external_links")
      .select("*")
      .eq("user_id", ctx.conn.user_id)
      .eq("calendar_id", calId)
      .eq("external_event_id", eventId)
      .maybeSingle(),
  );
}

async function linksOfExecution(ctx: Ctx, executionId: string): Promise<Row[]> {
  return (
    (await q<Row[]>(
      ctx.db
        .from("agenda_external_links")
        .select("*")
        .eq("user_id", ctx.conn.user_id)
        .eq("connection_id", ctx.conn.id)
        .eq("execution_id", executionId),
    )) ?? []
  );
}

async function linkOfSeries(ctx: Ctx, seriesId: string): Promise<Row | null> {
  return q<Row | null>(
    ctx.db
      .from("agenda_external_links")
      .select("*")
      .eq("user_id", ctx.conn.user_id)
      .eq("connection_id", ctx.conn.id)
      .eq("series_id", seriesId)
      .eq("kind", "series")
      .maybeSingle(),
  );
}

async function insertLink(ctx: Ctx, cal: Cal, row: Row): Promise<Row> {
  return q<Row>(
    ctx.db
      .from("agenda_external_links")
      .insert({
        user_id: ctx.conn.user_id,
        provider: "google",
        connection_id: ctx.conn.id,
        calendar_id: cal.id,
        external_calendar_id: cal.google_calendar_id,
        external_color: cal.background_color,
        external_label: cal.summary,
        access_role: isReadOnlyRole(cal.access_role) ? "read" : "write",
        last_synced_at: ctx.now().toISOString(),
        sync_state: "synced",
        ...row,
      })
      .select()
      .single(),
  );
}

async function updateLink(ctx: Ctx, id: unknown, patch: Row): Promise<void> {
  await q(
    ctx.db
      .from("agenda_external_links")
      .update({ last_synced_at: ctx.now().toISOString(), ...patch })
      .eq("id", id)
      .select(),
  );
}

async function logChange(ctx: Ctx, row: Row): Promise<void> {
  try {
    await ctx.db.from("agenda_changes").insert({ user_id: ctx.conn.user_id, ...row });
  } catch {
    /* Histórico é auditoria: nunca derruba a sincronização. */
  }
}

const getExecution = (ctx: Ctx, id: unknown) =>
  q<Row | null>(
    ctx.db
      .from("executions")
      .select("*")
      .eq("user_id", ctx.conn.user_id)
      .eq("id", id)
      .maybeSingle(),
  );
const getSeries = (ctx: Ctx, id: unknown) =>
  q<Row | null>(
    ctx.db
      .from("agenda_series")
      .select("*")
      .eq("user_id", ctx.conn.user_id)
      .eq("id", id)
      .maybeSingle(),
  );

async function exdatesOf(ctx: Ctx, seriesId: unknown): Promise<string[]> {
  const rows =
    (await q<Row[]>(
      ctx.db
        .from("agenda_series_exceptions")
        .select("occurrence_date")
        .eq("user_id", ctx.conn.user_id)
        .eq("series_id", seriesId),
    )) ?? [];
  return rows.map((r) => String(r.occurrence_date)).sort();
}

// ---------------------------------------------------------------------------
// Conteúdo local de um vínculo
// ---------------------------------------------------------------------------

type Local = { normal: NormalEvent; entity: Row; kind: "execution" | "series" };

async function loadLocal(ctx: Ctx, link: Row): Promise<Local | null> {
  if (link.kind === "series") {
    const series = await getSeries(ctx, link.series_id);
    if (!series) return null;
    return {
      normal: seriesToNormal(series, await exdatesOf(ctx, series.id)),
      entity: series,
      kind: "series",
    };
  }
  if (!link.execution_id) return null;
  const exec = await getExecution(ctx, link.execution_id);
  if (!exec) return null;
  const sessions = sessionsOfExecution(exec);
  const session =
    sessions.find((s) => s.key === link.session_key) ??
    (link.session_key === "multi" ? sessions[0] : undefined);
  if (!session) return null;
  return { normal: executionToNormal(exec, session), entity: exec, kind: "execution" };
}

function snapshotOf(ev: GoogleEvent, mapped: FromGoogle) {
  return {
    etag: ev.etag ?? null,
    updated: ev.updated ?? null,
    title: mapped.normal.title,
    start: mapped.normal.allDay
      ? mapped.normal.startDate
      : `${mapped.normal.startDate} ${mapped.normal.startTime}`,
    end: mapped.normal.allDay
      ? mapped.normal.endDate
      : `${mapped.normal.endDate} ${mapped.normal.endTime}`,
    allDay: mapped.normal.allDay,
    location: mapped.normal.location,
    notes: mapped.normal.notes,
    cancelled: mapped.normal.cancelled,
    event: ev,
  };
}

function localSnapshot(n: NormalEvent) {
  return {
    title: n.title,
    start: n.allDay ? n.startDate : `${n.startDate} ${n.startTime}`,
    end: n.allDay ? n.endDate : `${n.endDate} ${n.endTime}`,
    allDay: n.allDay,
    location: n.location,
    notes: n.notes,
    cancelled: n.cancelled,
  };
}

// ---------------------------------------------------------------------------
// GOOGLE → NORTE
// ---------------------------------------------------------------------------

/** Cria um compromisso (ou série) no Norte a partir de um evento do Google. */
async function createLocal(
  ctx: Ctx,
  cal: Cal,
  ev: GoogleEvent,
  mapped: FromGoogle,
  remoteHash: string,
): Promise<void> {
  const n = mapped.normal;
  const readOnlyReason = isReadOnlyRole(cal.access_role)
    ? "agenda_somente_leitura"
    : mapped.unsupported
      ? "recorrencia_nao_suportada"
      : mapped.multiDay
        ? "multi_day"
        : null;
  const base = {
    user_id: ctx.conn.user_id,
    title: n.title,
    category: "generico",
    // Compromisso vindo de fora é fixo por padrão: ninguém o renegocia sozinho.
    rigid: true,
    weight: "leve",
    location: n.location,
    notes: n.notes,
    link: n.link,
    source: "external",
  };

  if (n.rule && !mapped.unsupported) {
    const series = await q<Row>(
      ctx.db
        .from("agenda_series")
        .insert({
          ...base,
          start_date: n.startDate,
          start_time: n.allDay ? null : n.startTime,
          end_time: n.allDay ? null : n.endTime,
          all_day: n.allDay,
          rule: n.rule,
          alerts: [],
        })
        .select()
        .single(),
    );
    for (const date of n.exdates)
      await ctx.db.from("agenda_series_exceptions").insert({
        user_id: ctx.conn.user_id,
        series_id: series.id,
        occurrence_date: date,
        kind: "removed",
      });
    await insertLink(ctx, cal, {
      series_id: series.id,
      kind: "series",
      external_event_id: ev.id,
      etag: ev.etag ?? null,
      synced_hash: remoteHash,
      origin: "external",
      read_only_reason: readOnlyReason,
    });
    bump(ctx, "criados_no_norte");
    return;
  }

  const first = mapped.sessions[0];
  const multi = mapped.multiDay;
  const exec = await q<Row>(
    ctx.db
      .from("executions")
      .insert({
        ...base,
        due_date: n.startDate,
        agenda_date: first?.date ?? n.startDate,
        start_time: first ? first.start : (n.startTime ?? ""),
        end_time: first?.end ?? null,
        all_day: n.allDay,
        status: "planejada",
        agenda_sessions: multi
          ? mapped.sessions.map((s, i) => ({
              id: `${ev.id}-${i}`,
              date: s.date,
              startTime: s.start,
              endTime: s.end ?? undefined,
            }))
          : null,
      })
      .select()
      .single(),
  );
  await insertLink(ctx, cal, {
    execution_id: exec.id,
    kind: "event",
    session_key: multi ? "multi" : `legacy-${exec.id}`,
    external_event_id: ev.id,
    etag: ev.etag ?? null,
    synced_hash: remoteHash,
    origin: "external",
    read_only_reason: readOnlyReason,
  });
  await logChange(ctx, {
    execution_id: exec.id,
    subject_title: n.title,
    kind: "scheduled",
    to_date: n.startDate,
    to_start: n.startTime,
    to_end: n.endTime,
    note: "google",
  });
  bump(ctx, "criados_no_norte");
}

/** Aplica ao Norte o conteúdo vindo do Google (o Norte não tinha mudanças próprias). */
async function applyRemoteToLocal(
  ctx: Ctx,
  link: Row,
  local: Local,
  ev: GoogleEvent,
  mapped: FromGoogle,
  remoteHash: string,
): Promise<void> {
  const n = mapped.normal;
  const today = todayIn(ctx);

  if (local.kind === "series") {
    const series = local.entity;
    await q(
      ctx.db
        .from("agenda_series")
        .update({
          title: n.title,
          start_date: n.startDate,
          start_time: n.allDay ? null : n.startTime,
          end_time: n.allDay ? null : n.endTime,
          all_day: n.allDay,
          rule: n.rule ?? series.rule,
          location: n.location,
          notes: n.notes,
          ...(n.link ? { link: n.link } : {}),
        })
        .eq("id", series.id)
        .select(),
    );
    // Exceções: as datas excluídas no Google + as ocorrências canceladas uma a uma.
    const cancelledInstances =
      (await q<Row[]>(
        ctx.db
          .from("agenda_external_links")
          .select("original_start")
          .eq("series_id", series.id)
          .eq("kind", "instance")
          .eq("remote_deleted", true),
      )) ?? [];
    const desired = new Set([
      ...n.exdates,
      ...cancelledInstances.map((r) => String(r.original_start)),
    ]);
    const current = new Set(await exdatesOf(ctx, series.id));
    for (const date of desired)
      if (!current.has(date))
        await ctx.db.from("agenda_series_exceptions").insert({
          user_id: ctx.conn.user_id,
          series_id: series.id,
          occurrence_date: date,
          kind: "removed",
        });
    for (const date of current)
      if (!desired.has(date))
        await ctx.db
          .from("agenda_series_exceptions")
          .delete()
          .eq("series_id", series.id)
          .eq("occurrence_date", date);
    // Cópias futuras ainda intocadas nascem de novo com o modelo atualizado.
    await ctx.db
      .from("executions")
      .delete()
      .eq("series_id", series.id)
      .eq("series_overridden", false)
      .eq("status", "planejada")
      .gte("series_occurrence_date", today);
  } else {
    const exec = local.entity;
    const sessions = sessionsOfExecution(exec);
    const session = sessions.find((s) => s.key === link.session_key) ?? sessions[0];
    const patch: Row = {
      title: n.title,
      location: n.location,
      notes: n.notes,
      all_day: n.allDay,
    };
    if (n.link) patch.link = n.link;
    if (mapped.multiDay) {
      patch.agenda_date = mapped.sessions[0].date;
      patch.start_time = mapped.sessions[0].start;
      patch.end_time = mapped.sessions[0].end;
      patch.agenda_sessions = mapped.sessions.map((s, i) => ({
        id: `${ev.id}-${i}`,
        date: s.date,
        startTime: s.start,
        endTime: s.end ?? undefined,
      }));
    } else {
      const next = mapped.sessions[0];
      if (Array.isArray(exec.agenda_sessions) && exec.agenda_sessions.length > 0) {
        patch.agenda_sessions = (exec.agenda_sessions as Row[]).map((s) =>
          String(s.id) === link.session_key
            ? { ...s, date: next.date, startTime: next.start, endTime: next.end ?? undefined }
            : s,
        );
      }
      patch.agenda_date = next.date;
      patch.start_time = next.start;
      patch.end_time = next.end;
      // O prazo acompanha a data quando eram a mesma coisa.
      if (session && exec.due_date === session.date) patch.due_date = next.date;
      if (session && (session.date !== next.date || session.start !== next.start)) {
        await logChange(ctx, {
          execution_id: exec.id,
          subject_title: n.title,
          kind: "moved",
          from_date: session.date,
          from_start: session.start,
          from_end: session.end,
          to_date: next.date,
          to_start: next.start,
          to_end: next.end,
          note: "google",
        });
      }
    }
    await q(ctx.db.from("executions").update(patch).eq("id", exec.id).select());
  }
  await updateLink(ctx, link.id, {
    etag: ev.etag ?? null,
    synced_hash: remoteHash,
    sync_state: "synced",
    conflict_at: null,
    remote_snapshot: null,
    local_snapshot: null,
    remote_deleted: false,
    last_error: null,
  });
  bump(ctx, "atualizados_no_norte");
}

async function markConflict(
  ctx: Ctx,
  link: Row,
  ev: GoogleEvent | null,
  mapped: FromGoogle | null,
  local: Local | null,
  remoteDeleted = false,
): Promise<void> {
  await updateLink(ctx, link.id, {
    sync_state: "conflict",
    conflict_at: ctx.now().toISOString(),
    // O etag mais recente do Google: se a pessoa escolher "manter o Norte",
    // a atualização parte dele.
    etag: ev?.etag ?? link.etag ?? null,
    remote_deleted: remoteDeleted,
    remote_snapshot: ev && mapped ? snapshotOf(ev, mapped) : { deleted: true },
    local_snapshot: local ? localSnapshot(local.normal) : null,
  });
  bump(ctx, "conflitos");
}

/** O evento do Google já tem vínculo: decide entre ignorar, aplicar ou marcar conflito. */
async function reconcileLinked(
  ctx: Ctx,
  link: Row,
  ev: GoogleEvent,
  mapped: FromGoogle,
  remoteHash: string,
): Promise<void> {
  // Nada mudou no Google desde a última sincronização (inclusive o "eco" do
  // que o próprio Norte enviou).
  if (link.synced_hash === remoteHash && link.sync_state !== "conflict") {
    if (link.etag !== (ev.etag ?? null)) await updateLink(ctx, link.id, { etag: ev.etag ?? null });
    return;
  }
  const local = await loadLocal(ctx, link);
  if (!local) return; // o Norte apagou: a fila de saída cuida do Google

  const localHash = normalHash(local.normal);
  // Evento que o Norte não representa por inteiro é só leitura: o Google manda.
  const authoritative = Boolean(link.read_only_reason) || link.access_role === "read";
  const localChanged =
    !authoritative && (link.synced_hash === null || localHash !== link.synced_hash);

  if (localHash === remoteHash) {
    await updateLink(ctx, link.id, {
      etag: ev.etag ?? null,
      synced_hash: remoteHash,
      sync_state: "synced",
      conflict_at: null,
      remote_snapshot: null,
      local_snapshot: null,
      last_error: null,
    });
    return;
  }
  if (!localChanged) return applyRemoteToLocal(ctx, link, local, ev, mapped, remoteHash);
  return markConflict(ctx, link, ev, mapped, local);
}

/** O Google apagou o evento. */
async function applyRemoteDelete(ctx: Ctx, link: Row | null): Promise<void> {
  if (!link) return;
  if (link.kind === "instance" && !link.execution_id) return;
  const local = await loadLocal(ctx, link);
  if (!local) {
    await ctx.db.from("agenda_external_links").delete().eq("id", link.id);
    return;
  }
  const readOnly = Boolean(link.read_only_reason) || link.access_role === "read";
  const changed =
    !readOnly && link.synced_hash !== null && normalHash(local.normal) !== link.synced_hash;
  if (changed) return markConflict(ctx, link, null, null, local, true);

  if (local.kind === "series") {
    const id = local.entity.id;
    // Ocorrências já vividas (concluídas) permanecem como histórico, soltas da série.
    await ctx.db
      .from("executions")
      .delete()
      .eq("series_id", id)
      .in("status", ["planejada", "perdida", "cancelada"]);
    await ctx.db.from("agenda_series").delete().eq("id", id);
  } else {
    await ctx.db.from("executions").delete().eq("id", local.entity.id);
  }
  await logChange(ctx, {
    execution_id: null,
    subject_title: local.normal.title,
    kind: "removed",
    from_date: local.normal.startDate,
    from_start: local.normal.startTime,
    note: "google",
  });
  bump(ctx, "removidos_no_norte");
}

function originalDateOf(ev: GoogleEvent, zone: string): string | null {
  const o = ev.originalStartTime;
  if (o?.date) return o.date;
  if (o?.dateTime) return dateAndTimeInZone(new Date(o.dateTime), zone).date;
  return null;
}

/** Uma exceção de série (evento com `recurringEventId`). */
async function applyInstance(ctx: Ctx, cal: Cal, ev: GoogleEvent, initial: boolean): Promise<void> {
  let master = await linkByEvent(ctx, cal.id, String(ev.recurringEventId));
  if (!master || master.kind !== "series") {
    // A exceção chegou antes da série: busca o mestre.
    try {
      const m = await ctx.api.getEvent(cal.google_calendar_id, String(ev.recurringEventId));
      await applyRemote(ctx, cal, m, initial);
      master = await linkByEvent(ctx, cal.id, String(ev.recurringEventId));
    } catch {
      return;
    }
  }
  if (!master || master.kind !== "series") return; // série não suportada: fica de fora
  const seriesId = master.series_id;
  const original = originalDateOf(ev, ctx.zone);
  if (!original) return;
  const existing = await linkByEvent(ctx, cal.id, ev.id);

  if (ev.status === "cancelled") {
    await q(
      ctx.db.from("agenda_series_exceptions").upsert(
        {
          user_id: ctx.conn.user_id,
          series_id: seriesId,
          occurrence_date: original,
          kind: "removed",
        },
        { onConflict: "series_id,occurrence_date" },
      ),
    );
    const override = await q<Row | null>(
      ctx.db
        .from("executions")
        .select("id")
        .eq("series_id", seriesId)
        .eq("series_occurrence_date", original)
        .maybeSingle(),
    );
    if (override) await ctx.db.from("executions").delete().eq("id", override.id);
    if (existing) {
      await updateLink(ctx, existing.id, {
        execution_id: null,
        remote_deleted: true,
        sync_state: "synced",
      });
    } else {
      await insertLink(ctx, cal, {
        series_id: seriesId,
        kind: "instance",
        external_event_id: ev.id,
        external_series_id: ev.recurringEventId,
        original_start: original,
        etag: ev.etag ?? null,
        remote_deleted: true,
        origin: "external",
      });
    }
    bump(ctx, "removidos_no_norte");
    return;
  }

  const mapped = googleToNormal(ev, ctx.zone);
  const remoteHash = normalHash(mapped.normal);
  if (existing && existing.execution_id) {
    return reconcileLinked(ctx, existing, ev, mapped, remoteHash);
  }

  // A exceção volta a existir: tira a marca de "removida".
  await ctx.db
    .from("agenda_series_exceptions")
    .delete()
    .eq("series_id", seriesId)
    .eq("occurrence_date", original);
  const series = await getSeries(ctx, seriesId);
  const n = mapped.normal;
  const first = mapped.sessions[0];
  let exec = await q<Row | null>(
    ctx.db
      .from("executions")
      .select("*")
      .eq("series_id", seriesId)
      .eq("series_occurrence_date", original)
      .maybeSingle(),
  );
  const fields = {
    title: n.title,
    agenda_date: first?.date ?? n.startDate,
    start_time: first ? first.start : (n.startTime ?? ""),
    end_time: first?.end ?? null,
    all_day: n.allDay,
    location: n.location,
    notes: n.notes,
    series_overridden: true,
  };
  if (exec) {
    await q(ctx.db.from("executions").update(fields).eq("id", exec.id).select());
  } else {
    exec = await q<Row>(
      ctx.db
        .from("executions")
        .insert({
          ...fields,
          user_id: ctx.conn.user_id,
          due_date: original,
          category: series?.category ?? "generico",
          rigid: series?.rigid ?? true,
          weight: "leve",
          status: "planejada",
          source: "external",
          series_id: seriesId,
          series_occurrence_date: original,
          label_id: series?.label_id ?? null,
          link: n.link,
        })
        .select()
        .single(),
    );
  }
  const readOnly = isReadOnlyRole(cal.access_role);
  if (existing) {
    await updateLink(ctx, existing.id, {
      execution_id: exec!.id,
      etag: ev.etag ?? null,
      synced_hash: remoteHash,
      remote_deleted: false,
      sync_state: "synced",
    });
  } else {
    await insertLink(ctx, cal, {
      execution_id: exec!.id,
      series_id: seriesId,
      kind: "instance",
      session_key: `legacy-${exec!.id}`,
      external_event_id: ev.id,
      external_series_id: ev.recurringEventId,
      original_start: original,
      etag: ev.etag ?? null,
      synced_hash: remoteHash,
      origin: "external",
      read_only_reason: readOnly ? "agenda_somente_leitura" : null,
    });
  }
  bump(ctx, "atualizados_no_norte");
}

/** Procura um compromisso/série do Norte que corresponda a este evento. */
async function findLocalMatch(
  ctx: Ctx,
  ev: GoogleEvent,
  mapped: FromGoogle,
  isSeries: boolean,
  initial: boolean,
): Promise<{ kind: "execution" | "series"; row: Row; sessionKey: string | null } | null> {
  const norteId = ev.extendedProperties?.private?.norteId;
  if (norteId) {
    // Criado pelo Norte: religa em vez de duplicar.
    if (ev.extendedProperties?.private?.norteKind === "series") {
      const row = await getSeries(ctx, norteId);
      if (row) return { kind: "series", row, sessionKey: null };
    } else {
      const row = await getExecution(ctx, norteId);
      if (row) {
        const keys = sessionsOfExecution(row).map((s) => s.key);
        const wanted = ev.extendedProperties?.private?.norteSession;
        const sessionKey = wanted && keys.includes(wanted) ? wanted : (keys[0] ?? null);
        if (sessionKey) return { kind: "execution", row, sessionKey };
      }
    }
  }
  if (!initial || isSeries || mapped.normal.cancelled) return null;
  // Primeira sincronização: o mesmo compromisso pode já existir nos dois lados,
  // sem vínculo. Mesmo título, dia e início = é o mesmo (e não se duplica).
  const n = mapped.normal;
  const rows =
    (await q<Row[]>(
      ctx.db
        .from("executions")
        .select("*")
        .eq("user_id", ctx.conn.user_id)
        .eq("agenda_date", n.startDate)
        .neq("status", "reagendada"),
    )) ?? [];
  const taken = new Set(
    (
      (await q<Row[]>(
        ctx.db.from("agenda_external_links").select("execution_id").eq("user_id", ctx.conn.user_id),
      )) ?? []
    ).map((l) => String(l.execution_id)),
  );
  const title = n.title.trim().toLowerCase();
  for (const row of rows) {
    if (taken.has(String(row.id)) || row.series_id) continue;
    if (String(row.title).trim().toLowerCase() !== title) continue;
    const start = String(row.start_time ?? "").slice(0, 5);
    if (n.allDay ? !row.all_day : start !== n.startTime) continue;
    const session = sessionsOfExecution(row)[0];
    if (session) return { kind: "execution", row, sessionKey: session.key };
  }
  return null;
}

/** Aplica UM evento recebido do Google. */
export async function applyRemote(
  ctx: Ctx,
  cal: Cal,
  ev: GoogleEvent,
  initial = false,
): Promise<void> {
  if (ev.recurringEventId) return applyInstance(ctx, cal, ev, initial);
  const link = await linkByEvent(ctx, cal.id, ev.id);
  if (ev.status === "cancelled") return applyRemoteDelete(ctx, link);

  const isSeries = Boolean(ev.recurrence?.length);
  const mapped = googleToNormal(ev, ctx.zone);
  const remoteHash = normalHash(mapped.normal);
  if (link) {
    // Evento que deixou de ser repetido (ou virou repetido): refaz o vínculo.
    return reconcileLinked(ctx, link, ev, mapped, remoteHash);
  }

  const match = await findLocalMatch(ctx, ev, mapped, isSeries, initial);
  if (match) {
    const created = await insertLink(ctx, cal, {
      execution_id: match.kind === "execution" ? match.row.id : null,
      series_id: match.kind === "series" ? match.row.id : null,
      kind: match.kind === "series" ? "series" : "event",
      session_key: match.sessionKey,
      external_event_id: ev.id,
      etag: ev.etag ?? null,
      // Ainda sem ponto de acordo: se os conteúdos divergem, vira conflito.
      synced_hash: null,
      origin: match.kind === "execution" && match.row.source === "external" ? "external" : "norte",
    });
    return reconcileLinked(ctx, created, ev, mapped, remoteHash);
  }
  if (mapped.normal.cancelled) return;
  return createLocal(ctx, cal, ev, mapped, remoteHash);
}

/** Puxa as mudanças de uma agenda do Google. */
export async function pullCalendar(
  ctx: Ctx,
  cal: Cal,
  opts: { initial?: boolean } = {},
): Promise<{ fullSync: boolean }> {
  const state = await q<Row | null>(
    ctx.db.from("google_calendar_sync_state").select("*").eq("calendar_id", cal.id).maybeSingle(),
  );
  const timeMin = new Date(ctx.now().getTime() - 90 * 86_400_000).toISOString();
  let fullSync = !state?.sync_token;
  let page;
  if (!fullSync) {
    try {
      page = await ctx.api.listEvents(cal.google_calendar_id, {
        syncToken: String(state!.sync_token),
      });
    } catch (error) {
      // 410: o token venceu. Recomeça do zero (e confere o que sumiu).
      if (error instanceof GoogleApiError && error.isGone) fullSync = true;
      else throw error;
    }
  }
  if (!page) page = await ctx.api.listEvents(cal.google_calendar_id, { timeMin });

  // Mestres primeiro, depois eventos simples, por fim as exceções das séries.
  const rank = (e: GoogleEvent) => (e.recurringEventId ? 2 : e.recurrence?.length ? 0 : 1);
  const ordered = [...page.events].sort((a, b) => rank(a) - rank(b));
  let hadError = false;
  for (const ev of ordered) {
    try {
      await applyRemote(ctx, cal, ev, Boolean(opts.initial));
    } catch (error) {
      // Um evento problemático não pode travar a agenda inteira — nem fazer a
      // mudança dele se perder: o token não avança e a próxima rodada tenta de novo.
      hadError = true;
      bump(ctx, "erros");
      ctx.stats.ultimo_erro_evento = 1;
      await ctx.db
        .from("google_calendars")
        .update({ last_error: error instanceof Error ? error.message.slice(0, 300) : "erro" })
        .eq("id", cal.id);
    }
  }

  // Sincronização completa de quem já tinha sincronizado antes (token vencido,
  // ou o Google não devolveu token): o que sumiu da lista foi apagado.
  if (fullSync && state && !hadError) {
    const seen = new Set(page.events.map((e) => e.id));
    const links =
      (await q<Row[]>(
        ctx.db
          .from("agenda_external_links")
          .select("*")
          .eq("calendar_id", cal.id)
          .in("kind", ["event", "series"]),
      )) ?? [];
    const today = todayIn(ctx);
    for (const link of links) {
      if (seen.has(String(link.external_event_id)) || link.remote_deleted) continue;
      const local = await loadLocal(ctx, link);
      // Só o que cairia dentro da janela consultada pode ser dado como apagado.
      if (local && local.normal.startDate >= addDaysISO(today, -90))
        await applyRemoteDelete(ctx, link);
    }
  }

  await ctx.db.from("google_calendar_sync_state").upsert(
    {
      calendar_id: cal.id,
      user_id: ctx.conn.user_id,
      // Com erro, o token antigo é mantido (ou nenhum): nada se perde.
      sync_token: hadError ? (state?.sync_token ?? null) : (page.nextSyncToken ?? null),
      ...(fullSync && !hadError ? { full_sync_at: ctx.now().toISOString() } : {}),
      updated_at: ctx.now().toISOString(),
    },
    { onConflict: "calendar_id" },
  );
  return { fullSync };
}

// ---------------------------------------------------------------------------
// NORTE → GOOGLE
// ---------------------------------------------------------------------------

async function pushCalendars(ctx: Ctx): Promise<Cal[]> {
  return ((await q<Cal[]>(
    ctx.db
      .from("google_calendars")
      .select("*")
      .eq("connection_id", ctx.conn.id)
      .eq("selected", true),
  )) ?? []) as Cal[];
}

const calOfLink = (cals: Cal[], link: Row) =>
  cals.find((c) => c.id === link.calendar_id) as Cal | undefined;

function targetCalendar(cals: Cal[]): Cal {
  const target = cals.find((c) => c.push_new_events && !isReadOnlyRole(c.access_role));
  if (!target)
    throw new SyncUserError(
      "Escolha uma agenda do Google para receber os eventos criados no Norte.",
    );
  return target;
}

async function findRemoteByNorteId(
  ctx: Ctx,
  cal: Cal,
  norteId: string,
  session: string | null,
): Promise<GoogleEvent | null> {
  try {
    const found = await ctx.api.findByPrivateProperty(cal.google_calendar_id, "norteId", norteId);
    return (
      found.find(
        (e) =>
          e.status !== "cancelled" &&
          (!session || e.extendedProperties?.private?.norteSession === session),
      ) ?? null
    );
  } catch {
    return null;
  }
}

/** Empurra para o Google o conteúdo de um vínculo existente (ou resolve o conflito). */
async function pushPatch(
  ctx: Ctx,
  cals: Cal[],
  link: Row,
  normal: NormalEvent,
  meta: { norteId: string; norteKind: string; session?: string },
  opts: { force?: boolean } = {},
): Promise<void> {
  const cal = calOfLink(cals, link);
  if (!cal) return; // agenda não está mais selecionada
  if (link.access_role === "read" || link.read_only_reason) return;
  if (link.sync_state === "conflict" && !opts.force) return; // espera a decisão da pessoa
  const localHash = normalHash(normal);
  if (!opts.force && localHash === link.synced_hash) return; // nada mudou: é só o eco

  const full = normalToGoogle(normal, ctx.zone, meta);
  // A fonte (link) só vai na criação; o resto é parcial para não apagar
  // convidados, lembretes e cor do evento no Google.
  const { source: _source, ...rest } = full;
  void _source;
  // PATCH mescla objetos: ao trocar entre "com hora" e "dia inteiro" é preciso
  // limpar os campos do formato antigo, senão o Google recebe os dois juntos.
  const payload = {
    ...rest,
    start: normal.allDay
      ? { ...rest.start, dateTime: null, timeZone: null }
      : { ...rest.start, date: null },
    end: normal.allDay
      ? { ...rest.end, dateTime: null, timeZone: null }
      : { ...rest.end, date: null },
  } as unknown as typeof rest;
  const body: Partial<GooglePayload> =
    normal.cancelled && link.kind === "instance" ? { status: "cancelled" as const } : payload;

  const attempt = async (etag?: string) =>
    ctx.api.patchEvent(cal.google_calendar_id, String(link.external_event_id), body, etag);
  try {
    let updated: GoogleEvent;
    try {
      updated = await attempt(opts.force ? undefined : String(link.etag ?? "") || undefined);
    } catch (error) {
      if (!(error instanceof GoogleApiError) || !error.isPreconditionFailed) throw error;
      // O evento mudou no Google depois do que o Norte viu.
      const remote = await ctx.api.getEvent(cal.google_calendar_id, String(link.external_event_id));
      const mapped = googleToNormal(remote, ctx.zone);
      const remoteHash = normalHash(mapped.normal);
      if (remoteHash === localHash) {
        await updateLink(ctx, link.id, {
          etag: remote.etag ?? null,
          synced_hash: localHash,
          sync_state: "synced",
        });
        return;
      }
      if (remoteHash === link.synced_hash) {
        // Só o etag andou (eco): repete com o etag novo.
        updated = await attempt(remote.etag);
      } else {
        await markConflict(ctx, link, remote, mapped, {
          normal,
          entity: {},
          kind: link.kind === "series" ? "series" : "execution",
        });
        return;
      }
    }
    await updateLink(ctx, link.id, {
      etag: updated.etag ?? null,
      synced_hash: localHash,
      sync_state: "synced",
      conflict_at: null,
      remote_snapshot: null,
      local_snapshot: null,
      remote_deleted: false,
      last_error: null,
    });
    bump(ctx, "atualizados_no_google");
  } catch (error) {
    if (error instanceof GoogleApiError && (error.isNotFound || error.isGone)) {
      // Apagado no Google enquanto o Norte tinha uma mudança nova.
      await markConflict(ctx, link, null, null, { normal, entity: {}, kind: "execution" }, true);
      return;
    }
    throw error;
  }
}

async function pushCreate(
  ctx: Ctx,
  cals: Cal[],
  normal: NormalEvent,
  meta: { norteId: string; norteKind: string; session?: string },
  linkBase: Row,
): Promise<void> {
  const cal = targetCalendar(cals);
  const payload = normalToGoogle(normal, ctx.zone, meta);
  // Se um envio anterior criou o evento mas não chegou a gravar o vínculo,
  // religa em vez de duplicar.
  const already = await findRemoteByNorteId(ctx, cal, meta.norteId, meta.session ?? null);
  const created = already ?? (await ctx.api.insertEvent(cal.google_calendar_id, payload));
  await insertLink(ctx, cal, {
    ...linkBase,
    external_event_id: created.id,
    etag: created.etag ?? null,
    synced_hash: normalHash(normal),
    origin: "norte",
    access_role: "write",
  });
  bump(ctx, "criados_no_google");
}

async function deleteRemote(ctx: Ctx, cals: Cal[], link: Row): Promise<void> {
  if (link.remote_deleted || link.access_role === "read" || link.read_only_reason) return;
  const googleCal = String(
    link.external_calendar_id ?? calOfLink(cals, link)?.google_calendar_id ?? "",
  );
  if (!googleCal) return;
  await ctx.api.deleteEvent(googleCal, String(link.external_event_id));
  bump(ctx, "removidos_no_google");
}

/** O compromisso do Norte pode ir para o Google? */
function eligibleExecution(ctx: Ctx, exec: Row, links: Row[]): boolean {
  if (exec.routine_id && !ctx.conn.push_routines && links.length === 0) return false;
  // Cópia ainda intocada de uma série: a série mestre já a representa.
  if (exec.series_id && !exec.series_overridden && links.length === 0) return false;
  return true;
}

async function pushExecution(ctx: Ctx, cals: Cal[], executionId: string): Promise<void> {
  const exec = await getExecution(ctx, executionId);
  if (!exec) return; // apagado depois: a operação `delete` cuida do Google
  const links = await linksOfExecution(ctx, executionId);
  if (!eligibleExecution(ctx, exec, links)) return;

  // Compromisso que é exceção de uma série: vira exceção no Google.
  if (exec.series_id && exec.series_overridden) return pushInstance(ctx, cals, exec, links);

  const sessions = sessionsOfExecution(exec);
  const keys = new Set(sessions.map((s) => s.key));
  // Sessões que saíram do compromisso: o evento correspondente sai do Google.
  for (const link of links) {
    if (link.kind !== "event" || link.session_key === "multi" || keys.has(String(link.session_key)))
      continue;
    await deleteRemote(ctx, cals, link);
    await ctx.db.from("agenda_external_links").delete().eq("id", link.id);
  }

  for (const session of sessions) {
    const link = links.find((l) => l.session_key === session.key && l.kind === "event");
    const normal = executionToNormal(exec, session);
    const meta = { norteId: String(exec.id), norteKind: "execution", session: session.key };

    if (exec.status === "cancelada") {
      // Cancelar no Norte = o evento deixa de existir no Google.
      if (link && !link.remote_deleted) {
        await deleteRemote(ctx, cals, link);
        await updateLink(ctx, link.id, { remote_deleted: true, synced_hash: normalHash(normal) });
      }
      continue;
    }
    if (link && link.remote_deleted && link.sync_state !== "conflict") {
      // Reaberto: recria no Google e troca o id do vínculo.
      await ctx.db.from("agenda_external_links").delete().eq("id", link.id);
      await pushCreate(ctx, cals, normal, meta, {
        execution_id: exec.id,
        kind: "event",
        session_key: session.key,
      });
      continue;
    }
    if (!link) {
      await pushCreate(ctx, cals, normal, meta, {
        execution_id: exec.id,
        kind: "event",
        session_key: session.key,
      });
      continue;
    }
    await pushPatch(ctx, cals, link, normal, meta);
  }
}

async function pushInstance(ctx: Ctx, cals: Cal[], exec: Row, links: Row[]): Promise<void> {
  const master = await linkOfSeries(ctx, String(exec.series_id));
  if (!master) throw new Error("A série ainda não está no Google; tentarei de novo.");
  if (master.access_role === "read") return;
  const cal = calOfLink(cals, master);
  if (!cal) return;
  const session = sessionsOfExecution(exec)[0];
  if (!session) return;
  const normal = executionToNormal(exec, session);
  const meta = { norteId: String(exec.id), norteKind: "execution", session: session.key };
  let link = links.find((l) => l.kind === "instance");

  if (!link) {
    // Descobre o evento da ocorrência no Google (ele já existe, só não foi alterado).
    const day = String(exec.series_occurrence_date);
    const found = await ctx.api.listInstances(
      cal.google_calendar_id,
      String(master.external_event_id),
      {
        timeMin: `${addDaysISO(day, -1)}T00:00:00Z`,
        timeMax: `${addDaysISO(day, 2)}T00:00:00Z`,
      },
    );
    const instance = found.find((e) => originalDateOf(e, ctx.zone) === day);
    if (!instance) return; // a regra não gera essa data no Google
    link = await insertLink(ctx, cal, {
      execution_id: exec.id,
      series_id: exec.series_id,
      kind: "instance",
      session_key: session.key,
      external_event_id: instance.id,
      external_series_id: master.external_event_id,
      original_start: day,
      etag: instance.etag ?? null,
      // Ponto de partida: a ocorrência como está no Google.
      synced_hash: normalHash(googleToNormal(instance, ctx.zone).normal),
      origin: "norte",
      access_role: "write",
    });
  }
  await pushPatch(ctx, cals, link, normal, meta);
}

async function pushSeries(ctx: Ctx, cals: Cal[], seriesId: string): Promise<void> {
  const series = await getSeries(ctx, seriesId);
  const link = await linkOfSeries(ctx, seriesId);
  if (!series) return;
  if (series.archived_at) {
    if (link) {
      await deleteRemote(ctx, cals, link);
      await ctx.db.from("agenda_external_links").delete().eq("id", link.id);
    }
    return;
  }
  const normal = seriesToNormal(series, await exdatesOf(ctx, seriesId));
  const meta = { norteId: String(series.id), norteKind: "series" };
  if (!link) return pushCreate(ctx, cals, normal, meta, { series_id: series.id, kind: "series" });
  if (link.remote_deleted && link.sync_state !== "conflict") {
    await ctx.db.from("agenda_external_links").delete().eq("id", link.id);
    return pushCreate(ctx, cals, normal, meta, { series_id: series.id, kind: "series" });
  }
  await pushPatch(ctx, cals, link, normal, meta);
}

const REPORT_AFTER_ATTEMPTS = 5;
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

/** Esvazia a fila de saída: manda ao Google o que mudou no Norte. */
export async function pushOutbox(ctx: Ctx): Promise<void> {
  const cals = await pushCalendars(ctx);
  const now = ctx.now();
  // Duas consultas evitam que itens em backoff ocupem o começo da fila e
  // escondam mudanças novas que já podem ser enviadas.
  const [fresh, retryable] = await Promise.all([
    q<Row[]>(
      ctx.db
        .from("agenda_sync_outbox")
        .select("*")
        .eq("user_id", ctx.conn.user_id)
        .is("next_attempt_at", null)
        .order("created_at", { ascending: true })
        .limit(300),
    ),
    q<Row[]>(
      ctx.db
        .from("agenda_sync_outbox")
        .select("*")
        .eq("user_id", ctx.conn.user_id)
        .lte("next_attempt_at", now.toISOString())
        .order("next_attempt_at", { ascending: true })
        .limit(300),
    ),
  ]);
  const rows = [...new Map([...(fresh ?? []), ...(retryable ?? [])].map((r) => [r.id, r])).values()]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, 300);
  // Séries antes das exceções que dependem delas.
  rows.sort((a, b) => (a.entity_type === b.entity_type ? 0 : a.entity_type === "series" ? -1 : 1));

  for (const row of rows) {
    try {
      if (row.op === "delete") {
        for (const link of (row.snapshot as Row[] | null) ?? [])
          await deleteRemote(ctx, cals, link);
      } else if (row.entity_type === "series") {
        await pushSeries(ctx, cals, String(row.entity_id));
      } else {
        await pushExecution(ctx, cals, String(row.entity_id));
      }
      // Só some da fila se ninguém mexeu de novo enquanto enviávamos.
      await ctx.db
        .from("agenda_sync_outbox")
        .delete()
        .eq("id", row.id)
        .eq("created_at", row.created_at);
    } catch (error) {
      const userError = error instanceof SyncUserError;
      const attempts = Number(row.attempts ?? 0) + 1;
      const delay = userError
        ? 24 * 60 * 60 * 1000
        : Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 10));
      bump(ctx, "erros_envio");
      await ctx.db
        .from("agenda_sync_outbox")
        .update({
          attempts,
          last_error: error instanceof Error ? error.message.slice(0, 300) : "erro",
          next_attempt_at: new Date(now.getTime() + delay).toISOString(),
          failed_at:
            userError || attempts >= REPORT_AFTER_ATTEMPTS
              ? (row.failed_at ?? now.toISOString())
              : null,
        })
        .eq("id", row.id);
      if (userError) ctx.stats.precisa_escolher_agenda = 1;
    }
  }

  // A fila é privada ao servidor; este resumo sem conteúdo de eventos permite
  // que a pessoa saiba que algo ficou pendente e tente novamente.
  const pending =
    (await q<Row[]>(
      ctx.db
        .from("agenda_sync_outbox")
        .select("attempts,last_error,failed_at")
        .eq("user_id", ctx.conn.user_id),
    )) ?? [];
  const failed = pending.filter((r) => Boolean(r.failed_at));
  await ctx.db
    .from("google_calendar_connections")
    .update({
      pending_sync_errors: failed.length,
      last_push_error: failed.at(-1)?.last_error ?? null,
    })
    .eq("id", ctx.conn.id);
}

/** Primeira conexão: coloca na fila o que o Norte já tem e ainda não foi ao Google. */
export async function enqueueBackfill(ctx: Ctx): Promise<number> {
  const from = addDaysISO(todayIn(ctx), -30);
  let count = 0;
  const execs =
    (await q<Row[]>(
      ctx.db
        .from("executions")
        .select("id, routine_id, series_id, series_overridden, status, agenda_date")
        .eq("user_id", ctx.conn.user_id)
        .gte("agenda_date", from),
    )) ?? [];
  for (const e of execs) {
    if (e.status === "reagendada" || e.status === "cancelada") continue;
    if (e.routine_id && !ctx.conn.push_routines) continue;
    if (e.series_id && !e.series_overridden) continue;
    await ctx.db
      .from("agenda_sync_outbox")
      .upsert(
        { user_id: ctx.conn.user_id, entity_type: "execution", entity_id: e.id, op: "upsert" },
        { onConflict: "entity_type,entity_id,op" },
      );
    count += 1;
  }
  const series =
    (await q<Row[]>(
      ctx.db
        .from("agenda_series")
        .select("id, source, archived_at")
        .eq("user_id", ctx.conn.user_id)
        .is("archived_at", null),
    )) ?? [];
  for (const s of series) {
    await ctx.db
      .from("agenda_sync_outbox")
      .upsert(
        { user_id: ctx.conn.user_id, entity_type: "series", entity_id: s.id, op: "upsert" },
        { onConflict: "entity_type,entity_id,op" },
      );
    count += 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Conflitos
// ---------------------------------------------------------------------------

/** A pessoa decidiu: `google` (o Google vence) ou `norte` (o Norte vence). */
export async function resolveConflict(
  ctx: Ctx,
  linkId: string,
  resolution: "google" | "norte",
): Promise<void> {
  const link = await q<Row | null>(
    ctx.db
      .from("agenda_external_links")
      .select("*")
      .eq("user_id", ctx.conn.user_id)
      .eq("id", linkId)
      .maybeSingle(),
  );
  if (!link || link.sync_state !== "conflict")
    throw new SyncUserError("Esse conflito já foi resolvido.");
  const cals = await pushCalendars(ctx);
  const cal = calOfLink(cals, link);
  if (!cal) throw new SyncUserError("A agenda deste evento não está mais sincronizada.");
  const local = await loadLocal(ctx, link);

  if (resolution === "google") {
    if (link.remote_deleted || !link.remote_snapshot || (link.remote_snapshot as Row).deleted) {
      // O Google apagou: o Norte também apaga.
      await updateLink(ctx, link.id, {
        sync_state: "synced",
        synced_hash: null,
        conflict_at: null,
      });
      await applyRemoteDelete(ctx, { ...link, sync_state: "synced", synced_hash: null });
      return;
    }
    const ev = (link.remote_snapshot as { event: GoogleEvent }).event;
    const mapped = googleToNormal(ev, ctx.zone);
    if (!local) return;
    await applyRemoteToLocal(ctx, link, local, ev, mapped, normalHash(mapped.normal));
    return;
  }

  // O Norte vence.
  if (!local) throw new SyncUserError("O compromisso do Norte não existe mais.");
  const meta = {
    norteId: String(local.entity.id),
    norteKind: local.kind === "series" ? "series" : "execution",
    session: String(link.session_key ?? ""),
  };
  if (link.remote_deleted) {
    // Apagado no Google: recria.
    await ctx.db.from("agenda_external_links").delete().eq("id", link.id);
    await pushCreate(ctx, cals, local.normal, meta, {
      execution_id: link.execution_id ?? null,
      series_id: link.series_id ?? null,
      kind: link.kind,
      session_key: link.session_key ?? null,
    });
    return;
  }
  await pushPatch(ctx, cals, link, local.normal, meta, { force: true });
}

export { normalHash, googleToNormal };
