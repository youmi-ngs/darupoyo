import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });

test('each place starts its chore from the furniture: trash cans, table, vanity and basket', async ({ page }) => {
  await page.goto('/');
  await setWelcomeName(page, 'cam'); await setHouseName(page, 'rooms');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  for (const [dot, chore, label] of [[0, 'trash', 'ゴミ捨て、いく？'], [2, 'meal', 'ごはんたべよ〜！'], [3, 'dryer', '髪乾かさな〜い？'], [4, 'laundry', '服干す〜？']]) {
    await page.locator('.scene-dot').nth(dot).click();
    await page.waitForTimeout(400);
    await page.locator(`[data-chore="${chore}"]`).click();
    await expect(page.locator('#sheet-title')).toHaveText(label);
    await page.locator('#sheet-close').click();
  }
});
