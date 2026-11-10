import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page) {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, 'ひとこと');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', {name:'ハウスに入る'}).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
const png = page => page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; c.getContext('2d').fillRect(0, 0, 600, 400); return Array.from(new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())); });

test('a chore record can carry a word, shown in the photo viewer and on けーじばん', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await enter(page);
  await page.locator('.scene-dot').nth(2).click();
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button', { name: /^たべる/ }).click();
  await page.locator('.capture-library input').setInputFiles({ name: 'lunch.png', mimeType: 'image/png', buffer: Buffer.from(await png(page)) });
  // the word is written with the photo (Figma 写真のタスク 01)
  const word = page.locator('#sheet').getByLabel('ひとこと（かかなくてもおけ♡）');
  await word.fill('あ'.repeat(31)); await expect(word).toHaveValue('あ'.repeat(30));
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
  const sending = now.locator('.sending-veil');
  await expect(sending).toBeVisible();
  await expect(sending).toContainText('そ〜しんちゅ〜');
  await expect(now.getByRole('button', { name: '撮り直す' })).toBeHidden(); // no retake while sending
  await expect.poll(() => release !== undefined).toBe(true);
  release();
  await expect(now.getByText('そ〜しんできたよん')).toBeVisible();
  await expect(sending).toBeHidden();
});

test('every post shows そ〜しんちゅ〜 while it is sent: ごはん and だるぽよ too', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await enter(page);
  const hold = async pattern => { const gate = {}; await page.route(pattern, async route => { if (route.request().method() !== 'POST') return route.continue(); await new Promise(r => { gate.release = r; }); await route.continue(); }); return gate; };
  // ごはん: over the 記録する？ panel
  const meal = await hold('**/api/houses/*/completions');
  await page.locator('.scene-dot').nth(2).click();
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button', { name: /^たべる/ }).click();
  await page.locator('.capture-library input').setInputFiles({ name: 'lunch.png', mimeType: 'image/png', buffer: Buffer.from(await png(page)) });
  await page.getByRole('button', { name: 'いただきますをする' }).click();
  await page.getByRole('button', { name: '写真だけで進む' }).click();
  await page.getByRole('button', { name: 'みんなに見せる' }).click();
  await expect(page.locator('.result-panel .sending-veil')).toContainText('そ〜しんちゅ〜');
  await expect.poll(() => !!meal.release).toBe(true); meal.release();
  await expect(page.getByText('記録できたよん。今日もえらい！')).toBeVisible();
  await expect(page.locator('.sending-veil')).toHaveCount(0);
  await page.locator('#sheet-close').click();
  // だるぽよ: the dialog itself is covered while it is sent
  const daru = await hold('**/api/houses/*/darupoyo');
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button', { name: /^だるぽよ/ }).click();
  await page.getByRole('button', { name: 'きょーゆー' }).click();
  await expect(page.locator('.darupoyo-dialog .sending-veil')).toContainText('そ〜しんちゅ〜');
  await expect.poll(() => !!daru.release).toBe(true); daru.release();
  await expect(page.getByRole('heading', {name:/だるぽよ、\s*記録かんりょ〜/})).toBeVisible();
  await expect(page.locator('.sending-veil')).toHaveCount(0);
});
