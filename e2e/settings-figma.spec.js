import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page) {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('なまえ'); await page.getByLabel('新しいハウスの名前').fill('おんたまハウス');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}

test('マイページ follows the Figma mypage frame (#152)', async ({ page }) => {
  await enter(page);
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  const settings = page.locator('#settings');
  // Cards stay in Figma order; history sharing has no settings section.
  await expect(settings.locator('.set-card:visible .drawer-h').first()).toHaveText('アカウント');
  await expect(settings.locator('.set-card:visible > .drawer-h, .set-card:visible .push-row > .drawer-h')).toHaveText(['アカウント', 'ハウス', 'ほめてくれるギャル', '効果音']);
  // the invite code shows in the house card; no extra 招待リンク button or photo card
  await expect(page.locator('#settings-invite')).not.toHaveText('友だちを招待しよう');
  await expect(settings.getByRole('button', { name: '招待リンク', exact: true })).toHaveCount(0);
  await expect(settings.getByText('プロフィール写真', { exact: true })).toHaveCount(0);
  await expect(settings.getByText('準備中です')).toHaveCount(0);
  await expect(page.locator('#settings-members span')).toHaveText(['なまえ']);
  await expect(page.locator('.account-management button')).toHaveText(['アカウントを削除', 'ハウスを削除', 'ログアウト']);
  await expect(settings.locator('#share-history')).toHaveCount(0);
  await expect(settings.locator('#social-card')).toBeHidden();
  await expect(settings.getByText('ほかのハウスの記録を見せる')).toHaveCount(0);
  // the required weather credits stay
  await expect(page.locator('.data-credits')).toContainText('気象データ提供：株式会社ウェザーニューズ');
});

test('titles, dialog boxes and the how-to swipe area never show a blue ring (#153)', async ({ page }) => {
  await enter(page);
  await page.keyboard.press('Tab'); // keyboard mode makes :focus-visible apply, the hardest case
  const ring = loc => page.locator(loc).evaluate(el => getComputedStyle(el).outlineStyle);
  for (const [open, title, others] of [['#open-settings', '#settings-title', ['#settings']], ['#open-howto', '#howto-title', ['#howto-page', '#howto-track']], ['#menu-house', '#house-switch-title', ['#house-switcher']]]) {
    await page.locator('#open-menu').click(); await page.locator(open).click();
    await expect(page.locator(title)).toBeFocused();
    expect(await ring(title)).toBe('none');
    // a tap on text inside lands focus on the box or the swipe area
    for (const box of others) { await page.locator(box).evaluate(el => el.focus()); expect(await ring(box)).toBe('none'); }
    await page.keyboard.press('Escape');
  }
  // the Check.exe sheet box too
  await page.locator('.scene-dot').nth(2).click(); await page.locator('[data-chore="meal"]').click();
  await page.locator('#sheet').evaluate(el => el.focus()); expect(await ring('#sheet')).toBe('none');
});

test('あそびかた has no はじめる button on any page (#154)', async ({ page }) => {
  await enter(page);
  await page.locator('#open-menu').click(); await page.locator('#open-howto').click();
  await page.locator('.howto-card.is-active').getByRole('button', { name: '4ページ目へ' }).click();
  await expect(page.locator('.howto-card').last()).toHaveClass(/is-active/);
  await expect(page.locator('#howto-page').getByRole('button', { name: 'はじめる' })).toHaveCount(0);
  await page.locator('#howto-close').click(); await expect(page.locator('#howto-page')).toBeHidden();
});

test('each menu page closes from the same spot as the hamburger, on phone and PC', async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 390) await enter(page);
    const ham = await page.locator('#open-menu').boundingBox();
    for (const [open, close] of [['#open-settings', '#settings-close'], ['#open-howto', '#howto-close'], ['#menu-house', '#house-switch-close']]) {
      await page.locator('#open-menu').click(); await page.locator(open).click();
      await expect.poll(() => page.locator(close).boundingBox()).toEqual(ham); // after the slide-in
      await page.locator(close).click();
    }
  }
});

test('tapping the house invite code copies the code itself', async ({ page }) => {
  await enter(page);
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.copied = t; return Promise.resolve(); } } }));
  const code = page.locator('#settings-invite');
  await expect(code).not.toHaveText('友だちを招待しよう');
  await expect(code).toHaveAccessibleName(/^招待コード .+ をコピー$/);
  await code.click();
  await expect(page.locator('#invite-status')).toContainText('招待コードをコピーしたよ');
  expect(await page.evaluate(() => window.copied)).toBe(await code.textContent());
});

test('buttons show no ring after a tap or when a dialog focuses them, but keep it for Tab', async ({ page }) => {
  await enter(page);
  const ring = loc => page.locator(loc).evaluate(el => getComputedStyle(el).outlineStyle);
  // a dialog that focuses its close button when it opens
  await page.locator('.scene-dot').nth(2).click(); await page.locator('[data-chore="meal"]').click();
  const auto = page.locator('#sheet button:focus');
  await expect(auto).toHaveCount(1);
  expect(await auto.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  await page.locator('#sheet-close').click();
  // a tapped button
  await page.locator('#open-menu').click(); expect(await ring('#open-menu')).toBe('none');
  await page.keyboard.press('Escape');
  // keyboard users still see where they are
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  expect(await focused.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
});
