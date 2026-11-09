import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });

test('うちらのなう and だるぽよ on けーじばん take comments, like chore records', async ({ page }) => {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, 'comments');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(async () => {
    const { houseApi } = await import('/src/api.js');
    const c = document.createElement('canvas'); c.width = 60; c.height = 60; c.getContext('2d').fillRect(0, 0, 60, 60);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg'));
    const media = await houseApi('/media?kind=selfie', blob);
    await houseApi('/moments', { request_id: crypto.randomUUID(), media_id: media.id, caption: 'おは' });
    await houseApi('/darupoyo', { request_id: crypto.randomUUID(), chore: 'meal' });
  });
  await page.locator('#open-board').click();
  for (const [card, title, text] of [['.pin-grid .pin-moment', 'もちのなう', 'かわいい！'], ['.pin-grid .pin-darupoyo', 'もちのごはん、だるぽよ', 'だるぽよえらい']]) {
    await page.locator(card).first().click();
    const slide = page.locator('.pin-viewer[open] .pin-viewer-slide').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
    await slide.getByLabel('コメントを書く').fill(text);
    await slide.getByRole('button', { name: '送る' }).click();
    await expect(slide.locator('.comment')).toHaveCount(1);
    await expect(slide.locator('.comment')).toContainText(text);
    await page.locator('.pin-viewer .pm-close').click();
  }
  // they are saved: a fresh look at the board shows them
  const saved = await page.evaluate(async () => {
    const { houseApi } = await import('/src/api.js');
    return [(await houseApi('/moments')).items[0].comments[0].text, (await houseApi('/darupoyo')).items[0].comments[0].text];
  });
  expect(saved).toEqual(['かわいい！', 'だるぽよえらい']);
});
