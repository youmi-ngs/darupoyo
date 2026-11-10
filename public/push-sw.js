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

// Keep the tapped destination until the page acknowledges opening it. iOS may
// resume a suspended PWA without completing WindowClient.navigate().
const TARGET_CACHE = 'darupoyo-notification-target';
const TARGET_KEY = '/__pending-notification';
let writes = Promise.resolve();
const mutateTarget = action => {
  const next = writes.then(action); writes = next.catch(() => {}); return next;
};
const readTarget = async () => {
  const response = await (await caches.open(TARGET_CACHE)).match(TARGET_KEY);
  return response ? response.json() : null;
};
self.addEventListener('message', event => {
  if (event.data?.type === 'darupoyo-notification-read') event.waitUntil((async () => {
    const target = await readTarget();
    if (target) event.source?.postMessage({type:'darupoyo-notification-open', ...target});
  })());
  if (event.data?.type === 'darupoyo-notification-ack') event.waitUntil(mutateTarget(async () => {
    const target = await readTarget();
    if (target?.id === event.data.id) await (await caches.open(TARGET_CACHE)).delete(TARGET_KEY);
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL(event.notification.data?.link || '/', self.location.origin);
    if (destination.origin !== self.location.origin) return;
    const id = Date.now().toString();
    destination.searchParams.set('notification', id);
    const target = {id, link:destination.href};
    await mutateTarget(async () => (await caches.open(TARGET_CACHE)).put(TARGET_KEY, new Response(JSON.stringify(target))));
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const app = windows.find(w => new URL(w.url).origin === self.location.origin);
    if (app) {
      // Send before focusing as well as after: either can wake a suspended page.
      app.postMessage({type:'darupoyo-notification-open', ...target});
      await app.focus();
      app.postMessage({type:'darupoyo-notification-open', ...target});
      return;
    }
    await self.clients.openWindow(destination.href);
  })());
});
