import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
});

test('two tabs share the mock house and see each other clear chores', async ({ page, context }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let apiCalls = 0; page.on('request', r => { if (r.url().includes('/api/')) apiCalls++; });
  await page.goto('/');
  await expect(page.locator('.onboarding [role=status]')).toContainText('モックで動いています');
  await page.getByLabel('あなたの名前').fill('もち');
  await page.getByLabel('新しいハウスの名前').fill('モックハウス');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('#open-menu').click();
  await page.getByRole('button', { name: '友だちを招待する' }).click();
  const code = await page.getByRole('textbox', { name: '招待コード', exact: true }).inputValue();

  const friend = await context.newPage();
  await friend.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await friend.goto('/'); await friend.getByRole('button', { name: '招待コードで入る' }).click(); await friend.getByLabel('招待コード').fill(code);
  await friend.getByLabel('あなたの名前').fill('ともだち');
  await friend.getByRole('button', { name: '招待に参加する' }).click();
  await expect(friend.locator('.onboarding')).toHaveCount(0);
  await friend.getByRole('button', { name: 'おじゃまします！' }).click();
  await expect(page.locator('.doors .door')).toHaveCount(2, { timeout: 8000 });

  await friend.locator('[data-go="3"].scene-tab').click();
  await friend.locator('[data-chore="laundry"]').click();
  await friend.getByRole('button', { name: /洗濯リズム/ }).click();
  await friend.getByRole('button', { name: 'リズムをはじめる' }).click();
  for (let i = 0; i < 8; i++) {
    await expect(friend.locator('.capture-beat.on')).toBeVisible({ timeout: 2000 }).catch(() => {});
    await friend.locator('.capture-beat').click().catch(() => {});
  }
  await friend.getByRole('button', { name: '部屋に飾る', exact: true }).click();
  await expect(friend.getByText('記録できた！')).toBeVisible();
  await expect(page.locator('.door.is-lit')).toHaveCount(1, { timeout: 8000 });
  expect(apiCalls).toBe(0); // nothing left the browser
  expect(errors).toEqual([]);
});
