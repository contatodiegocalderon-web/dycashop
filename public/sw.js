/* Service worker — notificações push com o app fechado / tela bloqueada */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "DYCASHOP",
    body: "Nova atualização no admin.",
    url: "/admin/pedidos",
    tag: "dycashop-admin",
    playSound: true,
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      /* ignore */
    }
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage({
          type: "DYCASHOP_ADMIN_PUSH",
          title: data.title,
          body: data.body,
          url: data.url,
          playSound: data.playSound !== false,
        });
      }

      await self.registration.showNotification(data.title || "DYCASHOP", {
        body: data.body || "",
        icon: "/brand-logo.png",
        badge: "/brand-logo.png",
        data: { url: data.url || "/admin/pedidos" },
        tag: data.tag || "dycashop-admin",
        renotify: true,
        silent: false,
        // Vibração tipo "dinheiro" (Android / PWA)
        vibrate: [80, 40, 80, 40, 160, 60, 220],
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/admin/pedidos";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(target);
            }
            return undefined;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
        return undefined;
      })
  );
});
