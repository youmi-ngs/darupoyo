import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });

test('the camera button starts the chore of the place you are in (#20)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('cam'); await page.getByLabel('新しいハウスの名前').fill('rooms');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  for (const [go, label] of [['0', 'ゴミ捨て'], ['1', 'ごはん'], ['2', 'ドライヤー'], ['3', '洗濯']]) {
    await page.locator(`[data-go="${go}"].scene-tab`).click();
    await page.waitForTimeout(400);
    await page.locator('#shoot').click();
    await expect(page.locator('#sheet-title')).toHaveText(label + '、いく？');
    await page.locator('#sheet-close').click();
  }
});
