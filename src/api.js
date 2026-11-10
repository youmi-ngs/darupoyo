import { createWelcome } from './welcome-ui.js';
import { captureInvite, clearInvite } from './invite-link.js';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, onAuthStateChanged, signOut, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, query, orderBy, limit, connectFirestoreEmulator } from 'firebase/firestore';

export const client = { uid: '', house: '', config: null, auth: null, houses: [] };
// All Backend calls go through here. VITE_API_BASE_URL set → that Backend.
// Unset → the Vite proxy (/api); in development, if no Backend answers (or VITE_API_MOCK=1),
// the in-browser mock in mock.js answers instead.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const CAN_MOCK = import.meta.env.DEV && !import.meta.env.VITE_API_BASE_URL;
let mockFetch = null;
// Storage can be missing (private mode, blocked site data); the app still runs without it.
// The mock keeps the user per tab so two tabs of one browser can be two housemates.
const userStore = () => mockFetch ? 'sessionStorage' : 'localStorage';
const read = (key, area = 'localStorage') => { try { return window[area].getItem(key); } catch { return null; } };
const write = (key, value, area = 'localStorage') => { try { window[area].setItem(key, value); } catch {} };
const remove = (key, area = 'localStorage') => { try { window[area].removeItem(key); } catch {} };
const send = (url, init) => mockFetch ? mockFetch(url, init) : fetch(url, init);
async function config() {
  if (CAN_MOCK && import.meta.env.VITE_API_MOCK) return useMock();
  try {
    const response = await fetch(API_BASE + '/config');
    if (response.ok) return response.json();
    if (!CAN_MOCK) throw new Error('Backendに接続できません');
  } catch (e) { if (!CAN_MOCK) throw new Error('Backendに接続できません'); }
  return useMock();
}
async function useMock() {
  if (!import.meta.env.DEV) throw new Error('Backendに接続できません'); // keeps the mock out of production builds
  ({ mockFetch } = await import('./mock.js'));
  return (await mockFetch(API_BASE + '/config')).json();
}
let update, report, timer, subscriptions = [], refreshing, refreshQueued = false, watchedDay = '', stopDay = null;
// Photos: object URL once loaded; the promise while loading (#98: each photo is fetched once).
const images = new Map(), loadingImages = new Map();
const token = () => client.auth ? client.auth.currentUser.getIdToken() : Promise.resolve('dev:' + client.uid);
export async function api(path, body, method = 'POST') {
  const response = await send(API_BASE + path, {
    method: body === undefined && method === 'POST' ? 'GET' : method,
    headers: { Authorization: 'Bearer ' + await token(), ...(body instanceof Blob ? { 'Content-Type': body.type } : body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body instanceof Blob ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'ログインし直してください' : response.status === 409 ? '状態が更新されました。もう一度試してください' : response.status === 404 ? 'グループや招待が見つかりません。期限も確認してください' : '保存できませんでした（' + response.status + '）。接続と入力を確認してください');
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response.blob();
}
export const houseApi = (path, body, method) => api('/houses/' + client.house + path, body, method);
export function loadImage(id) {
  if (!id || images.has(id)) return Promise.resolve(images.get(id) || null);
  if (!loadingImages.has(id)) loadingImages.set(id, houseApi('/media/' + id).then(blob => {
    const url = URL.createObjectURL(blob); images.set(id, url); loadingImages.delete(id); return url;
  }, error => { loadingImages.delete(id); throw error; }));
  return loadingImages.get(id);
}
// A few downloads at a time, so many photos do not queue behind each other on a phone.
async function loadImages(ids, parallel = 6) {
  const queue = [...new Set(ids)].filter(id => id && !images.has(id));
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length) await loadImage(queue.shift()).catch(() => null);
  }));
}
export async function refresh({ onPaint } = {}) {
  if (!client.house) return;
  if (refreshing) { refreshQueued = true; return refreshing; }
  refreshing = (async () => {
    const dashboard = await houseApi('/dashboard');
    watchDay(dashboard.state.day);
    client.houses = client.houses.map(h => h.id === dashboard.house.id ? {...h, name:dashboard.house.name} : h);
    const posts = []; let cursor;
    do { const page = await houseApi('/posts?limit=100' + (cursor ? '&before=' + cursor : '')); posts.push(...page.items); cursor = page.next_cursor; } while (cursor);
    const poses = Object.values(dashboard.state.poses), members = Object.values(dashboard.house.members);
    // Profile photos (#96) are house media like any other photo.
    const fill = () => {
      posts.forEach(p => { p.image = images.get(p.media_id) || null; });
      poses.forEach(p => { p.image = images.get(p.media_id) || null; });
      members.forEach(m => { m.avatar = images.get(m.avatar_media_id) || null; });
    };
    // #98: show the house at once with the photos already here, then add the new ones.
    fill(); update({ ...dashboard, posts }); onPaint?.();
    const missing = [...posts, ...poses].map(p => p.media_id).concat(members.map(m => m.avatar_media_id)).filter(id => id && !images.has(id));
    if (missing.length) { await loadImages(missing); fill(); update({ ...dashboard, posts }); }
  })().finally(() => { refreshing = null; if (refreshQueued) { refreshQueued = false; void refresh().catch(report); } });
  return refreshing;
}
export async function start(onUpdate, onError) {
  update = onUpdate; report = onError;
  let inviteStorage;
  try { inviteStorage = window.sessionStorage; } catch {}
  const invite = captureInvite(location.href, inviteStorage);
  const welcome = createWelcome(), dialog = welcome.dialog;
  client.houses = [];
  client.config = await config();
  // Google authorizes localhost, not its numeric loopback alias. Keep invite links.
  const localGoogleOrigin = import.meta.env.DEV && import.meta.env.VITE_GOOGLE_LOCAL_ORIGIN;
  if (client.config.auth_mode === 'firebase' && localGoogleOrigin && location.hostname === '127.0.0.1' && location.origin !== localGoogleOrigin) {
    location.replace(new URL(location.pathname + location.search + location.hash, localGoogleOrigin).href);
    return;
  }
  if (client.config.auth_mode === 'firebase') {
    if (!client.config.firebase.apiKey || !client.config.firebase.appId) throw new Error('Firebase Web設定が必要です');
    const app = initializeApp(client.config.firebase); client.auth = getAuth(app);
    if (client.config.data_backend !== 'memory') client.db = getFirestore(app);
    if (import.meta.env.VITE_FIREBASE_EMULATORS) {
      // Local Emulator Suite (npm run dev:emu); never set for a real deploy.
      connectAuthEmulator(client.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      if (client.db) connectFirestoreEmulator(client.db, '127.0.0.1', 8085);
    }
    await new Promise(resolve => { const unsub = onAuthStateChanged(client.auth, () => { unsub(); resolve(); }); });
  } else {
    client.uid = read('darupoyo-uid', userStore()) || crypto.randomUUID(); write('darupoyo-uid', client.uid, userStore());
  }
  if (client.auth && !client.auth.currentUser) await welcome.login(() => signInWithPopup(client.auth, new GoogleAuthProvider()));
  client.uid = client.auth?.currentUser?.uid || client.uid;
  const me = await api('/me');
  if (me.deletion_pending) {
    welcome.deletion(deleteAccount);
    return;
  }
  const houses = await api('/houses');
  const items = houses.items || houses;
  client.houses = items;
  const enter = async id => { client.house = id; await new Promise((resolve, reject) => { refresh({ onPaint: resolve }).then(resolve, reject); }); write('darupoyo-house-' + client.uid, id); if (invite) history.replaceState(null, '', clearInvite(location.href, inviteStorage)); await welcome.leave(); subscribe(); window.dispatchEvent(new Event('darupoyo:entered')); };
  if (!invite) {
    const requested = new URLSearchParams(location.hash.slice(1)).get('house');
    if (requested && items.some(h => h.id === requested)) { await enter(requested); return; }
    const saved = read('darupoyo-house-' + client.uid);
    if (items.some(h => h.id === saved)) { await enter(saved); return; }
  }
  const nameKey = 'darupoyo-name-' + client.uid;
  const rememberedName = read(nameKey, userStore());
  welcome.choose({ items, invite, initialName: rememberedName || client.auth?.currentUser?.displayName || '',
    askName: !rememberedName && !items.length,
    saveName: name => write(nameKey, name, userStore()), enter,
    submit: async (joining, value, name) => {
      const h = await api(joining ? '/join' : '/houses', joining ? { token: value, display_name: name } : { name: value, display_name: name });
      client.houses = [...client.houses.filter(item => item.id !== h.id), h];
      write(nameKey, name, userStore());
      if (!joining) { welcome.created(h.name || value, () => enter(h.id)); return; }
      await enter(h.id);
      if (joining) window.dispatchEvent(new Event('darupoyo:joined'));
    },
  });
}
const sync = () => refresh().catch(report);
// The first snapshot is the state we just loaded; only later changes need a refresh (#98).
const changes = () => { let first = true; return () => { if (first) { first = false; return; } sync(); }; };
// #98: watch today's record only (not every day of the house); a new day re-subscribes.
function watchDay(day) {
  if (!client.db || !day || day === watchedDay) return;
  stopDay?.(); watchedDay = day;
  stopDay = onSnapshot(doc(client.db, 'houses', client.house, 'days', day), changes(), report);
}
function subscribe() {
  if (client.auth) subscriptions.push(onAuthStateChanged(client.auth, user => { if (!user) location.reload(); }));
  if (client.db) {
    subscriptions.push(onSnapshot(doc(client.db, 'houses', client.house), changes(), report));
    // New posts and reactions/comments on recent ones; older ones are picked up by the minute refresh.
    subscriptions.push(onSnapshot(query(collection(client.db, 'houses', client.house, 'posts'), orderBy('id', 'desc'), limit(30)), changes(), report));
    subscriptions.push(() => { stopDay?.(); stopDay = null; watchedDay = ''; });
  }
  // Also handles the 04:00 day boundary and recovery from missed notifications. Local mode polls.
  timer = setInterval(() => { if (!document.hidden) sync(); }, client.db ? 60000 : 2500);
  window.addEventListener('focus', sync);
}
// Forget the remembered house and reopen the house list (stays signed in).
export function switchHouse(houseId) {
  if (typeof houseId === 'string' && houseId) write('darupoyo-house-' + client.uid, houseId);
  else remove('darupoyo-house-' + client.uid);
  location.reload();
}
export async function logout() {
  clearInterval(timer); subscriptions.forEach(stop => stop()); client.house = '';
  images.forEach(URL.revokeObjectURL); images.clear();
  if (client.auth) await signOut(client.auth);
  else remove('darupoyo-uid', userStore());
  location.reload();
}
// Short code shown as K7PM-3QXD; the Backend accepts it in any case, with or without the hyphen.
export async function inviteCode() {
  const { token } = await houseApi('/invites', {});
  return token.length === 8 ? token.slice(0, 4) + '-' + token.slice(4) : token;
}


export async function deleteAccount() {
  // Called directly from the final confirmation button, preserving popup activation.
  if (client.auth?.currentUser) {
    await reauthenticateWithPopup(client.auth.currentUser, new GoogleAuthProvider());
  }
  await api('/me', undefined, 'DELETE');
  clearInterval(timer); subscriptions.forEach(stop => stop()); subscriptions = [];
  for (const area of ['localStorage', 'sessionStorage']) {
    remove('darupoyo-uid', area); remove('darupoyo-name-' + client.uid, area); remove('darupoyo-house-' + client.uid, area); remove('darupoyo-push', area);
  }
  images.forEach(URL.revokeObjectURL); images.clear();
  if (client.auth) await signOut(client.auth);
  location.reload();
}
