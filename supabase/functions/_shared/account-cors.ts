// CORS das funções de conta (excluir / resetar). Sem isto o navegador bloqueava a
// chamada e "Excluir conta" falhava no app.
const allowedOrigins = () =>
  [
    Deno.env.get("APP_URL"),
    ...(Deno.env.get("GOOGLE_ALLOWED_APP_ORIGINS") ?? "http://localhost:8080").split(","),
  ]
    .filter(Boolean)
    .map((o) => {
      try {
        return new URL(String(o).trim()).origin;
      } catch {
        return "";
      }
    })
    .filter(Boolean);

export function accountCors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const ok = origin && allowedOrigins().includes(origin);
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
