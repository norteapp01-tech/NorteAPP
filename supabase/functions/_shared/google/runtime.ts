// Ligações específicas do Deno (variáveis de ambiente, cliente do Supabase).
// Todo o resto da integração é código puro em ./service.ts e é testado a parte.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Deps, Env } from "./service.ts";

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Segredo ausente: ${name}`);
  return value;
}

export function loadEnv(): Env {
  const supabaseUrl = required("SUPABASE_URL");
  const appUrl = required("APP_URL");
  return {
    clientId: required("GOOGLE_CALENDAR_CLIENT_ID"),
    clientSecret: required("GOOGLE_CALENDAR_CLIENT_SECRET"),
    redirectUri: required("GOOGLE_CALENDAR_REDIRECT_URI"),
    stateSecret: required("GOOGLE_CALENDAR_STATE_SECRET"),
    encryptionKey: required("GOOGLE_TOKEN_ENCRYPTION_KEY"),
    appUrl,
    // Origens extras (separadas por vírgula) — ex.: o ambiente local de desenvolvimento.
    allowedOrigins: (Deno.env.get("GOOGLE_ALLOWED_APP_ORIGINS") ?? "http://localhost:8080")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    webhookAddress: `${supabaseUrl}/functions/v1/google-calendar-webhook`,
  };
}

/** Cliente com a service role: ignora o RLS. Só roda aqui no servidor, e todo
 * acesso a dados filtra pelo `user_id` da pessoa já autenticada. */
export function adminClient() {
  return createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function makeDeps(): Deps {
  return {
    db: adminClient(),
    fetch: (input, init) => fetch(input, init),
    env: loadEnv(),
    now: () => new Date(),
  };
}

/** CORS só para origens conhecidas. */
export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = [env.appUrl, ...env.allowedOrigins].map((o) => new URL(o).origin);
  const ok = origin && allowed.includes(origin);
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

/** Termina o trabalho depois de responder (webhooks respondem rápido ao Google). */
export function runInBackground(work: Promise<unknown> | undefined) {
  if (!work) return;
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
}
