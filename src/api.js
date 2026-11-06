import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator } from 'firebase/auth';
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
    method: body === undefined ? 'GET' : method,
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
    const app = initializeApp(client.config.firebase); client.auth = getAuth(app); client.db = getFirestore(app);
    if (import.meta.env.VITE_FIREBASE_EMULATORS) {
      // Local Emulator Suite (npm run dev:emu); never set for a real deploy.
      connectAuthEmulator(client.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(client.db, '127.0.0.1', 8085);
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
  if (!client.auth) dialog.querySelector('[role=status]').textContent = mockFetch ? 'モックで動いています（Backendなし）：記録はこのブラウザにだけ残ります' : 'ローカル開発モード：記録はBackendを再起動すると消えます';
  const invite = new URLSearchParams(location.hash.slice(1)).get('invite');
  const houses = await api('/houses');
  const items = houses.items || houses;
  const enter = async id => { client.house = id; await refresh(); write('darupoyo-house-' + client.uid, id); dialog.close(); dialog.remove(); subscribe(); };
  if (!invite) {
    const saved = read('darupoyo-house-' + client.uid);
    if (items.some(h => h.id === saved)) { await enter(saved); return; }
    items.forEach(h => button(h.name + 'に入る', () => enter(h.id), dialog));
  }
  const name = document.createElement('input'); name.placeholder = 'あなたの名前'; name.setAttribute('aria-label', 'あなたの名前'); name.maxLength = 40; name.value = client.auth?.currentUser?.displayName || ''; dialog.append(name);
  const field = document.createElement('input'); field.placeholder = invite ? '招待コード' : '新しいハウスの名前'; field.setAttribute('aria-label', field.placeholder); field.maxLength = invite ? 200 : 60; field.value = invite || ''; dialog.append(field);
  button(invite ? '招待に参加する' : 'ハウスを作る', async () => {
    if (!name.value.trim() || !field.value.trim()) throw new Error('名前を入力してください');
    const h = await api(invite ? '/join' : '/houses', invite ? { token: field.value.trim(), display_name: name.value.trim() } : { name: field.value.trim(), display_name: name.value.trim() });
    await enter(h.id); if (invite) history.replaceState(null, '', location.pathname);
  }, dialog);
}
function subscribe() {
  const sync = () => refresh().catch(report);
  if (client.db) {
    subscriptions.push(onAuthStateChanged(client.auth, user => { if (!user) location.reload(); }));
    subscriptions.push(onSnapshot(doc(client.db, 'houses', client.house), sync, report));
    subscriptions.push(onSnapshot(collection(client.db, 'houses', client.house, 'days'), sync, report));
    subscriptions.push(onSnapshot(collection(client.db, 'houses', client.house, 'posts'), sync, report));
  }
  // Also handles midnight and recovery from missed notifications. Local mode polls.
  timer = setInterval(() => { if (!document.hidden) sync(); }, client.db ? 60000 : 2500);
  window.addEventListener('focus', sync);
}
export async function logout() {
  clearInterval(timer); subscriptions.forEach(stop => stop()); client.house = '';
  images.forEach(URL.revokeObjectURL); images.clear();
  if (client.auth) await signOut(client.auth);
  else remove('darupoyo-uid', userStore());
  location.reload();
}
export async function inviteLink() {
  const result = await houseApi('/invites', {});
  // Fragments never reach the HTTP server/access log or Referer header.
  const url = new URL(location.origin); url.hash = new URLSearchParams({invite:result.token}).toString();
  return url.href;
}
