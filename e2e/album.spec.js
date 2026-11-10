import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });

test('the room album shows 5:6 cards like けーじばん, with the gal for records without a photo (dryer too)', async ({ page }) => {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, 'アルバム');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await page.getByRole('button', { name: 'スキップ' }).click({ timeout: 3000 }).catch(() => {});
  await page.evaluate(async () => {
    const { houseApi, refresh } = await import('/src/api.js');
    await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'dryer', method: 'sound', duration_seconds: 11 });
    await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'laundry', method: 'rhythm', hits: 6, total_beats: 8, duration_seconds: 8 });
    await refresh();
  });
  await page.locator('.scene-dot').last().click(); await page.locator('.door.is-me').click();
  await page.locator('.mr-album').first().click();
  const cards = page.locator('#log-modal .log-day').first().locator('.fp');
  await expect(cards).toHaveCount(2);
  await expect(cards.locator('.shot.is-drawing')).toHaveCount(2);
  for (const shot of await cards.locator('.shot').all()) {
    const box = await shot.boundingBox();
    expect(Math.abs(box.width / box.height - 5 / 6)).toBeLessThan(.03);
  }
});
