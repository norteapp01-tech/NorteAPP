// Service worker do Norte — só existe pra receber push. Sem cache de asset,
// sem estratégia offline: isso é responsabilidade do dev server/build normal,
// não deste arquivo. Fica em public/ (raiz do domínio) porque o escopo padrão
// de um service worker é o diretório onde ele está servido.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Norte", body: "Você tem um lembrete." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // payload não veio em JSON — mantém o texto padrão em vez de falhar a notificação.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url || "/agenda" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/agenda";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
