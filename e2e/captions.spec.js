import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page) {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('もち'); await page.getByLabel('新しいハウスの名前').fill('ひとこと');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
const png = page => page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; c.getContext('2d').fillRect(0, 0, 600, 400); return Array.from(new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())); });

test('a chore record can carry a word, shown in the photo viewer and on けーじばん', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await enter(page);
  await page.locator('.scene-dot').nth(2).click();
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button', { name: 'ごはんを撮る' }).click();
  await page.locator('.capture-library input').setInputFiles({ name: 'lunch.png', mimeType: 'image/png', buffer: Buffer.from(await png(page)) });
  // the word is written with the photo (Figma 写真のタスク 01)
  const word = page.locator('#sheet').getByLabel('ひとこと（30文字まで）');
  await expect(word).toHaveAttribute('maxlength', '30');
  await expect(word).toHaveAttribute('placeholder', '今日のお昼は、おはぎ！');
  await word.fill('お昼のパスタ');
  await page.getByRole('button', { name: 'いただきますをする' }).click();
  await page.getByRole('button', { name: '写真だけで進む' }).click();
  await page.getByRole('button', { name: 'みんなに見せる' }).click();
  // done (05): the photo, the word and the gal's line
  await expect(page.getByText('記録できたよん。今日もえらい！')).toBeVisible();
  await expect(page.locator('#sheet-title')).toHaveText('きょうのごはん');
  await expect(page.locator('.done-photo')).toBeVisible();
  await expect(page.locator('.done-caption')).toHaveText('お昼のパスタ');
  await expect(page.locator('.done-verdict .gal-text')).not.toHaveText('');
  const [post] = await page.evaluate(async () => { const { houseApi } = await import('/src/api.js'); return (await houseApi('/posts')).items; });
  expect(post.caption).toBe('お昼のパスタ');
  await page.getByRole('button', { name: 'け〜じばんをちぇけらする' }).click();
  await expect(page.locator('#board-view')).toBeVisible();
  await expect(page.locator('.pin-grid .pin-post .pin-text')).toHaveText('お昼のパスタ');
  await page.locator('.pin-grid .pin-post').click();
  await expect(page.locator('#photo-modal .pm-caption')).toHaveText('お昼のパスタ');
});

test('without a word the record looks as before', async ({ page }) => {
  await enter(page);
  await page.evaluate(async () => { const { houseApi, refresh } = await import('/src/api.js'); await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'dryer', method: 'sound', duration_seconds: 11 }); await refresh(); });
  await page.locator('#open-board').click();
  await page.locator('.pin-grid .pin-post').click();
  await expect(page.locator('#photo-modal .pm-caption')).toHaveCount(0);
});

test('うちらのなう shows そ〜しんちゅ〜 while sending, then そ〜しんできたよん', async ({ page }) => {
  await enter(page);
  let release;
  await page.route('**/api/houses/*/moments', async route => { if (route.request().method() !== 'POST') return route.continue(); await new Promise(r => { release = r; }); await route.continue(); });
  await page.locator('.scene-dot').nth(1).click(); await page.locator('[data-open-moments]').click();
  const now = page.getByRole('dialog', { name: 'うちらのなう' });
  await now.getByRole('button', { name: '撮る' }).click();
  await now.getByRole('button', { name: 'みせちゃう' }).click();
  const sending = now.locator('.now-sending');
  await expect(sending).toBeVisible();
  await expect(sending).toContainText('そ〜しんちゅ〜');
  await expect(now.getByRole('button', { name: '撮り直す' })).toBeHidden(); // no retake while sending
  await expect.poll(() => release !== undefined).toBe(true);
  release();
  await expect(now.getByText('そ〜しんできたよん')).toBeVisible();
  await expect(sending).toBeHidden();
});
