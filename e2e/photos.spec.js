import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
});
async function enter(page, name = 'もち', houseName = 'photos') {
  await page.goto('/'); await setWelcomeName(page, name); await setHouseName(page, houseName);
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
// A meal photo record made through the API, then shown by a refresh.
const mealPost = page => page.evaluate(async () => {
  const { client, houseApi, refresh } = await import('/src/api.js');
  const c = document.createElement('canvas'); c.width = 100; c.height = 120; c.getContext('2d').fillRect(0, 0, 50, 50);
  const photo = await houseApi('/media?kind=meal', await new Promise(r => c.toBlob(r, 'image/png')));
  const { post } = await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'meal', method: 'photo', media_id: photo.id });
  await refresh(); return { uid: client.uid, house: client.house, post: post.id };
});
async function openOwnAlbum(page) {
  await page.locator('.scene-dot').nth(5).click();
  await page.locator('.door.is-me').click();
  await page.locator('.mr-album').click();
  await expect(page.locator('#log-modal')).toBeVisible();
}

test('home opens at the entrance; its board shows the newest records and opens けーじばん', async ({ page }) => {
  await enter(page);
  await expect(page.locator('.scene-dot').nth(1)).toHaveAttribute('aria-current', '');
  await expect(page.locator('#open-board')).toBeInViewport();
  await expect(page.locator('#entry-board-grid .pin-card.is-empty')).toHaveCount(6);
  await mealPost(page);
  // a no-photo chore, a selfie and a だるぽよ record are cards too
  await page.evaluate(async () => {
    const { houseApi, refresh } = await import('/src/api.js');
    await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'dryer', method: 'sound', duration_seconds: 11 });
    const c = document.createElement('canvas'); c.width = 60; c.height = 60;
    const selfie = await houseApi('/media?kind=selfie', await new Promise(r => c.toBlob(r, 'image/png')));
    await houseApi('/moments', { request_id: crypto.randomUUID(), media_id: selfie.id, caption: 'ねむい' });
    await houseApi('/darupoyo', { request_id: crypto.randomUUID(), chore: 'laundry', caption: '今日はむり' });
    await refresh();
  });
  await page.locator('#open-board').click();
  await expect(page.locator('#board-view')).toBeVisible();
  const cards = page.locator('.pin-grid .pin-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toContainText('今日はむり');           // newest first
  await expect(cards.nth(1)).toContainText('ねむい');
  await expect(page.locator('.pin-grid .pin-post .pin-photo.is-drawing .resident-character')).toHaveCount(1); // dryer: the gal drawing
  await expect(page.locator('.pin-grid .pin-card .pin-magnet')).toHaveCount(4);
  // a chore card opens the photo viewer with reactions and comments
  await page.locator('.pin-grid .pin-post').last().click();
  await expect(page.locator('#photo-modal')).toBeVisible();
  await expect(page.locator('#photo-modal .pm-slide').first().getByLabel('コメントを書く')).toBeVisible();
  await page.locator('#pm-close').click();
  await page.locator('.board-back').click();
  await expect(page.locator('#house-view')).toBeVisible();
  await expect(page.locator('#entry-board-grid .pin-card:not(.is-empty)')).toHaveCount(4);
});

test('profile photo is the magnet and the room icon, and the gal shows when there is none', async ({ page }) => {
  await enter(page);
  await mealPost(page);
  await expect(page.locator('#entry-board-grid .pin-magnet .gal-face')).toHaveCount(1);
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#f9c'; g.fillRect(0, 0, 300, 200);
    return (await new Promise(r => c.toBlob(r, 'image/png')).then(b => b.arrayBuffer()).then(b => Array.from(new Uint8Array(b))));
  });
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await page.locator('#social-card input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.locator('#profile-avatar')).toHaveClass(/has-avatar/);
  await page.locator('#settings-close').click();
  await expect(page.locator('#entry-board-grid .pin-magnet img')).toHaveCount(1);
  await page.locator('.scene-dot').nth(5).click();
  await expect(page.locator('#hall-icons .hall-icon img')).toHaveCount(1);
  await page.evaluate(async () => { const { houseApi, refresh } = await import('/src/api.js'); await houseApi('/avatar', undefined, 'DELETE'); await refresh(); });
  await expect(page.locator('#hall-icons .hall-icon .gal-face')).toHaveCount(1);
});

test('residents comment on a photo and the album calendar jumps to a day', async ({ page }) => {
  await enter(page);
  await mealPost(page);
  await openOwnAlbum(page);
  await page.locator('#log-calendar').click();
  const today = page.locator('.album-calendar .cal-day.is-today');
  await expect(today).toHaveClass(/has-photos/);
  await expect(page.locator('.album-calendar .cal-day:not(.has-photos)').first()).toBeDisabled();
  await today.click();
  await expect(page.locator('.album-calendar')).toBeHidden();
  await page.locator('#log-list .fp').first().click();
  const slide = page.locator('#photo-modal .pm-slide').first();
  await slide.getByLabel('コメントを書く').fill('おいしそう！');
  await slide.getByRole('button', { name: '送る' }).click();
  await expect(slide.locator('.comment')).toContainText('おいしそう！');
  await expect(slide.getByLabel('コメントを書く')).toHaveValue('');
  await slide.getByRole('button', { name: '自分のコメントを消す' }).click();
  await expect(slide.locator('.comment')).toHaveCount(0);
});

test('records from another house appear only after their owner shares them', async ({ page, browser }) => {
  await enter(page, 'あき', 'まえの家');
  const alice = await mealPost(page);
  // bob lives in a new house and invites alice.
  const other = await browser.newContext(); const bobPage = await other.newPage();
  await bobPage.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await enter(bobPage, 'ぼぶ', 'あたらしい家');
  const bob = await bobPage.evaluate(async () => { const { client, houseApi } = await import('/src/api.js'); const { token } = await houseApi('/invites', {}); return { house: client.house, token }; });
  const asAlice = { Authorization: 'Bearer dev:' + alice.uid };
  expect((await page.request.post('/api/join', { headers: asAlice, data: { token: bob.token, display_name: 'あき' } })).status()).toBe(200);
  const openAliceAlbum = async () => {
    await bobPage.reload(); await expect(bobPage.locator('.onboarding')).toHaveCount(0);
    await bobPage.locator('.scene-dot').nth(5).click();
    await bobPage.locator('.door', { hasText: 'あき' }).click();
    await bobPage.locator('.mr-album').click();
  };
  await openAliceAlbum();
  await expect(bobPage.locator('#log-title')).toHaveText('あきのアルバム');
  await expect(bobPage.locator('#log-total')).toHaveText('0枚');
  expect((await page.request.put('/api/houses/' + bob.house + '/history-sharing', { headers: asAlice, data: { enabled: true } })).status()).toBe(200);
  await openAliceAlbum();
  await expect(bobPage.locator('#log-list .fp.is-foreign')).toHaveCount(1);
  await expect(bobPage.locator('#log-total')).toHaveText('1枚');
  await bobPage.locator('#log-list .fp.is-foreign').click();
  const slide = bobPage.locator('#photo-modal .pm-slide').first();
  await expect(slide.locator('.pm-meta')).toContainText('別のハウスでの記録');
  await expect(slide.locator('.comments, .reaction-row')).toHaveCount(0);
  await other.close();
});
