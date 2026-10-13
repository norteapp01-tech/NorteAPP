// Retorno do Google depois do consentimento:
//   GET /functions/v1/google-calendar-oauth/callback?code=...&state=...
//
// Este pedido NÃO tem sessão do Norte (vem do Google). O `state` assinado, de
// uso único, diz quem iniciou; os tokens ficam guardados sob um bilhete que só
// o navegador da mesma pessoa, já logada, confirma depois.
import { makeDeps } from "../_shared/google/runtime.ts";
import { handleOAuthCallback } from "../_shared/google/service.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method !== "GET" || !url.pathname.endsWith("/callback"))
    return new Response("Not found", { status: 404 });
  const deps = makeDeps();
  const { redirect } = await handleOAuthCallback(deps, {
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    error: url.searchParams.get("error"),
  });
  return new Response(null, {
    status: 302,
    headers: { Location: redirect, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
});
