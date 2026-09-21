import { savePushSubscription, removePushSubscription } from "./reminders-store";

/**
 * Ativação de push — só pode nascer de um clique direto da pessoa (permissão
 * do navegador é bloqueada silenciosamente se pedida sem gesto do usuário).
 * Por isso isto nunca é chamado pelo agente sozinho: o card de notificação
 * (AgentCard.tsx) e as Configurações só oferecem o botão; quem aciona é
 * sempre quem está com o dedo na tela.
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function bufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export async function registerPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported())
    return { ok: false, reason: "Notificações não suportadas neste navegador." };

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidPublicKey) return { ok: false, reason: "Notificações ainda não configuradas no app." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Permissão de notificação negada." };

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  await savePushSubscription({
    endpoint: subscription.endpoint,
    p256dh: json.keys?.p256dh ?? bufferToBase64(subscription.getKey("p256dh")),
    auth: json.keys?.auth ?? bufferToBase64(subscription.getKey("auth")),
  });

  return { ok: true };
}

export async function unregisterPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await removePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
