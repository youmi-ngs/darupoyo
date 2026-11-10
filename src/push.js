// Phone notifications (#58): this device's FCM token goes to the Backend, which sends
// friend clears and the 19:00 nudge in the user's gal voice. Works only with Firebase login.
import { api, client } from './api.js';

const SW = '/push-sw.js';
const KEY = 'darupoyo-push';

const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const remember = (value) => { try { value ? localStorage.setItem(KEY, value) : localStorage.removeItem(KEY); } catch {} };
export const pushOn = () => { try { return Boolean(localStorage.getItem(KEY)); } catch { return false; } };

// 'ready' | 'install' (iPhone: add to home screen first) | 'blocked' | 'unsupported'
export async function pushState() {
  if (!client.auth || !client.config?.push?.vapid_key) return 'unsupported';
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) return ios() && !installed() ? 'install' : 'unsupported';
  const { isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return ios() && !installed() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return 'ready';
}

async function messaging() {
  const { getMessaging, getToken } = await import('firebase/messaging');
  const registration = await navigator.serviceWorker.register(SW, { scope: '/' });
  await navigator.serviceWorker.ready;
  const m = getMessaging(client.auth.app);
  return { m, token: () => getToken(m, { vapidKey: client.config.push.vapid_key, serviceWorkerRegistration: registration }) };
}

export async function enablePush(gal) {
  if (await Notification.requestPermission() !== 'granted') throw new Error('通知が許可されませんでした。スマホの設定から許可してね');
  const { token } = await messaging();
  const value = await token();
  await api('/notifications', { token: value, enabled: true, gal }, 'PUT');
  remember(value);
}

export async function disablePush() {
  let value = null; try { value = localStorage.getItem(KEY); } catch {}
  remember(null);
  if (!value || !client.auth) return;
  await api('/notifications', { token: value, enabled: false }, 'PUT').catch(() => {});
  try { const { deleteToken } = await import('firebase/messaging'); await deleteToken((await messaging()).m); } catch {}
}

// The gal that speaks in notifications follows the settings choice.
export function syncPushGal(gal) {
  if (client.auth && pushOn()) api('/notifications', { gal }, 'PUT').catch(() => {});
}

// While the app is open, the service worker hands notifications to the page instead.
export function listenInApp(show) {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.getRegistration('/').then(registration => registration?.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (event) => { if (event.data?.type === 'darupoyo-push') show(event.data.body, event.data.link); });
}
