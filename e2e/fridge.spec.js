import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });

test('the fridge board says it is today\'s to-do list (#22)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('f'); await page.getByLabel('新しいハウスの名前').fill('fridge');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-go="1"].scene-tab').click();
  await page.locator('#open-fridge').click();
  await expect(page.locator('#board-title')).toBeVisible();
  await expect(page.locator('#board-title')).toHaveText('今日やること');
  await expect(page.locator('#board-magnets .board-empty')).toHaveText('今日やる家事をここに貼る');
  await page.locator('#tray .magnet').first().click();
  await expect(page.locator('#board-magnets .board-empty')).toHaveCount(0);
  await expect(page.locator('#board-title')).toBeVisible();
});

test('trying a chore in the house does not stick it on the fridge by itself (#23)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('t'); await page.getByLabel('新しいハウスの名前').fill('tap');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-go="3"].scene-tab').click(); await page.locator('[data-chore="laundry"]').click();
  await expect(page.locator('#sheet')).toBeVisible(); await page.locator('#sheet-close').click();
  await page.locator('[data-go="0"].scene-tab').click(); await page.locator('[data-chore="trash"]').click();
  await page.locator('#sheet-close').click();
  await page.locator('[data-go="1"].scene-tab').click(); await page.locator('#open-fridge').click();
  await expect(page.locator('#board-magnets .board-empty')).toHaveText('今日やる家事をここに貼る');
  await expect(page.locator('#board-magnets .magnet')).toHaveCount(0);
});
