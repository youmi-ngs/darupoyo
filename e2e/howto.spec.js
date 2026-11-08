import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test('how-to opens automatically only on the first entry (#14)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  await page.goto('/'); await setWelcomeName(page, 'はじめて'); await setHouseName(page, 'howto'); await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('#howto-page')).toBeVisible();
  await page.locator('.howto-card.is-active').getByRole('button', { name: '5ページ目へ' }).click();
  await expect(page.locator('#howto-page').getByRole('button', { name: 'はじめる' })).toHaveCount(0); // #154
  await page.locator('#howto-close').click();
  await expect(page.locator('#howto-page')).toBeHidden();
  await page.locator('#open-menu').click(); await page.locator('#open-howto').click(); await expect(page.locator('#howto-page')).toBeVisible(); await page.locator('#howto-close').click();
  await page.reload(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('.door')).toHaveCount(1);
  await expect(page.locator('#howto-page')).toBeHidden();
  await context.close();
});
test('how-to has five swipe cards on a small phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } }); const page = await context.newPage();
  await page.goto('/'); await setWelcomeName(page, 'え'); await setHouseName(page, 'pics'); await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click();
  await expect(page.locator('#howto-page')).toBeVisible();
  await expect(page.locator('.howto-card')).toHaveCount(5);
  await expect(page.locator('.howto-illustration')).toHaveCount(4);
  expect(await page.locator('#howto-page').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.locator('.howto-card.is-active').getByRole('button', { name: '5ページ目へ' }).click();
  await expect(page.locator('.howto-card').last()).toHaveClass(/is-active/);
  await expect(page.locator('#howto-close')).toBeInViewport();
  await context.close();
});
