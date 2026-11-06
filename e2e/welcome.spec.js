import { test, expect } from '@playwright/test';
test.beforeEach(async({context})=>{await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));});

test('joining by invite shows who you will live with, creating a house does not (#16)', async ({ page, browser }) => {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('まりん'); await page.getByLabel('新しいハウスの名前').fill('温玉'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('.move-in')).toHaveCount(0);
  await page.locator('#open-menu').click(); await page.getByRole('button', { name: '友だちを招待する' }).click();
  const url = await page.getByRole('textbox', { name: '招待リンク', exact: true }).inputValue();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const friend = await context.newPage();
  await friend.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await friend.goto(url); await friend.getByLabel('あなたの名前').fill('ともだち'); await friend.getByRole('button', { name: '招待に参加する' }).click();
  await expect(friend.getByRole('heading', { name: 'まりんと一緒に住む！' })).toBeVisible();
  await expect(friend.locator('.move-in .sheet-text')).toContainText('温玉');
  await friend.getByRole('button', { name: 'おじゃまします！' }).click();
  await expect(friend.locator('.move-in')).toBeHidden();
  await friend.reload(); await expect(friend.locator('.onboarding')).toHaveCount(0); await expect(friend.locator('.move-in')).toHaveCount(0);
  await context.close();
});
