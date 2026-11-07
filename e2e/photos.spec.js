import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
});
async function enter(page, name = 'もち', houseName = 'photos') {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill(name); await page.getByLabel('新しいハウスの名前').fill(houseName);
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
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
  await page.locator('.scene-tab[data-go="4"]').click();
  await page.locator('.door').first().click();
  await page.locator('.mr-album').click();
  await expect(page.locator('#log-modal')).toBeVisible();
}

test('home opens the entrance board with the house timeline', async ({ page }) => {
  await enter(page);
  await expect(page.locator('.scene-tab[data-go="0"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#entry-timeline')).toBeInViewport();
  await expect(page.locator('#entry-timeline')).toContainText('まだ静か');
  await mealPost(page);
  await expect(page.locator('#entry-timeline .tl-item')).toHaveCount(1);
  await expect(page.locator('#entry-timeline')).toContainText('もち');
  await expect(page.locator('#entry-timeline')).toContainText('ツヤ肌');
  await expect(page.locator('#entry-count')).toContainText('1');
  // The home button always comes back to the entrance.
  await page.locator('.scene-tab[data-go="2"]').click();
  await page.locator('#nav-home').click();
  await expect(page.locator('.scene-tab[data-go="0"]')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#entry-board-more').click();
  await expect(page.locator('.scene-tab[data-go="5"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#timeline .tl-item')).toHaveCount(1);
});

test('profile photo appears on the timeline and resident chips, and can be removed', async ({ page }) => {
  await enter(page);
  await mealPost(page);
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#f9c'; g.fillRect(0, 0, 300, 200);
    return (await new Promise(r => c.toBlob(r, 'image/png')).then(b => b.arrayBuffer()).then(b => Array.from(new Uint8Array(b))));
  });
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await page.locator('#social-card input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.locator('#social-card .avatar-preview img')).toBeVisible();
  await expect(page.locator('.account-icon img')).toBeVisible();
  await page.locator('#settings-close').click();
  await expect(page.locator('#entry-timeline .who-dot.has-avatar img')).toBeVisible();
  await expect(page.locator('#door-chips .chip-face img')).toHaveCount(1);
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await page.locator('#social-card .avatar-clear').click();
  await expect(page.locator('#social-card .avatar-preview img')).toHaveCount(0);
  await expect(page.locator('#entry-timeline .who-dot.has-avatar')).toHaveCount(0);
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
    await bobPage.locator('.scene-tab[data-go="4"]').click();
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
