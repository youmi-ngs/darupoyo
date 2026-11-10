import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from '../e2e/onboarding-helper.js';

async function enter(page, guide = false) {
  if (!guide) await page.addInitScript(() => ['darupoyo:entered', 'darupoyo:guide-ready'].forEach(event => window.addEventListener(event, () => queueMicrotask(() => document.querySelector('.first-guide [data-skip]')?.click()))));
  await page.goto('/'); await setWelcomeName(page, 'ながいおなまえだよねー');
  await setHouseName(page, 'みんなのとってもたのしいハウスだよ');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click();
  await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
}

test('reduced motion close double-tap does not open the menu underneath', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await enter(page);
  await openMenu(page, '#open-settings'); await page.locator('#settings-close').dblclick();
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('#utility-menu')).toBeHidden();
  await expect(page.locator('#open-menu')).toBeFocused();
  await page.locator('#open-menu').click();
  await expect(page.locator('#utility-menu')).toBeVisible();
});

test('first guide leaves the highlighted furniture tappable on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await enter(page, true);
  await expect(page.locator('.first-guide')).toBeVisible();
  await page.locator('.guide-target').click({ timeout: 5000 });
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('.first-guide')).toHaveCount(0);
  await expect(page.locator('.first-guide-next')).toBeVisible();
  await expect(page.getByRole('button', { name: 'わかった！ 案内おわり' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/guide-step-two.png', animations: 'disabled', scale: 'css' });
  // The guide is optional: either choose now or finish reading without posting.
  await page.getByRole('button', { name: /^だるぽよ/ }).click();
  await expect(page.locator('.first-guide-next')).toHaveCount(0);
  await expect(page.locator('#darupoyo-caption')).toHaveValue('');
  await page.locator('.darupoyo-dialog [data-close]').click();
  await page.locator('[data-chore=meal]').click();
  await expect(page.locator('.first-guide-next')).toHaveCount(0);
});
async function openMenu(page, item) {
  await page.locator('#open-menu').click(); await page.locator(item).click();
}
for (const width of [320, 390, 1280]) {
  test(`repeated navigation and nested installation dialog at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await enter(page);
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const [item, dialog, close] of [['#open-settings', '#settings', '#settings-close'], ['#menu-house', '#house-switcher', '#house-switch-close'], ['#open-howto', '#howto-page', '#howto-close']]) {
        await openMenu(page, item); await expect(page.locator(dialog)).toBeVisible();
        expect(await page.locator(dialog).evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await page.locator(close).dblclick();
        await expect(page.locator(dialog)).toBeHidden();
        await expect(page.locator('#open-menu')).toBeFocused();
      }
    }
    await openMenu(page, '#open-howto');
    await page.locator('.howto-card.is-active').getByRole('button', { name: '5ページ目へ' }).click();
    await page.locator('#install-app').click();
    for (const device of ['ios', 'android', 'desktop']) {
      await page.locator(`[data-choose=${device}]`).click();
      await expect(page.locator(`.install-device[data-device=${device}]`)).toBeVisible();
      expect(await page.locator('.install-guide').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    await page.locator('.install-guide .refined-close').click();
    await expect(page.locator('#howto-page')).toBeVisible();
    await expect(page.locator('#install-app')).toBeFocused();
    await page.screenshot({ path: `test-results/exploratory-howto-${width}.png`, animations: 'disabled' });
    expect(errors).toEqual([]);
  });
}

test('invalid photo, cancellation and preview leave draft intact; blank record has no repeated caption', async ({ page }) => {
  await enter(page);
  await page.locator('[data-chore=meal]').click(); await page.getByRole('button', { name: /^だるぽよ/ }).click();
  const dialog = page.locator('.darupoyo-dialog');
  await page.getByRole('button', { name: '＋ ひとこと', exact: true }).click();
  await dialog.locator('textarea').fill('いったんおやすみ');
  await dialog.locator('[data-file]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken image') });
  await expect(dialog.locator('[role=status]')).toContainText('この写真は開けませんでした');
  await expect(dialog.locator('[data-save]')).toBeEnabled();
  await dialog.locator('[data-file]').dispatchEvent('cancel');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('textarea')).toHaveValue('いったんおやすみ');
  const buffer = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 600; return c.toDataURL().split(',')[1]; }), 'base64');
  await dialog.locator('[data-file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer });
  await expect(dialog.locator('[data-photo]')).toBeVisible();
  await dialog.locator('.darupoyo-preview').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.photo-preview-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-preview-dialog')).toHaveCount(0);
  await expect(dialog.locator('.darupoyo-preview')).toBeFocused();
  await expect(dialog.locator('textarea')).toHaveValue('いったんおやすみ');
  await dialog.locator('[data-remove]').click(); await dialog.locator('textarea').fill('');
  await dialog.locator('[data-save]').dblclick();
  await page.getByRole('button', { name: 'けーじばんを見る', exact: true }).click();
  await expect(page.locator('.pin-grid .pin-card')).toHaveCount(1);
  await expect(page.locator('.pin-grid .pin-text:visible')).toHaveCount(0);
  await page.locator('.pin-grid .pin-card').click();
  await expect(page.locator('.pin-viewer')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.locator('.pin-viewer')).toBeHidden();
  await page.locator('.board-back').dblclick(); await expect(page.locator('#board-view')).toBeHidden();
  await expect(page.locator('#house-view')).not.toHaveAttribute('inert', '');
});

test('long existing names fit album and nested calendar; room remains usable after repeated exits', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 }); await enter(page);
  await page.evaluate(async () => {
    const { client } = await import('/src/api.js');
    const db = JSON.parse(localStorage.getItem('darupoyo-mock'));
    db.houses[client.house].members[client.uid].display_name = 'とっても長い以前のなまえ'.repeat(5);
    localStorage.setItem('darupoyo-mock', JSON.stringify(db));
  });
  await page.reload();
  for (let i = 0; i < 2; i++) {
    await page.locator('.door.is-me').click(); await expect(page.locator('#room-view')).toBeVisible();
    await page.locator('.mr-album').click(); await expect(page.locator('#log-modal')).toBeVisible();
    for (const selector of ['#log-title', '.mr-plate b']) {
      expect(await page.locator(selector).evaluate(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) * 2 + 1)).toBe(true);
    }
    expect(await page.locator('#log-modal').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(page.locator('#log-close')).toBeInViewport();
    await page.locator('#log-calendar').click(); await expect(page.locator('.album-calendar')).toBeVisible();
    await page.getByRole('button', { name: '前の月', exact: true }).click();
    await page.getByRole('button', { name: '次の月', exact: true }).click();
    await page.locator('.cal-close').click(); await expect(page.locator('#log-modal')).toBeVisible();
    await page.screenshot({ path: 'test-results/exploratory-long-album.png', animations: 'disabled', scale: 'css' });
    await page.locator('#log-close').click(); await page.locator('#room-back').dblclick();
    await expect(page.locator('#room-view')).toBeHidden();
    await expect(page.locator('#house-view')).toBeVisible();
  }
});
