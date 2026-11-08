import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page, name = 'もち') {
  await page.goto('/'); await setWelcomeName(page, name); await setHouseName(page, 'words');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
async function openDarupoyo(page) {
  await page.locator('.scene-dot').nth(2).click();
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button', { name: /^だるぽよ/ }).click();
}

test('だるぽよ alone can be shared, and its words never mention what was not done (#142 #136)', async ({ page }) => {
  await enter(page);
  await page.locator('.scene-dot').nth(2).click(); await page.locator('[data-chore="meal"]').click();
  await expect(page.locator('.darupoyo-choice small')).toHaveText('きょうはサボる');
  await page.getByRole('button', { name: /^だるぽよ/ }).click();
  await expect(page.locator('.darupoyo-dialog')).not.toContainText('できなかった');
  const share = page.getByRole('button', { name: 'きょーゆー' });
  await expect(share).toBeEnabled();
  await share.click();
  await expect(page.getByText('だるぽよ、記録かんりょ〜')).toBeVisible();
  await expect(page.locator('.darupoyo-dialog')).not.toContainText('できなかった');
  await page.getByRole('button', { name: 'けーじばんを見る', exact: true }).click();
  await expect(page.locator('#board-view')).toBeVisible();
  await expect(page.locator('.pin-grid .pin-darupoyo')).toHaveCount(1);
  await expect(page.locator('.pin-grid .pin-darupoyo')).toContainText('ごはん、だるぽよ');
});

test('a share in progress shows a spinner on its button (#144)', async ({ page }) => {
  await enter(page);
  let release;
  await page.route('**/api/houses/*/darupoyo', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise(r => { release = r; });
    await route.continue();
  });
  await openDarupoyo(page);
  await page.getByRole('button', { name: 'きょーゆー' }).click();
  const busy = page.locator('.darupoyo-dialog .is-busy');
  await expect(busy).toHaveText('共有しています…');
  await expect(busy).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(page.getByText('だるぽよ、記録かんりょ〜')).toBeVisible();
});

test('opening the app again shows a short loading screen, not the welcome (#133)', async ({ page }) => {
  await enter(page);
  let release;
  await page.route('**/api/houses/*/dashboard', async route => { if (release === undefined) await new Promise(r => { release = r; }); await route.continue(); });
  await page.reload();
  const screen = page.locator('.onboarding');
  await expect(screen).toHaveClass(/is-loading/);
  await expect(screen.locator('.onboarding-loading')).toHaveText('よみこみ中…');
  await expect(screen).not.toContainText('ようこそ');
  await expect(screen.getByLabel('あなたの名前')).toHaveCount(0);
  expect(await screen.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none'); // no blue ring around the box
  release();
  await expect(page.locator('.onboarding')).toHaveCount(0);
});

test('a first visit still gets the welcome with the house form (#133)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.onboarding h2')).toHaveText('なまえおしえて〜');
  await expect(page.locator('.onboarding')).not.toHaveClass(/is-loading/);
  await expect(page.getByLabel('あなたの名前')).toBeVisible();
});
