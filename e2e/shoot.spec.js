import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });

test('each place starts its chore from the furniture: trash cans, table, vanity and basket', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('cam'); await page.getByLabel('新しいハウスの名前').fill('rooms');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  for (const [dot, chore, label] of [[0, 'trash', 'ゴミ捨て'], [2, 'meal', 'ごはん'], [3, 'dryer', 'ドライヤー'], [4, 'laundry', '洗濯']]) {
    await page.locator('.scene-dot').nth(dot).click();
    await page.waitForTimeout(400);
    await page.locator(`[data-chore="${chore}"]`).click();
    await expect(page.locator('#sheet-title')).toHaveText(label + '、いく？');
    await page.locator('#sheet-close').click();
  }
});
