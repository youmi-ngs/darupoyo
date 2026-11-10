import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });

const dryer = page => page.evaluate(async () => { const { houseApi, refresh } = await import('/src/api.js'); const r = await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'dryer', method: 'sound', duration_seconds: 11 }); await refresh(); return r.post.id; });
async function newHouse(page, name, first = false) {
  if (!first) { await page.locator('#open-menu').click(); await page.locator('#menu-house').click(); await page.locator('#house-add').click(); }
  else await setWelcomeName(page, 'もち');
  await setHouseName(page, name);
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
}

test('マイページ picks, one house at a time, which other houses this house may see', async ({ page }) => {
  await page.goto('/');
  await newHouse(page, '実家', true); const home = await dryer(page);
  await newHouse(page, '寮'); await dryer(page);
  await newHouse(page, '新居');
  // a friend moves into 新居
  const friend = 'Bearer dev:friend' + Date.now();
  await page.evaluate(async friend => {
    const { houseApi } = await import('/src/api.js'); const { token } = await houseApi('/invites', {});
    await fetch('/api/join', { method: 'POST', headers: { Authorization: friend, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, display_name: 'ともだち' }) });
  }, friend);
  const seen = () => page.evaluate(async friend => {
    const { client } = await import('/src/api.js');
    const me = client.uid, house = client.house;
    const r = await fetch(`/api/houses/${house}/members/${me}/history`, { headers: { Authorization: friend } });
    return r.status === 200 ? (await r.json()).items.map(p => p.id) : r.status;
  }, friend);
  expect(await seen()).toBe(403);

  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  const card = page.locator('#history-share-card');
  await expect(card.locator('li')).toHaveCount(2);
  const jikka = card.getByRole('button', { name: '「実家」での記録を見せる' }), ryo = card.getByRole('button', { name: '「寮」での記録を見せる' });
  await expect(jikka).toHaveAttribute('aria-pressed', 'false');
  await jikka.click();
  await expect(jikka).toHaveAttribute('aria-pressed', 'true');
  await expect(ryo).toHaveAttribute('aria-pressed', 'false');
  expect(await seen()).toEqual([home]);
  await jikka.click();
  await expect(jikka).toHaveAttribute('aria-pressed', 'false');
  expect(await seen()).toBe(403);
});

test('with one house there is nothing to pick yet', async ({ page }) => {
  await page.goto('/'); await newHouse(page, 'ひとつ', true);
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('#history-share-card')).toContainText('ほかのハウスにも住むと、ここで選べるよ');
});
