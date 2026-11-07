import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });

test('installable app files and the push worker are served (#58)', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const path of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/push-sw.js']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test('without Firebase login the notification card stays hidden and settings fit (#58)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('p'); await page.getByLabel('新しいハウスの名前').fill('push');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#push-card')).toBeHidden();
  expect(await page.locator('#settings .drawer-inner').evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
});

// Exercise the settings UI and real service-worker registration without sending
// a notification or registering a test device with Firebase.
test('notification registration succeeds, and a failed save can be retried', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
    Notification.requestPermission = async () => 'granted';
  });
  await page.route('**/firebase_messaging.js*', route => route.fulfill({
    contentType: 'text/javascript', body: `
      export const isSupported = async () => true;
      export const getMessaging = app => {
        if (!app.options.messagingSenderId) throw new Error('missing sender ID');
        return app;
      };
      export const getToken = async (app, options) => {
        if (!options.serviceWorkerRegistration.active) throw new Error('worker not active');
        return 'test-device-token';
      };
    `,
  }));
  let saveFails = true;
  const saves = [];
  await page.route('**/api/notifications', route => {
    saves.push(route.request().postDataJSON());
    return route.fulfill({ status: saveFails ? 503 : 200, json: { enabled: !saveFails } });
  });
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('push-retry');
  await page.getByLabel('新しいハウスの名前').fill('notifications');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(async () => {
    const { client } = await import('/src/api.js');
    client.auth = { app: { options: { messagingSenderId: '324099635682' } }, currentUser: { getIdToken: async () => 'test' } };
    client.config.push = { vapid_key: 'test-public-key' };
  });
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  expect(await page.evaluate(async () => {
    const { pushState } = await import('/src/push.js');
    try { return await pushState(); } catch (e) { return e.stack; }
  })).toBe('ready');
  await expect(page.locator('#push-toggle')).toBeEnabled();
  await page.locator('#push-toggle').click();
  await expect(page.locator('#push-note')).toContainText('保存できませんでした');
  await expect(page.locator('#push-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('darupoyo-push'))).toBeNull();
  saveFails = false;
  await page.locator('#push-toggle').click();
  await expect(page.locator('#push-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#push-note')).toBeHidden();
  expect(saves).toHaveLength(2);
  expect(saves[1]).toMatchObject({ token: 'test-device-token', enabled: true });
  expect(await page.evaluate(() => localStorage.getItem('darupoyo-push'))).toBe('test-device-token');
});
