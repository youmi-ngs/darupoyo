import { initializeApp } from 'firebase/app';
import { setBusy } from './busy.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, onAuthStateChanged, signOut, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, query, orderBy, limit, connectFirestoreEmulator } from 'firebase/firestore';

export const client = { uid: '', house: '', config: null, auth: null };
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
function loadImage(id) {
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
function button(label, action, parent) {
  const b = document.createElement('button'); b.className = 'btn btn-main'; b.textContent = label;
  b.onclick = async () => { setBusy(b, true); try { await action(); } catch (e) { parent.querySelector('[role=status]').textContent = e.message; } finally { setBusy(b, false); b.disabled = false; } }; parent.append(b); return b;
}
export async function start(onUpdate, onError) {
  update = onUpdate; report = onError;
  client.config = await config();
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
  const dialog = document.createElement('dialog'); dialog.className = 'onboarding'; dialog.setAttribute('aria-label', 'だるぽよへようこそ');
  // #133: opening the app first shows a short loading screen; the welcome appears only
  // when the person has to sign in or choose a house.
  dialog.classList.add('is-loading'); dialog.setAttribute('aria-label', 'だるぽよ 読み込み中');
  dialog.innerHTML = '<h2>だるぽよ</h2><p class="onboarding-welcome" hidden>今日の「できた」を、みんなのお部屋に。</p><p class="loading-row onboarding-loading">よみこみ中…</p><p role="status" aria-live="polite"></p>';
  const welcome = () => {
    dialog.classList.remove('is-loading'); dialog.setAttribute('aria-label', 'だるぽよへようこそ');
    dialog.querySelector('h2').textContent = 'だるぽよへようこそ';
    dialog.querySelector('.onboarding-welcome').hidden = false; dialog.querySelector('.onboarding-loading').hidden = true;
  };
  dialog.addEventListener('cancel', e => e.preventDefault()); document.body.append(dialog); dialog.showModal();
  if (client.auth && !client.auth.currentUser) welcome();
  if (client.auth && !client.auth.currentUser) await new Promise(resolve => button('Googleでログイン', async () => { await signInWithPopup(client.auth, new GoogleAuthProvider()); resolve(); }, dialog));
  client.uid = client.auth?.currentUser?.uid || client.uid;
  dialog.querySelectorAll('button').forEach(b => b.remove());
  if (mockFetch) dialog.querySelector('[role=status]').textContent = 'モックで動いています（Backendなし）：記録はこのブラウザにだけ残ります';
  else if (client.config.data_backend === 'memory') dialog.querySelector('[role=status]').textContent = 'チームテスト用：記録はサーバーを再起動すると消えます';
  const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
  const me = await api('/me');
  if (me.deletion_pending) {
    welcome();
    dialog.querySelector('[role=status]').textContent = 'アカウント削除が途中です。再開して残りのデータを削除してください。';
    button('削除を再開', deleteAccount, dialog);
    return;
  }
  const houses = await api('/houses');
  const items = houses.items || houses;
  const enter = async id => { client.house = id; await new Promise((resolve, reject) => { refresh({ onPaint: resolve }).then(resolve, reject); }); write('darupoyo-house-' + client.uid, id); dialog.close(); dialog.remove(); subscribe(); window.dispatchEvent(new Event('darupoyo:entered')); };
  if (!invite) {
    const saved = read('darupoyo-house-' + client.uid);
    if (items.some(h => h.id === saved)) { await enter(saved); return; }
  }
  welcome();
  if (!invite) {
    items.forEach(h => button(h.name + 'に入る', () => enter(h.id), dialog));
  }
  const name = document.createElement('input'); name.placeholder = 'あなたの名前'; name.setAttribute('aria-label', 'あなたの名前'); name.maxLength = 40; name.value = client.auth?.currentUser?.displayName || ''; dialog.append(name);
  // One field: a new house name, or an invite code after tapping 招待コードで入る.
  let joining = Boolean(invite);
  const field = document.createElement('input'); dialog.append(field);
  const main = button('', async () => {
    if (!name.value.trim() || !field.value.trim()) throw new Error(joining ? '名前と招待コードを入力してください' : '名前を入力してください');
    const h = await api(joining ? '/join' : '/houses', joining ? { token: field.value.trim(), display_name: name.value.trim() } : { name: field.value.trim(), display_name: name.value.trim() });
    await enter(h.id);
    if (joining) { if (invite) history.replaceState(null, '', location.pathname); window.dispatchEvent(new Event('darupoyo:joined')); }
  }, dialog);
  const swap = document.createElement('button'); swap.type = 'button'; swap.className = 'onboarding-swap'; dialog.append(swap);
  const setMode = join => {
    joining = join;
    field.placeholder = join ? '招待コード' : '新しいハウスの名前'; field.setAttribute('aria-label', field.placeholder);
    field.maxLength = join ? 200 : 60; field.autocapitalize = join ? 'characters' : 'sentences'; field.autocomplete = 'off';
    main.textContent = join ? '招待に参加する' : 'ハウスを作る';
    swap.textContent = join ? '新しくハウスを作る' : '招待コードで入る';
  };
  swap.onclick = () => { field.value = ''; dialog.querySelector('[role=status]').textContent = ''; setMode(!joining); field.focus(); };
  setMode(joining); if (invite) field.value = invite;
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
    remove('darupoyo-uid', area); remove('darupoyo-house-' + client.uid, area); remove('darupoyo-push', area);
  }
  images.forEach(URL.revokeObjectURL); images.clear();
  if (client.auth) await signOut(client.auth);
  location.reload();
}
