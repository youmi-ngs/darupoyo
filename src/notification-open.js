// Delivery is retained by the worker until the target detail has actually opened.
export function listenNotificationOpens(open) {
  let ready = false, pending = null, running = false;
  const handled = new Set();
  const worker = async () => navigator.serviceWorker?.controller || (await navigator.serviceWorker?.getRegistration('/'))?.active;
  const ack = async id => (await worker())?.postMessage({type:'darupoyo-notification-ack', id});
  async function flush() {
    if (!ready || running || !pending) return;
    const target = pending; pending = null;
    if (handled.has(target.id)) { void ack(target.id).catch(() => {}); return; }
    running = true;
    try {
      if (await open(target.link)) { handled.add(target.id); await ack(target.id).catch(() => {}); }
    } finally { running = false; if (pending) void flush(); }
  }
  const receive = target => {
    if (!target?.link || !target.id) return;
    const url = new URL(target.link, location.origin);
    if (url.origin !== location.origin) return;
    pending = target; void flush();
  };
  const read = () => { if (!document.hidden) void worker().then(w => w?.postMessage({type:'darupoyo-notification-read'})).catch(() => {}); };
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'darupoyo-notification-open') receive(event.data);
  });
  window.addEventListener('darupoyo:entered', () => {
    ready = true;
    const url = new URL(location.href);
    if (url.hash.includes('post=')) receive({id:url.searchParams.get('notification') || url.hash,link:url.href});
    void flush(); read();
  });
  window.addEventListener('pageshow', read);
  window.addEventListener('focus', read);
  document.addEventListener('visibilitychange', read);
  return link => receive({id:crypto.randomUUID(),link});
}
