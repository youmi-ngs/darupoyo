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
