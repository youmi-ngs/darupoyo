import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page, house) {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, house);
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
// The current dot is the entrance scene.
const atEntry = page => page.evaluate(() => { const i = [...document.querySelectorAll('.scene-dot')].findIndex(d => d.hasAttribute('aria-current')); return i >= 0 && document.querySelectorAll('#plan .scene')[i]?.dataset.scene === 'entry'; });
// A pose model that always sees a person, but scores the pose low.
const lowPose = `
export const PRESET_PASS = 60;
export const PRESET_POSES = {};
export const presetScore = () => 30;
export const poseSimilarity = () => 70;
export const hasUpperBody = l => !!l;
export async function createPoseLandmarker() {
  const landmarks = Array.from({ length: 33 }, (_, i) => ({ x: .5, y: i / 40, z: 0, visibility: 1 }));
  return { detectForVideo: () => ({ landmarks: [landmarks], close() {} }), close() {} };
}`;
const fakeSegment = `
export async function createSegmenter() { return { close() {} }; }
export function cutout(_, canvas, ctx) { ctx.clearRect(0, 0, canvas.width / 3, canvas.height); return .4; }`;

test('the app does not zoom on quick taps or pinches (#170)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /maximum-scale=1, user-scalable=no/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('manipulation');
  expect(await page.evaluate(() => { const e = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented; })).toBe(true);
});

test('a low garbage pose score can still be sent, celebrates, and can go back to the entrance (#173 #175 #176)', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await page.route(/\/src\/pose\.js/, route => route.fulfill({ contentType: 'application/javascript', body: lowPose }));
  await page.route(/\/src\/segment\.js/, route => route.fulfill({ contentType: 'application/javascript', body: fakeSegment }));
  await enter(page, 'gomi');
  await page.locator('.scene-dot').nth(0).click(); await page.locator('[data-chore="trash"]').click(); await page.getByRole('button', { name: /^ゴミ捨てる/ }).click(); await page.getByRole('button', { name: /サンタのポーズ/ }).click();
  await expect(page.locator('.capture-status')).toHaveText('上半身が入ればOKだよ！');
  await page.getByRole('button', { name: 'この写真を撮る' }).click();
  await expect(page.locator('.capture-status')).toContainText('このまま届けてもOK');
  const send = page.getByRole('button', { name: 'プレゼントを届ける' });
  await expect(send).toBeEnabled(); await send.click();
  await expect(page.locator('.done-photo-wrap .done-badge')).toBeVisible();
  await expect(page.getByRole('button', { name: 'け〜じばんをちぇけらする' })).toBeVisible();
  await page.getByRole('button', { name: 'げんかんにもどる' }).click();
  await expect(page.locator('#sheet')).not.toBeVisible();
  await expect(page.locator('#board-view')).toBeHidden();
  await expect(page.locator('#house-view')).toBeVisible();
  await expect.poll(() => atEntry(page)).toBe(true);
});

test('だるぽよ done is centred and offers けーじばん or the entrance (#171 #176)', async ({ page }) => {
  await enter(page, 'daru');
  await page.locator('.scene-dot').nth(2).click(); await page.locator('[data-chore="meal"]').click(); await page.getByRole('button', { name: /^だるぽよ/ }).click();
  await page.getByRole('button', { name: 'きょーゆー' }).click();
  const done = page.locator('.darupoyo-dialog.is-success');
  await expect(done.locator('h2')).toHaveCSS('text-align', 'center');
  await expect(done.locator('h2')).toHaveCSS('padding-right', '0px');
  await done.getByRole('button', { name: 'げんかんにもどる' }).click();
  await expect(done).not.toBeVisible();
  await expect(page.locator('#board-view')).toBeHidden();
  await expect.poll(() => atEntry(page)).toBe(true);
});
