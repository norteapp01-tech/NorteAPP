#!/usr/bin/env node
// Diagnóstico da publicação do Google Agenda: confere, SEM autenticação e sem
// tocar em dados, se as Edge Functions estão no ar e com os segredos cadastrados.
//
//   node scripts/check-google-calendar-deploy.mjs
//
// Lê VITE_SUPABASE_URL do .env. Não usa nem imprime nenhum segredo.
import fs from "node:fs";

const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const base = (process.env.SUPABASE_URL ?? env.match(/VITE_SUPABASE_URL=(.*)/)?.[1] ?? "").replace(
  /"/g,
  "",
);
if (!base) {
  console.error("Defina SUPABASE_URL ou VITE_SUPABASE_URL no .env.");
  process.exit(2);
}

let failed = 0;
const check = async (label, fn) => {
  try {
    const [ok, detail] = await fn();
    console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failed += 1;
  } catch (error) {
    console.log(`✗ ${label} — ${error.message}`);
    failed += 1;
  }
};
const fn = (name) => `${base}/functions/v1/${name}`;

await check(
  "google-calendar está publicada e com os segredos (recusa quem não está logado)",
  async () => {
    const res = await fetch(fn("google-calendar"), { method: "POST", body: "{}" });
    if (res.status === 404)
      return [false, "não publicada (404). Rode: supabase functions deploy google-calendar"];
    if (res.status === 500)
      return [false, "publicada, mas falta algum segredo (a função cai ao ler o ambiente)"];
    return [res.status === 401, `respondeu ${res.status}`];
  },
);

await check(
  "google-calendar-oauth recusa retorno com state inválido (e devolve para o app)",
  async () => {
    const res = await fetch(`${fn("google-calendar-oauth")}/callback?code=x&state=invalido`, {
      redirect: "manual",
    });
    if (res.status === 404) return [false, "não publicada (404)"];
    const location = res.headers.get("location") ?? "";
    return [res.status === 302 && location.includes("google=error"), `${res.status} → ${location}`];
  },
);

await check("google-calendar-webhook recusa chamadas sem os cabeçalhos do Google", async () => {
  const res = await fetch(fn("google-calendar-webhook"), { method: "POST" });
  if (res.status === 404) return [false, "não publicada (404)"];
  return [res.status === 400, `respondeu ${res.status}`];
});

await check("google-calendar-cron recusa chamadas sem o segredo do cron", async () => {
  const res = await fetch(fn("google-calendar-cron"), { method: "POST" });
  if (res.status === 404) return [false, "não publicada (404)"];
  return [res.status === 401, `respondeu ${res.status}`];
});

console.log(
  failed === 0
    ? "\nTudo certo: pode conectar o Google Agenda pelo app."
    : `\n${failed} verificação(ões) falharam.`,
);
process.exit(failed === 0 ? 0 : 1);
