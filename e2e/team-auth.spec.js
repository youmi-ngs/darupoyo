import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';

// Simulate only the Firebase SDK identity. Exercise the real local API/storage.
// Backend token-verification behavior is covered by test_api.py.
test('Google sign-in with memory storage keeps team polling and logout working', async ({ page }) => {
  let dashboards = 0;
  page.on('request', request => { if (request.url().includes('/dashboard')) dashboards++; });
  await page.route('**/api/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({ json: { ...config, auth_mode: 'firebase', data_backend: 'memory', firebase: { apiKey: 'test', appId: 'test', projectId: 'test' } } });
  });
  await page.route(/\/src\/api\.js(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    let source = await response.text();
    source = source.replace(/import \{[^}]+\} from ["'][^"']*firebase(?:\/|_)app[^"']*["'];/, "import { initializeApp } from '/__test/firebase.js';")
      .replace(/import \{[^}]+\} from ["'][^"']*firebase(?:\/|_)auth[^"']*["'];/, "import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, connectAuthEmulator } from '/__test/firebase.js';")
      .replace(/import \{[^}]+\} from ["'][^"']*firebase(?:\/|_)firestore[^"']*["'];/, "import { getFirestore, doc, collection, onSnapshot, connectFirestoreEmulator } from '/__test/firebase.js';");
    await route.fulfill({ response, body: source });
  });
  await page.route('**/__test/firebase.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    const uid = sessionStorage.getItem('test-google-uid') || crypto.randomUUID();
    sessionStorage.setItem('test-google-uid', uid);
    const auth = { currentUser: null };
    export const initializeApp = () => ({});
    export const getAuth = () => auth;
    export class GoogleAuthProvider {}
    export async function signInWithPopup() { auth.currentUser = { uid, displayName: 'Tester', getIdToken: async () => 'dev:' + uid }; }
    export function onAuthStateChanged(auth, callback) { queueMicrotask(() => callback(auth.currentUser)); return () => {}; }
    export async function signOut() { auth.currentUser = null; }
    export function getFirestore() { throw new Error('Memory mode must not connect to Firestore'); }
    export const connectAuthEmulator = () => {}, connectFirestoreEmulator = () => {};
    export const doc = getFirestore, collection = getFirestore, onSnapshot = getFirestore;
  ` }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  await expect(page.getByLabel('あなたの名前')).toHaveValue('Tester');
  await page.getByRole('button',{name:'次へ',exact:true}).click();
  await setHouseName(page, 'Google team test');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  const initial = dashboards;
  await expect.poll(() => dashboards, { timeout: 6000 }).toBeGreaterThan(initial);
  await page.evaluate(async () => { const { logout } = await import('/src/api.js'); await logout(); });
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();
  await expect(page.getByLabel('あなたの名前')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();
  await expect(page.getByLabel('あなたの名前')).toHaveCount(0);
});
