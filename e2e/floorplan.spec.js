import { test, expect } from '@playwright/test';
test.beforeEach(async({context})=>{await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));});
test('floor plan shows every member up to six (#15)', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('住人1'); await page.getByLabel('新しいハウスの名前').fill('six'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('#open-menu').click();
  await expect(page.locator('.map-room:visible')).toHaveCount(1);
  await expect(page.locator('#map-plan')).not.toHaveClass(/many-rooms/);
  await page.locator('#menu-close').click();
  await page.evaluate(async () => {
    const uid = localStorage.getItem('darupoyo-uid'), house = localStorage.getItem('darupoyo-house-' + uid);
    const { token } = await fetch('/api/houses/' + house + '/invites', { method: 'POST', headers: { Authorization: 'Bearer dev:' + uid, 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
    for (const n of [2, 3, 4, 5, 6]) { const r = await fetch('/api/join', { method: 'POST', headers: { Authorization: 'Bearer dev:' + crypto.randomUUID(), 'Content-Type': 'application/json' }, body: JSON.stringify({ token, display_name: '住人' + n }) }); if (!r.ok) throw new Error('join ' + r.status); }
  });
  await expect(page.locator('.doors .door')).toHaveCount(6, { timeout: 10000 });
  await page.locator('#open-menu').click();
  await expect(page.locator('.map-room:visible')).toHaveCount(6);
  await expect(page.locator('#map-plan')).toHaveClass(/many-rooms/);
  await expect(page.locator('.map-room:visible').last()).toHaveText('住人6のへや');
  await page.locator('.map-room:visible').last().click();
  await expect(page.locator('.mr-plate b')).toHaveText('住人6の部屋');
});
