// Ações do Google Agenda chamadas pelo app (autenticadas pela sessão da pessoa).
//
// Nunca devolve tokens nem segredos. Erros inesperados saem como mensagem
// genérica; o detalhe fica só no log do servidor (sem dados sensíveis).
import { adminClient, corsHeaders, loadEnv, makeDeps } from "../_shared/google/runtime.ts";
import {
  ServiceError,
  completeConnection,
  disconnect,
  listCalendars,
  resolveConflictAction,
  selectCalendars,
  startOAuth,
  syncConnection,
} from "../_shared/google/service.ts";

const json = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

/** Remove do que volta para o navegador qualquer coluna sensível. */
function publicCalendar(row: Record<string, unknown>) {
  return {
    id: row.id,
    google_calendar_id: row.google_calendar_id,
    summary: row.summary,
    background_color: row.background_color,
    access_role: row.access_role,
    is_primary: row.is_primary,
    selected: row.selected,
    push_new_events: row.push_new_events,
    sync_status: row.sync_status,
    last_synced_at: row.last_synced_at,
    last_error: row.last_error,
    webhook_status: row.webhook_status,
  };
}

Deno.serve(async (req) => {
  const env = loadEnv();
  const cors = corsHeaders(req.headers.get("origin"), env);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." }, cors);

  // Quem está pedindo: a sessão do Norte (JWT) é a única fonte da identidade.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sem autenticação.", code: "unauthenticated" }, cors);
  const { data, error: authError } = await adminClient().auth.getUser(token);
  if (authError || !data.user)
    return json(401, { error: "Sessão inválida.", code: "unauthenticated" }, cors);
  const userId = data.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Pedido inválido." }, cors);
  }

  const deps = makeDeps();
  try {
    switch (body.action) {
      case "oauth-start": {
        const origin =
          typeof body.origin === "string" ? body.origin : (req.headers.get("origin") ?? undefined);
        return json(
          200,
          await startOAuth(deps, userId, origin, data.user.email ?? undefined),
          cors,
        );
      }
      case "oauth-complete": {
        if (typeof body.ticket !== "string" || body.ticket.length > 200)
          return json(400, { error: "Bilhete inválido.", code: "ticket_invalid" }, cors);
        const timeZone = typeof body.timeZone === "string" ? body.timeZone : undefined;
        return json(200, await completeConnection(deps, userId, body.ticket, timeZone), cors);
      }
      case "list-calendars":
        return json(
          200,
          { calendars: (await listCalendars(deps, userId)).map(publicCalendar) },
          cors,
        );
      case "select-calendars": {
        const selections = Array.isArray(body.selections) ? body.selections : [];
        if (selections.length > 100) return json(400, { error: "Muitas agendas." }, cors);
        const rows = await selectCalendars(
          deps,
          userId,
          selections.map((s: Record<string, unknown>) => ({
            id: String(s.id),
            selected: typeof s.selected === "boolean" ? s.selected : undefined,
            pushNewEvents: typeof s.pushNewEvents === "boolean" ? s.pushNewEvents : undefined,
          })),
          {
            pushRoutines: typeof body.pushRoutines === "boolean" ? body.pushRoutines : undefined,
            timeZone: typeof body.timeZone === "string" ? body.timeZone : undefined,
          },
        );
        return json(200, { calendars: rows.map(publicCalendar) }, cors);
      }
      case "sync": {
        const summary = await syncConnection(deps, userId, {
          trigger: body.trigger === "push" ? "push" : "manual",
          timeZone: typeof body.timeZone === "string" ? body.timeZone : undefined,
        });
        return json(
          200,
          { stats: summary.stats, skipped: Boolean(summary.skipped), error: summary.error ?? null },
          cors,
        );
      }
      case "resolve-conflict": {
        const resolution =
          body.resolution === "google" || body.resolution === "norte" ? body.resolution : null;
        if (typeof body.linkId !== "string" || !resolution)
          return json(400, { error: "Pedido inválido." }, cors);
        await resolveConflictAction(deps, userId, body.linkId, resolution);
        return json(200, { ok: true }, cors);
      }
      case "disconnect":
        return json(200, await disconnect(deps, userId), cors);
      default:
        return json(400, { error: "Ação desconhecida." }, cors);
    }
  } catch (error) {
    if (error instanceof ServiceError)
      return json(error.status, { error: error.message, code: error.code }, cors);
    // Só o tipo do erro vai para o log: nada de corpo de resposta, token ou segredo.
    console.error("google-calendar:", error instanceof Error ? error.name : "erro");
    return json(
      500,
      { error: "Não foi possível concluir. Tente novamente.", code: "internal" },
      cors,
    );
  }
});
