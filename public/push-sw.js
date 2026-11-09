// Shows だるぽよ notifications sent by the Backend through Firebase Cloud Messaging (data-only web push).
// If the app is open and visible, the page shows it as an in-app message instead.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const data = payload.data || payload;
  const title = data.title || 'だるぽよ';
  const body = data.body || '';
  const link = data.link || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => w.visibilityState === 'visible');
    if (open) { open.postMessage({ type: 'darupoyo-push', title, body, link }); return; }
    await self.registration.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'darupoyo', renotify: true, data: { link } });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find((w) => new URL(w.url).origin === self.location.origin);
    const destination = new URL(link, self.location.origin);
    if (destination.origin !== self.location.origin) return;
    if (app) { await app.navigate(destination.href); await app.focus(); return; }
    await self.clients.openWindow(destination.href);
  })());
});
