import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
});
async function enter(page) {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, 'new features');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
test('account deletion is confirmed, removes data and returns to onboarding', async ({ page }) => {
  await enter(page);
  const prior = await page.evaluate(async () => { const { client } = await import('/src/api.js'); return {uid:client.uid, house:client.house}; });
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click(); await page.locator('#delete-account').click();
  await expect(page.locator('.delete-dialog [data-confirm]')).toBeDisabled();
  await page.locator('.delete-dialog [data-cancel]').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#delete-account').click(); await page.locator('.delete-dialog input').check();
  await page.locator('.delete-dialog [data-confirm]').click();
  await expect(page.locator('.onboarding')).toBeVisible();
  const response = await page.request.get('/api/houses/' + prior.house + '/dashboard', { headers: {Authorization: 'Bearer dev:' + prior.uid} });
  expect(response.status()).toBe(409);
  expect(await page.evaluate(() => localStorage.getItem('darupoyo-uid'))).not.toBe(prior.uid);
});
test('the entrance board opens けーじばん and the menu contains only three utilities', async ({ page }) => {
  await enter(page); await expect(page.locator('#open-menu')).toBeVisible();
  await expect(page.locator('#open-settings')).not.toBeVisible();
  await page.locator('#open-menu').click();
  await expect(page.locator('#utility-menu [data-menu-action]')).toHaveText(['マイページ','遊び方','ハウス切り替え']);
  await page.keyboard.press('Escape'); await expect(page.locator('#utility-menu')).not.toBeVisible();
  await page.locator('.scene-dot').nth(1).click(); await page.locator('#open-board').click();
  await expect(page.locator('#board-view')).toBeVisible(); await page.locator('.board-back').click(); await expect(page.locator('#house-view')).toBeVisible();
  await page.locator('#open-menu').click(); await page.locator('#open-howto').click(); await expect(page.locator('#howto-page')).toBeVisible();
});
