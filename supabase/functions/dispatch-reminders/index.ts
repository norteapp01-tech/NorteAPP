// Edge Function — despacha lembretes vencidos como Web Push. Roda no
// agendador da própria plataforma (ver README ao lado), nunca a pedido do
// navegador: por isso não espera Authorization de usuário — verify_jwt =
// false em supabase/config.toml — e se protege com um segredo próprio
// (CRON_SECRET) em vez de aceitar qualquer chamada anônima.
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem automaticamente em
// toda Edge Function do projeto — não precisam ser configurados à mão.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@norteapp.com.br";

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (CRON_SECRET) {
    const provided = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), { status: 401 });
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Vencidos e ainda não avisados. `notified_at is null` é o que impede reenvio
  // se o cron rodar de novo antes do próximo minuto por qualquer motivo.
  const { data: due, error: dueError } = await admin
    .from("reminders")
    .select("id, user_id, text, remind_at")
    .lte("remind_at", new Date().toISOString())
    .is("notified_at", null)
    .eq("done", false);
  if (dueError) return new Response(JSON.stringify({ error: dueError.message }), { status: 500 });
  if (!due?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  let sent = 0;
  const errors: string[] = [];

  for (const reminder of due) {
    const { data: subs, error: subsError } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", reminder.user_id);
    if (subsError) {
      errors.push(`${reminder.id}: ${subsError.message}`);
      continue;
    }

    for (const sub of subs ?? []) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({ title: "Norte", body: reminder.text, url: "/agenda" }),
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // Dispositivo desinscrito ou expirado — a inscrição não serve mais.
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          errors.push(`${reminder.id}/${sub.id}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    await admin.from("reminders").update({ notified_at: new Date().toISOString() }).eq(
      "id",
      reminder.id,
    );
    sent++;
  }

  return new Response(JSON.stringify({ sent, errors }), { status: 200 });
});
