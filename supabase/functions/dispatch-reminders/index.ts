// Cron-only Web Push delivery. Requires migration 0069 and CRON_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webPush from "npm:web-push@3";

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Método inválido." }, { status: 405 });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) return Response.json({ error: "Despacho não configurado." }, { status: 503 });
  if (req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") !== secret)
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  const url = Deno.env.get("SUPABASE_URL"),
    role = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY"),
    privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!url || !role || !publicKey || !privateKey)
    return Response.json({ error: "Push não configurado." }, { status: 503 });
  try {
    webPush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@norteapp.com.br",
      publicKey,
      privateKey,
    );
  } catch {
    return Response.json({ error: "Configuração de push inválida." }, { status: 503 });
  }
  const admin = createClient(url, role);
  const now = new Date().toISOString();
  const { data: due, error } = await admin
    .from("reminders")
    .select("id,user_id,text,remind_at,origin")
    .lte("remind_at", now)
    .gte("remind_at", new Date(Date.now() - 86400000).toISOString())
    .is("notified_at", null)
    .eq("done", false)
    .or(`dispatch_claim_until.is.null,dispatch_claim_until.lt.${now}`)
    .or(`dispatch_retry_at.is.null,dispatch_retry_at.lte.${now}`)
    .order("remind_at")
    .limit(10);
  if (error)
    return Response.json({ error: "Não foi possível consultar os lembretes." }, { status: 500 });
  let sent = 0,
    failed = 0,
    noDevice = 0;
  const queue = [...(due ?? [])];
  async function worker() {
    while (queue.length) {
      const reminder = queue.shift()!;
      const token = crypto.randomUUID();
      const { data: claimed, error: claimError } = await admin
        .from("reminders")
        .update({
          dispatch_token: token,
          dispatch_claim_until: new Date(Date.now() + 300000).toISOString(),
        })
        .eq("id", reminder.id)
        .eq("done", false)
        .is("notified_at", null)
        .eq("remind_at", reminder.remind_at)
        .or(`dispatch_claim_until.is.null,dispatch_claim_until.lt.${now}`)
        .select("id")
        .maybeSingle();
      if (claimError) {
        failed++;
        continue;
      }
      if (!claimed) continue;
      let success = false,
        retryMs = 60000;
      try {
        const subscriptions = await admin
          .from("push_subscriptions")
          .select("id,endpoint,p256dh,auth")
          .eq("user_id", reminder.user_id);
        const receipts = await admin
          .from("push_delivery_receipts")
          .select("subscription_id")
          .eq("reminder_id", reminder.id);
        if (subscriptions.error || receipts.error) throw new Error("delivery_lookup");
        const devices = subscriptions.data ?? [];
        if (!devices.length) {
          noDevice++;
          retryMs = 3600000;
          continue;
        }
        const delivered = new Set((receipts.data ?? []).map((r) => r.subscription_id));
        let transientFailure = false,
          accepted = delivered.size;
        for (const device of devices) {
          if (delivered.has(device.id)) continue;
          const current = await admin
            .from("reminders")
            .select("done,remind_at,dispatch_token")
            .eq("id", reminder.id)
            .maybeSingle();
          if (
            current.error ||
            !current.data ||
            current.data.done ||
            current.data.remind_at !== reminder.remind_at ||
            current.data.dispatch_token !== token
          ) {
            transientFailure = true;
            break;
          }
          try {
            await webPush.sendNotification(
              { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
              JSON.stringify({
                title: "Norte",
                body: reminder.text,
                tag: `norte-reminder-${reminder.id}`,
                url: String(reminder.origin ?? "").startsWith("habit_") ? "/rotinas" : "/agenda",
              }),
              { timeout: 3000, TTL: 3600 },
            );
            const receipt = await admin
              .from("push_delivery_receipts")
              .upsert(
                { reminder_id: reminder.id, subscription_id: device.id },
                { onConflict: "reminder_id,subscription_id" },
              );
            if (receipt.error) transientFailure = true;
            else accepted++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              const removal = await admin.from("push_subscriptions").delete().eq("id", device.id);
              if (removal.error) transientFailure = true;
            } else transientFailure = true;
          }
        }
        success = accepted > 0 && !transientFailure;
        if (!success) failed++;
      } catch {
        failed++;
      } finally {
        const saved = await admin
          .from("reminders")
          .update({
            dispatch_token: null,
            dispatch_claim_until: null,
            dispatch_retry_at: success ? null : new Date(Date.now() + retryMs).toISOString(),
            ...(success ? { notified_at: new Date().toISOString() } : {}),
          })
          .eq("id", reminder.id)
          .eq("dispatch_token", token)
          .eq("done", false)
          .eq("remind_at", reminder.remind_at)
          .select("id");
        if (saved.error) failed++;
        else if (success && saved.data?.length) sent++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));
  return Response.json({ sent, failed, noDevice }, { status: failed ? 207 : 200 });
});
