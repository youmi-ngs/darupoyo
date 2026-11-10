import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page, house) {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, house);
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
}

test('your own chore record: edit its words (the gal answers again) and delete it', async ({ page }) => {
  await enter(page, 'edit');
  await page.evaluate(async () => { const { houseApi, refresh } = await import('/src/api.js'); await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'dryer', method: 'sound', duration_seconds: 11, caption: 'かわいた' }); await refresh(); });
  await page.locator('#open-board').click();
  await page.locator('.pin-grid .pin-post').first().click();
  const slide = page.locator('#photo-modal .pm-slide').first();
  await expect(slide.locator('.pm-caption')).toHaveText('かわいた');
  await slide.getByRole('button', { name: 'ひとことを編集' }).click();
  const field = slide.getByLabel('ひとこと（30文字まで）');
  await expect(field).toHaveValue('かわいた');
  await field.fill('あ'.repeat(31));
  await expect(slide.getByRole('button', { name: '保存' })).toBeDisabled();
  await field.fill('サラサラになった');
  const saved = page.waitForResponse(r => r.request().method() === 'PATCH' && /\/posts\//.test(r.url()));
  await slide.getByRole('button', { name: '保存' }).click();
  const body = await (await saved).json();
  expect(body.caption).toBe('サラサラになった'); expect(body.edited_at).toBeTruthy();
  await expect(slide.locator('.pm-caption')).toHaveText('サラサラになった');
  await expect(slide.locator('.gal-text')).toHaveText(body.praise.text);

  await slide.getByRole('button', { name: '削除' }).click();
  await slide.getByRole('button', { name: 'やめる' }).click();
  await slide.getByRole('button', { name: '削除' }).click();
  await slide.getByRole('button', { name: '消す', exact: true }).click();
  await expect(page.locator('#photo-modal')).not.toBeVisible();
  await expect(page.locator('.pin-grid .pin-post')).toHaveCount(0);
  const left = await page.evaluate(async () => { const { houseApi } = await import('/src/api.js'); return (await houseApi('/posts')).items.length; });
  expect(left).toBe(0);
});

test('your own うちらのなう can be edited and deleted from けーじばん', async ({ page }) => {
  await enter(page, 'nau');
  await page.evaluate(async () => {
    const { houseApi } = await import('/src/api.js');
    const c = document.createElement('canvas'); c.width = 60; c.height = 60; c.getContext('2d').fillRect(0, 0, 60, 60);
    const media = await houseApi('/media?kind=selfie', await new Promise(r => c.toBlob(r, 'image/jpeg')));
    await houseApi('/moments', { request_id: crypto.randomUUID(), media_id: media.id, caption: 'おは' });
  });
  await page.locator('#open-board').click();
  await page.locator('.pin-grid .pin-moment').first().click();
  const slide = page.locator('.pin-viewer[open] .pin-viewer-slide').first();
  await slide.getByRole('button', { name: 'ひとことを編集' }).click();
  await slide.getByLabel('ひとこと（30文字まで）').fill('カフェきた');
  await slide.getByRole('button', { name: '保存' }).click();
  await expect(slide.locator('.pin-viewer-text')).toHaveText('カフェきた');
  await expect(slide.locator('.moment-praise')).toHaveCount(1);
  await slide.getByRole('button', { name: '削除' }).click();
  await slide.getByRole('button', { name: '消す', exact: true }).click();
  await expect(page.locator('.pin-viewer')).not.toBeVisible();
  await expect(page.locator('.pin-grid .pin-moment')).toHaveCount(0);
});
