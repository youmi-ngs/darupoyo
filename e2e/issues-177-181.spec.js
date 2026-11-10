import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page, house) {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, house);
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}

test('やっほ〜 offers three different-looking choices, and 帰る lists your houses (#181)', async ({ page }) => {
  await page.goto('/'); await setWelcomeName(page, 'もち');
  // a newcomer has no house to go back to
  await expect(page.getByRole('button', { name: 'すでに入居済みの家に帰る' })).toHaveCount(0);
  await setHouseName(page, 'おんたま'); await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await page.locator('#open-menu').click(); await page.locator('#menu-house').click(); await page.locator('#house-add').click();
  const home = page.getByRole('button', { name: 'すでに入居済みの家に帰る' }), join = page.getByRole('button', { name: '友達の家に住む' }), make = page.getByRole('button', { name: '新しく家をつくる' });
  const colours = await Promise.all([home, join, make].map(b => b.evaluate(el => getComputedStyle(el).backgroundColor)));
  expect(new Set(colours).size).toBe(3);
  await home.click();
  await expect(page.locator('.onboarding h2')).toHaveText('どのハウスに帰る？');
  await page.getByRole('button', { name: 'もどる' }).click();
  await expect(page.locator('.onboarding h2')).toHaveText('やっほ〜');
  await home.click(); await page.getByRole('button', { name: 'おんたまに帰る' }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
});

test('swiping between rooms only sways things you can tap for a chore (#180)', async ({ page }) => {
  await enter(page, 'sway');
  await page.evaluate(() => document.getElementById('plan').classList.add('is-swaying'));
  const plain = await page.locator('#plan .sv-obj').first().evaluate(el => getComputedStyle(el).animationName);
  const chore = await page.locator('#plan .sv-hit[data-chore]').first().evaluate(el => getComputedStyle(el).animationName);
  expect(plain).not.toContain('furniture-sway');
  expect(chore).toContain('furniture-sway');
});

test('the けーじばん viewers leave up-and-down to the browser and handle sideways themselves (#179)', async ({ page }) => {
  await enter(page, 'swipe');
  expect(await page.locator('#pm-track').evaluate(el => getComputedStyle(el).touchAction)).toBe('pan-y');
});

test('the look-back how-to card shows a calendar of できた (#178)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.howto-art.lookback img.howto-illustration')).toHaveAttribute('src', '/settings/lookback.svg');
});

test.describe('touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 700 } });
  test('a mostly-sideways swipe moves one card and a mostly-vertical one does not (#179)', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const { lockSwipeAxis } = await import('/src/swipe-axis.js');
      const track = document.createElement('div');
      Object.assign(track.style, { position: 'fixed', inset: '0', display: 'flex', overflowX: 'auto', zIndex: 9999, background: '#fff' });
      for (let i = 0; i < 3; i++) { const s = document.createElement('div'); s.style.cssText = 'flex:0 0 100%;height:100%'; track.append(s); }
      document.body.append(track); lockSwipeAxis(track);
      const swipe = (dx, dy) => {
        const at = (x, y) => [new Touch({ identifier: 1, target: track, clientX: x, clientY: y })];
        const fire = (type, x, y) => track.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : at(x, y), changedTouches: at(x, y) }));
        fire('touchstart', 300, 300);
        for (let k = 1; k <= 10; k++) fire('touchmove', 300 + dx * k / 10, 300 + dy * k / 10);
        fire('touchend', 300 + dx, 300 + dy);
      };
      const settle = () => new Promise(r => setTimeout(r, 700));
      swipe(-160, -60); await settle(); const sideways = Math.round(track.scrollLeft / track.clientWidth);
      swipe(-40, -200); await settle(); const vertical = Math.round(track.scrollLeft / track.clientWidth);
      return { sideways, vertical };
    });
    expect(result).toEqual({ sideways: 1, vertical: 1 });
  });
});
