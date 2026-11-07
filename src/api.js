import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, onAuthStateChanged, signOut, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, connectFirestoreEmulator } from 'firebase/firestore';

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
let update, report, timer, subscriptions = [], refreshing, refreshQueued = false, images = new Map();
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
async function imageUrl(id) {
  if (!id) return null;
  if (!images.has(id)) images.set(id, await houseApi('/media/' + id).then(URL.createObjectURL));
  return images.get(id);
}
export async function refresh() {
  if (!client.house) return;
  if (refreshing) { refreshQueued = true; return refreshing; }
  refreshing = (async () => {
    const dashboard = await houseApi('/dashboard');
    const posts = []; let cursor;
    do { const page = await houseApi('/posts?limit=100' + (cursor ? '&before=' + cursor : '')); posts.push(...page.items); cursor = page.next_cursor; } while (cursor);
    await Promise.all(posts.map(async p => { p.image = await imageUrl(p.media_id); }));
    for (const pose of Object.values(dashboard.state.poses)) pose.image = await imageUrl(pose.media_id);
    // Profile photos (#96) are house media like any other photo.
    await Promise.all(Object.values(dashboard.house.members).map(async m => { m.avatar = await imageUrl(m.avatar_media_id).catch(() => null); }));
    update({ ...dashboard, posts });
  })().finally(() => { refreshing = null; if (refreshQueued) { refreshQueued = false; void refresh().catch(report); } });
  return refreshing;
}
function button(label, action, parent) {
  const b = document.createElement('button'); b.className = 'btn btn-main'; b.textContent = label;
  b.onclick = async () => { b.disabled = true; try { await action(); } catch (e) { parent.querySelector('[role=status]').textContent = e.message; } finally { b.disabled = false; } }; parent.append(b); return b;
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
  dialog.innerHTML = '<h2>だるぽよへようこそ</h2><p>今日の「できた」を、みんなのお部屋に。</p><p role="status" aria-live="polite"></p>';
  dialog.addEventListener('cancel', e => e.preventDefault()); document.body.append(dialog); dialog.showModal();
  if (client.auth && !client.auth.currentUser) await new Promise(resolve => button('Googleでログイン', async () => { await signInWithPopup(client.auth, new GoogleAuthProvider()); resolve(); }, dialog));
  client.uid = client.auth?.currentUser?.uid || client.uid;
  dialog.querySelectorAll('button').forEach(b => b.remove());
  if (mockFetch) dialog.querySelector('[role=status]').textContent = 'モックで動いています（Backendなし）：記録はこのブラウザにだけ残ります';
  else if (client.config.data_backend === 'memory') dialog.querySelector('[role=status]').textContent = 'チームテスト用：記録はサーバーを再起動すると消えます';
  const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
  const me = await api('/me');
  if (me.deletion_pending) {
    dialog.querySelector('[role=status]').textContent = 'アカウント削除が途中です。再開して残りのデータを削除してください。';
    button('削除を再開', deleteAccount, dialog);
    return;
  }
  const houses = await api('/houses');
  const items = houses.items || houses;
  const enter = async id => { client.house = id; await refresh(); write('darupoyo-house-' + client.uid, id); dialog.close(); dialog.remove(); subscribe(); window.dispatchEvent(new Event('darupoyo:entered')); };
  if (!invite) {
    const saved = read('darupoyo-house-' + client.uid);
    if (items.some(h => h.id === saved)) { await enter(saved); return; }
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
function subscribe() {
  const sync = () => refresh().catch(report);
  if (client.auth) subscriptions.push(onAuthStateChanged(client.auth, user => { if (!user) location.reload(); }));
  if (client.db) {
    subscriptions.push(onSnapshot(doc(client.db, 'houses', client.house), sync, report));
    subscriptions.push(onSnapshot(collection(client.db, 'houses', client.house, 'days'), sync, report));
    subscriptions.push(onSnapshot(collection(client.db, 'houses', client.house, 'posts'), sync, report));
  }
  // Also handles the 04:00 day boundary and recovery from missed notifications. Local mode polls.
  timer = setInterval(() => { if (!document.hidden) sync(); }, client.db ? 60000 : 2500);
  window.addEventListener('focus', sync);
}
// Forget the remembered house and reopen the house list (stays signed in).
export function switchHouse() {
  remove('darupoyo-house-' + client.uid);
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
