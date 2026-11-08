import { test, expect } from '@playwright/test';

test('each section keeps its own draft and a failed save can be retried', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('もち');
  await page.getByLabel('新しいハウスの名前').fill('温玉');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await page.locator('#account-edit').click(); await page.locator('#house-edit').click();
  const account = page.locator('#account-form'), house = page.locator('#house-form');
  await expect(page.locator('.house-name-row')).toBeHidden();
  await account.getByLabel('名前', { exact: true }).fill('もちこ');
  await house.getByLabel('家の名前').fill('ぽよハウス');
  await page.route('**/api/houses/*/profile', route => route.fulfill({ status: 503, json: { detail: '再試行してね' } }));
  await account.getByRole('button', { name: '保存' }).click();
  await expect(account.getByRole('button', { name: '保存' })).toBeEnabled();
  await expect(account.getByLabel('名前', { exact: true })).toHaveValue('もちこ');
  await expect(house.getByLabel('家の名前')).toHaveValue('ぽよハウス');
  await page.unroute('**/api/houses/*/profile');
  await account.getByRole('button', { name: '保存' }).click();
  await expect(account).toBeHidden();
  await expect(page.locator('.account-row b')).toHaveText('もちこ');
  await expect(house.getByLabel('家の名前')).toHaveValue('ぽよハウス');
  await house.getByRole('button', { name: '保存' }).click();
  await expect(house).toBeHidden();
  await expect(page.locator('#settings-house-name')).toHaveText('ぽよハウス');
});
