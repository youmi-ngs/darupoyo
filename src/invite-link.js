const key = 'darupoyo-pending-invite';

// Capture before asynchronous authentication; private browsing may deny storage.
export function captureInvite(url, storage) {
  const current = new URL(url);
  const explicit = current.searchParams.get('invite') || new URLSearchParams(current.hash.slice(1)).get('invite');
  try {
    if (explicit) storage?.setItem(key, explicit);
    return explicit || storage?.getItem(key) || null;
  } catch { return explicit || null; }
}

export function clearInvite(url, storage) {
  try { storage?.removeItem(key); } catch {}
  const current = new URL(url);
  current.searchParams.delete('invite');
  const hash = new URLSearchParams(current.hash.slice(1));
  if (hash.has('invite')) { hash.delete('invite'); current.hash = hash.toString(); }
  return current.pathname + current.search + current.hash;
}

export function inviteLink(url, code) {
  const current = new URL(url);
  current.search = ''; current.hash = '';
  current.searchParams.set('invite', code);
  return current.href;
}
