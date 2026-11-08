import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
import { playRhythm, stillCamera } from './rhythm-helper.js';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page, name = 'もち') {
  await page.goto('/'); await setWelcomeName(page, name); await setHouseName(page, 'issues');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
const png = page => page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d'); g.fillStyle = '#ffcf8a'; g.fillRect(0, 0, 600, 400);
  return Array.from(new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()));
});

test('a meal photo can come from the photo library (#117)', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await enter(page);
  await page.locator('.scene-dot').nth(2).click();
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button', { name: /^たべる/ }).click();
  await expect(page.getByRole('button', { name: 'この写真を撮る' })).toBeVisible();
  await page.locator('.capture-library input').setInputFiles({ name: 'lunch.png', mimeType: 'image/png', buffer: Buffer.from(await png(page)) });
  await expect(page.locator('.capture canvas')).toBeVisible();
  // a library photo is cut to the album's 5:6 frame and is not mirrored
  expect(await page.locator('.capture canvas').evaluate(c => [c.width * 6 === c.height * 5, c.classList.contains('is-mirrored')])).toEqual([true, false]);
  await page.getByRole('button', { name: 'いただきますをする' }).click();
  await page.getByRole('button', { name: '写真だけで進む' }).click();
  await page.getByRole('button', { name: 'みんなに見せる' }).click();
  await expect(page.getByText('記録できたよん。今日もえらい！')).toBeVisible();
  const posts = await page.evaluate(async () => { const { houseApi } = await import('/src/api.js'); return (await houseApi('/posts')).items; });
  expect(posts.map(p => [p.chore, p.method, !!p.media_id])).toEqual([['meal', 'photo', true]]);
});

test('after a missed laundry game, もう一回 can start right away (#124)', async ({ page, context }) => {
  await stillCamera(context); await context.grantPermissions(['camera']);
  await enter(page);
  await page.locator('.scene-dot').nth(4).click(); await page.locator('[data-chore="laundry"]').click();
  await page.getByRole('button', { name: /^干す/ }).click();
  await playRhythm(page, 1);
  await expect(page.getByText('おしい〜！')).toBeVisible();
  await page.getByRole('button', { name: 'もう一回' }).click();
  // no second upper-body check: the start button works without waiting
  await expect(page.getByRole('button', { name: 'リズムをはじめる' })).toBeEnabled({ timeout: 15000 });
  await expect(page.locator('.capture-status')).toContainText('もう一回いこ');
});

test('a gal stays at her last chore for 5 minutes, then rests in her room (#121)', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  await enter(page);
  await page.evaluate(async () => {
    const { houseApi, refresh } = await import('/src/api.js');
    await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'dryer', method: 'sound', duration_seconds: 11 });
    await refresh();
  });
  await expect(page.locator('[data-scene="wash"] .resident-avatar')).toHaveCount(1);
  await page.clock.fastForward('04:00');
  await expect(page.locator('[data-scene="wash"] .resident-avatar')).toHaveCount(1);
  await page.clock.fastForward('01:30');
  await expect(page.locator('.resident-avatar')).toHaveCount(0);
  await page.locator('.scene-dot').nth(5).click(); await page.locator('.door.is-me').click();
  await expect(page.locator('#room-detail .room-gal .resident-character')).toBeVisible();
});

test('the house weather comes from our server (Google), not Open-Meteo (#125)', async ({ page }) => {
  const outside = [];
  page.on('request', r => { if (r.url().includes('open-meteo')) outside.push(r.url()); });
  await page.route('**/api/weather', route => route.fulfill({ json: { kind: 'snow', source: 'google' } }));
  await enter(page);
  await expect(page.locator('body')).toHaveAttribute('data-weather', 'snow');
  expect(outside).toEqual([]);
  // the required credits sit on every sky that shows the weather
  for (const [dot, scene] of [[0, 'outside'], [2, 'ldk'], [4, 'balcony']]) {
    await page.locator('.scene-dot').nth(dot).click();
    const credit = page.locator(`.credit-${scene}`);
    await expect(credit).toBeVisible();
    await expect(credit).toContainText('Source: Includes weather data from Google.');
    await expect(credit.getByRole('link', { name: '気象データ提供：株式会社ウェザーニューズ' })).toHaveAttribute('href', 'https://jp.weathernews.com/');
  }
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('.data-credits')).toContainText('Source: Includes weather data from Google.');
  await expect(page.locator('.data-credits')).toContainText('気象データ提供：株式会社ウェザーニューズ');
});
