// Verificação periódica de segurança (chamada a cada poucos minutos pelo banco).
// Cobre o que um webhook perdeu e renova canais perto de vencer.
// Autenticada por um segredo que só existe no banco (google_sync_internal).
import { makeDeps } from "../_shared/google/runtime.ts";
import { runCron } from "../_shared/google/service.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const result = await runCron(makeDeps(), req.headers.get("x-cron-secret"));
  return new Response(JSON.stringify({ processed: result.processed }), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
