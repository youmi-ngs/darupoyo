import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('のぶぽよ');
  await page.getByLabel('新しいハウスの名前').fill('おんたまハウス');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
});

async function open(page, id) {
  await page.locator('#open-menu').click();
  await expect(page.locator('#open-menu')).toHaveAttribute('aria-expanded', 'true');
  await page.locator(id).click();
}

test('menu, profile editing, gal and sound preferences survive reopening', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page, '#open-settings');
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#settings-house-name')).toHaveText('おんたまハウス');
  await page.locator('#account-edit').click();
  await page.locator('[name=display_name]').fill('もち');
  await page.locator('#account-form [type=submit]').click();
  await expect(page.locator('.account-row b')).toHaveText('もち');
  await page.locator('#house-edit').click();
  await page.locator('[name=house_name]').fill('もちハウス');
  await page.locator('#house-form [type=submit]').click();
  await expect(page.locator('#settings-house-name')).toHaveText('もちハウス');
  await page.getByRole('button', { name: '姫ギャル', exact: true }).click();
  await expect(page.getByRole('button', { name: '姫ギャル', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sound-toggle').click();
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#copy-invite').click();
  await expect(page.locator('#settings-invite')).toHaveText(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
  await page.locator('#settings-close').click();
  await expect(page.locator('#open-menu')).toBeFocused();
  await page.reload();
  await open(page, '#open-settings');
  await expect(page.locator('#settings-house-name')).toHaveText('もちハウス');
  await expect(page.locator('#sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '姫ギャル', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('#settings img').evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0))).toBe(true);
  await page.screenshot({ animations: 'disabled', scale: 'css', path: 'test-results/settings-mypage.png' });
  expect(errors).toEqual([]);
});

test('tutorial pages work with dots, keyboard and touch swipes', async ({ page }) => {
  await open(page, '#open-howto');
  await expect(page.locator('.howto-card.is-active h3')).toHaveText('おうち、ぶらっとしよ〜');
  await page.screenshot({ animations: 'disabled', scale: 'css', path: 'test-results/settings-howto-1.png' });
  await page.locator('.howto-card.is-active').getByRole('button', { name: '2ページ目へ' }).click();
  await expect(page.locator('.howto-card.is-active h3')).toHaveText('できたら、記録しよ♡');
  await page.locator('#howto-track').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.howto-card.is-active h3')).toHaveText('みんなの「できた」見よ！');
  const session = await page.context().newCDPSession(page);
  const box = await page.locator('#howto-track').boundingBox();
  const y = box.y + 220;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 50, y }] });
  for (let x = box.x + box.width - 70; x > box.x + 40; x -= 25) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.howto-card.is-active h3')).toHaveText('うちら、意外とやってる♡');
  await page.screenshot({ animations: 'disabled', scale: 'css', path: 'test-results/settings-howto-4.png' });
  await expect(page.locator('#howto-page').getByRole('button', { name: 'はじめる' })).toHaveCount(0); // #154
  await page.locator('#howto-close').click();
  await expect(page.locator('#howto-page')).not.toBeVisible();
  await page.locator('#open-menu').click();
  await page.screenshot({ animations: 'disabled', scale: 'css', path: 'test-results/settings-menu.png' });
  await page.locator('#open-menu').click();
  await expect(page.locator('#open-menu')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#open-menu').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#open-menu')).toHaveAttribute('aria-expanded', 'false');
});

test('house picker selects existing houses and preserves the signed-in user', async ({ page }) => {
  await open(page, '#menu-house');
  await expect(page.locator('.house-choice[aria-current]')).toContainText('おんたまハウス');
  await page.locator('#house-add').click();
  await page.getByLabel('あなたの名前').fill('のぶぽよ');
  await page.getByLabel('新しいハウスの名前').fill('ふたつめハウス');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await open(page, '#menu-house');
  await expect(page.locator('.house-choice')).toHaveCount(2);
  await page.screenshot({ animations: 'disabled', scale: 'css', path: 'test-results/settings-houses.png' });
  await page.getByRole('button', { name: 'おんたまハウス このおうちへ →' }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await open(page, '#open-settings');
  await expect(page.locator('#settings-house-name')).toHaveText('おんたまハウス');
});
