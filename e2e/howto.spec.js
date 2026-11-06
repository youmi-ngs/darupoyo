import { test, expect } from '@playwright/test';
test('how-to opens automatically only on the first entry (#14)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('はじめて'); await page.getByLabel('新しいハウスの名前').fill('howto'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('#howto-page')).toBeVisible();
  await page.getByRole('button', { name: 'はじめる', exact: true }).click();
  await expect(page.locator('#howto-page')).toBeHidden();
  await page.locator('#open-menu').click(); await expect(page.locator('#menu')).toBeVisible(); await page.locator('#menu-close').click();
  await page.reload(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('.door')).toHaveCount(1);
  await expect(page.locator('#howto-page')).toBeHidden();
  await context.close();
});
test('how-to is six picture cards that fit a small phone without scrolling (#57)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } }); const page = await context.newPage();
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('え'); await page.getByLabel('新しいハウスの名前').fill('pics'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('#howto-page')).toBeVisible();
  await expect(page.locator('.howto-cards li')).toHaveCount(6);
  await expect(page.locator('.howto-cards li svg')).toHaveCount(6);
  expect(await page.locator('#howto-page .drawer-inner').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await expect(page.getByRole('button', { name: 'はじめる', exact: true })).toBeInViewport();
  await context.close();
});
