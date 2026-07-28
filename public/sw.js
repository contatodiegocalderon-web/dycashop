/* Service worker — notificações push com o app fechado / tela bloqueada */
/* v3: som de dinheiro também com ecrã bloqueado */
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
      const wantSound = data.playSound !== false;
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      let hasVisibleClient = false;
      for (const client of clientList) {
        if (client.visibilityState === "visible") {
          hasVisibleClient = true;
        }
        client.postMessage({
          type: "DYCASHOP_ADMIN_PUSH",
          title: data.title,
          body: data.body,
          url: data.url,
          // Com ecrã bloqueado a página fica hidden/frozen — o som vai pelo chime.
          playSound: wantSound && client.visibilityState === "visible",
        });
      }

      // Sem janela visível (bloqueado / app fechado): abre página mínima só para tocar o cash.
      if (wantSound && !hasVisibleClient && self.clients.openWindow) {
        try {
          await self.clients.openWindow("/chime.html");
        } catch {
          /* alguns browsers bloqueiam openWindow sem gesto */
        }
      }

      await self.registration.showNotification(data.title || "DYCASHOP", {
        body: data.body || "",
        icon: "/brand-logo.png",
        badge: "/brand-logo.png",
        data: { url: data.url || "/admin/pedidos" },
        tag: data.tag || "dycashop-admin",
        renotify: true,
        silent: false,
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
          const url = client.url || "";
          if (url.includes("/chime.html")) continue;
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
