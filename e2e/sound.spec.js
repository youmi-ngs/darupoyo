import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
// 効果音とギャルの声っぽい音（#8 #17）。鳴らした音（オシレーター）の数で確かめる。
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    ['darupoyo:entered', 'darupoyo:guide-ready'].forEach(event => window.addEventListener(event, () => queueMicrotask(() => document.querySelector('.first-guide [data-skip]')?.click())));
    window.tones = 0;
    const make = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { window.tones++; return make.call(this); };
  });
});
async function enter(page) {
  await page.goto('/');
  await setWelcomeName(page, 'oto'); await setHouseName(page, 'sound');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
}
test('picking a gal plays her voice, and the setting turns every sound off', async ({ page }) => {
  await enter(page);
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '姫ギャル' }).click();
  await expect.poll(() => page.evaluate(() => window.tones)).toBeGreaterThan(3);
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  const before = await page.evaluate(() => window.tones);
  await page.getByRole('button', { name: '姫ギャル' }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.tones)).toBe(before);
  // 端末に覚えておく
  await page.reload();
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
});
