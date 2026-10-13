// Notificações push do Google Agenda (events.watch). O Google não manda JWT:
// o canal é validado por id + recurso + token secreto (comparado por hash).
import { makeDeps, runInBackground } from "../_shared/google/runtime.ts";
import { handleWebhook } from "../_shared/google/service.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const { status, work } = await handleWebhook(makeDeps(), req.headers);
  runInBackground(work);
  return new Response(null, { status });
});
