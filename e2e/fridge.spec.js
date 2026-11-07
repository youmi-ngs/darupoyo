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
  // 新しいハウスでは、洗濯とゴミ捨てが最初から貼ってある（#23）。
  await expect(page.locator('#board-magnets .magnet')).toHaveText(['洗濯', 'ゴミ捨て']);
  await page.getByRole('button', { name: '洗濯をボードから外す' }).click();
  const cleared = page.waitForResponse(r => r.url().includes('/goals') && r.request().postData()?.includes('"chores":[]'));
  await page.getByRole('button', { name: 'ゴミ捨てをボードから外す' }).click();
  await expect(page.locator('#board-magnets .board-empty')).toHaveText('今日やる家事をここに貼る');
  // 外したら、読み込み直しても勝手に戻らない。
  await cleared;
  await page.reload();
  await page.locator('[data-go="1"].scene-tab').click();
  await page.locator('#open-fridge').click();
  await expect(page.locator('#board-magnets .board-empty')).toHaveText('今日やる家事をここに貼る');
  await page.locator('#tray .magnet').first().click();
  await expect(page.locator('#board-magnets .board-empty')).toHaveCount(0);
  await expect(page.locator('#board-title')).toBeVisible();
});
