import { setWelcomeName, setHouseName } from '../e2e/onboarding-helper.js';
import { test, expect } from '@playwright/test';
import { playRhythm, stillCamera } from '../e2e/rhythm-helper.js';
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
});

test('two tabs share the mock house and see each other clear chores', async ({ page, context }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let apiCalls = 0; page.on('request', r => { if (r.url().includes('/api/')) apiCalls++; });
  await page.goto('/');
  await setWelcomeName(page, 'もち');
  await setHouseName(page, 'モックハウス');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);

  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('#settings-invite')).not.toHaveText('友だちを招待しよう');
  const code = await page.locator('#settings-invite').textContent();

  await stillCamera(context);
  const friend = await context.newPage();
  await friend.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await friend.goto('/'); await setWelcomeName(friend, 'ともだち'); await friend.getByRole('button',{name:'友達のハウスに入る',exact:true}).click(); await friend.getByLabel('招待コード').fill(code);

  await friend.getByRole('button', { name: '招待に参加する' }).click();
  await expect(friend.locator('.onboarding')).toHaveCount(0);
  await friend.getByRole('button', { name: 'おじゃまします！' }).click();
  await expect(page.locator('.doors .door')).toHaveCount(2, { timeout: 8000 });

  await friend.locator('.scene-dot').nth(4).click();
  await friend.locator('[data-chore="laundry"]').click();
  await friend.getByRole('button', { name: /^干す/ }).click();
  await playRhythm(friend, 8);
  await friend.getByRole('button', { name: '部屋に飾る', exact: true }).click();
  await expect(friend.getByText('記録できた！')).toBeVisible();
  await expect(page.locator('.door.is-lit')).toHaveCount(1, { timeout: 8000 });
  expect(apiCalls).toBe(0); // nothing left the browser
  expect(errors).toEqual([]);
});
