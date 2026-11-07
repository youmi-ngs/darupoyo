import { test, expect } from '@playwright/test';
import { playRhythm, stillCamera, unlockStart } from './rhythm-helper.js';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); await stillCamera(context); });

async function openLaundry(page, name) {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill(name); await page.getByLabel('新しいハウスの名前').fill('laundry');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-go="3"].scene-tab').click();
  await page.locator('[data-chore="laundry"]').click();
}

test('laundry is one camera rhythm; no tap or mic mode (#35)', async ({ page }) => {
  await openLaundry(page, 'one');
  await expect(page.locator('.choice button:not(.darupoyo-choice)')).toHaveCount(1);
  await expect(page.locator('.choice button:not(.darupoyo-choice)')).toContainText('バサバサでリズム');
});

test('start waits for the upper body, then counts down 3-2-1 before the notes move (#106 #107)', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await openLaundry(page, 'wait');
  await page.getByRole('button', { name: /バサバサでリズム/ }).click();
  const start = page.getByRole('button', { name: 'リズムをはじめる' });
  await expect(start).toBeDisabled({ timeout: 20000 });
  await unlockStart(page);
  await expect(start).toBeEnabled();
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await start.click();
  await expect(page.locator('.rhythm-camera .capture-count')).toHaveText('3');
  const notePosition = () => page.evaluate(() => document.querySelector('.rhythm-note').getBoundingClientRect().x);
  const before = await notePosition();
  // A slap during the countdown is not counted.
  await page.locator('.capture').dispatchEvent('test-slap');
  await page.clock.runFor(1000);
  await expect(page.locator('.rhythm-camera .capture-count')).toHaveText('2');
  await page.clock.runFor(1000);
  await expect(page.locator('.rhythm-camera .capture-count')).toHaveText('1');
  expect(await notePosition()).toBe(before);
  await page.clock.runFor(1000);
  await expect(page.locator('.rhythm-camera .capture-count')).toHaveCount(0);
  await page.clock.runFor(800);
  await page.locator('.capture').dispatchEvent('test-slap');
  await expect(page.locator('.capture-status')).toHaveText('1 / 8 ヒット（6回でクリア）');
  await expect(page.locator('.rhythm-grade')).toHaveText('よき');
  await page.clock.resume();
});

test('6 of 8 hits clears, sparkles on each hit, and releases the camera', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  const modelRequests = [];
  page.on('request', request => { if (request.url().includes('/models/')) modelRequests.push(request.url()); });
  await openLaundry(page, 'six');
  await page.getByRole('button', { name: /バサバサでリズム/ }).click();
  await expect(page.locator('.rhythm-camera video')).toBeVisible();
  await expect(page.locator('.rhythm-note')).toHaveCount(8);
  const tracks = await page.evaluate(() => { window.testVideo = document.querySelector('.rhythm-camera video').srcObject; return window.testVideo.getAudioTracks().length; });
  expect(tracks).toBe(0); // camera only
  const start = await unlockStart(page);
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await start.click();
  await page.clock.runFor(3000 + 800);
  const alignment = await page.evaluate(() => {
    const note = document.querySelector('.rhythm-note').getBoundingClientRect();
    const target = document.querySelector('.rhythm-target').getBoundingClientRect();
    return Math.abs(note.x + note.width / 2 - target.x - target.width / 2);
  });
  expect(alignment).toBeLessThan(3);
  await page.locator('.capture').dispatchEvent('test-slap');
  await expect(page.locator('.capture-status')).toHaveText('1 / 8 ヒット（6回でクリア）');
  await expect(page.locator('.rhythm-camera .fx-spark').first()).toBeAttached();
  for (let k = 1; k < 8; k++) { await page.clock.runFor(800); if (k < 6) await page.locator('.capture').dispatchEvent('test-slap'); }
  await page.clock.runFor(1120); await page.clock.resume();
  await expect(page.locator('#post')).toBeVisible();
  await expect(page.locator('.result-main')).toHaveText('6 / 8 ヒット');
  await expect(page.locator('.result-sub')).toHaveText('よき 6・まあまあ 0');
  expect(await page.evaluate(() => window.testVideo.getTracks().every((t) => t.readyState === 'ended'))).toBe(true);
  // Only the pose model for the upper-body check before start; no segmenter or sound model (#106).
  expect(modelRequests.filter(url => !/\/models\/(pose\.task|vision\/)/.test(url))).toEqual([]);
});

test('fewer than 6 hits shows a gal cheer and a retry, and records nothing (#34)', async ({ page }) => {
  await openLaundry(page, 'miss');
  await page.getByRole('button', { name: /バサバサでリズム/ }).click();
  await playRhythm(page, 4);
  await expect(page.getByRole('heading', { name: 'おしい〜！' })).toBeVisible();
  await expect(page.locator('.sheet-text')).toHaveText('4 / 8 ヒット（6回でクリア）');
  await expect(page.locator('.gal-text')).toContainText('もう一回いこ！');
  await page.getByRole('button', { name: 'もう一回' }).click();
  await expect(page.getByRole('button', { name: 'リズムをはじめる' })).toBeVisible({ timeout: 20000 });
  await page.locator('#sheet-close').click();
  await page.locator('[data-chore="laundry"]').click();
  await expect(page.locator('.door.is-lit')).toHaveCount(0);
});
