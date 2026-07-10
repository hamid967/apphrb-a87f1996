/* HBSpro Web Push service worker.
 * Handles `push` events and click-through navigation. Kept independent from
 * any app-shell service worker so we don't cache assets by accident.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = { title: "HBSpro", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "HBSpro";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/dashboard/inbox" },
    dir: "auto",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsArr) {
        try {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(target);
          }
          return;
        } catch (_e) {
          // try next
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
