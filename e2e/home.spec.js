import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page) {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('もち'); await page.getByLabel('新しいハウスの名前').fill('home');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
// Three more residents join through the API.
const fill = page => page.evaluate(async () => {
  const { client, houseApi, refresh } = await import('/src/api.js');
  const { token } = await houseApi('/invites', {});
  for (const [uid, name] of [['h-sakura', 'さくら'], ['h-rin', 'りん'], ['h-nana', 'なな']]) {
    await fetch('/api/join', { method: 'POST', headers: { Authorization: 'Bearer dev:' + uid + client.uid.slice(0, 6), 'Content-Type': 'application/json' }, body: JSON.stringify({ token, display_name: name }) });
  }
  await refresh();
});

test('the order is 外, 玄関, リビング, 洗面所, ベランダ, みんなの部屋; dots move between them and the bar is gone', async ({ page }) => {
  await enter(page);
  await expect(page.locator('.scene-dot')).toHaveCount(6);
  const labels = await page.locator('#plan > .scene').evaluateAll(n => n.map(s => s.getAttribute('aria-label')));
  expect(labels).toEqual(['外', '玄関', 'リビング', '洗面所', 'ベランダ', 'みんなの部屋']);
  await expect(page.locator('.scene-dot').nth(1)).toHaveAttribute('aria-current', '');
  await expect(page.locator('nav.bar, #shoot, .scene-tab, .walk-arrow, #open-fridge')).toHaveCount(0);
  await page.locator('.scene-dot').nth(3).click();
  await expect(page.locator('[data-scene="wash"]')).toBeInViewport({ ratio: .9 });
});

test('your gal peeks out of the door and says おかえり every time the app opens', async ({ page }) => {
  await enter(page);
  await page.reload(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('#okaeri')).toHaveClass(/is-out/);
  await expect(page.locator('.okaeri-bubble')).toHaveText('おかえり〜！');
  await expect(page.locator('.okaeri-gal .gal-face.has-outfit')).toHaveCount(1);
});

test('rooms: own room first, three doors a page, others dimmed, icons enter rooms', async ({ page }) => {
  await enter(page); await fill(page);
  await expect(page.locator('.scene-dot')).toHaveCount(7);
  const first = page.locator('.rooms-page[data-page="0"] .door');
  await expect(first).toHaveCount(3);
  await expect(first.first()).toHaveClass(/is-me/);
  await expect(page.locator('.rooms-page[data-page="1"] .door')).toHaveCount(1);
  await page.locator('.scene-dot').nth(5).click();
  await expect(page.locator('#hall-bar')).toBeVisible();
  await expect(page.locator('#hall-icons .hall-icon')).toHaveCount(4);
  await expect(page.locator('#hall-icons .hall-icon.is-away')).toHaveCount(1);
  await page.locator('.scene-dot').nth(6).click();
  await expect(page.locator('#hall-icons .hall-icon.is-away')).toHaveCount(3);
  await page.locator('#hall-icons .hall-icon').last().click();
  await expect(page.locator('#room-view')).toBeVisible();
  await expect(page.locator('.mr-plate b')).toHaveText('ななの部屋');
  await page.locator('#room-back').click();
  await expect(page.locator('.rooms-page[data-page="1"]')).toBeInViewport({ ratio: .9 });
  await page.locator('.scene-dot').nth(1).click();
  await expect(page.locator('#hall-bar')).toBeHidden();
});

test('theme colors are unique in a house and dress the clothes you hang', async ({ page }) => {
  await enter(page); await fill(page);
  const themes = await page.evaluate(async () => { const { houseApi } = await import('/src/api.js'); const d = await houseApi('/dashboard'); return d.house.member_ids.map(u => d.house.members[u].theme); });
  expect(new Set(themes).size).toBe(4);
  await page.locator('.scene-dot').nth(5).click(); await page.locator('.door.is-me').click();
  await page.locator('#room-paint').click();
  await expect(page.locator('.paint-chip')).toHaveCount(16);
  await expect(page.locator('.paint-chip:disabled')).toHaveCount(3);
  await page.getByRole('button', { name: 'ティール', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ティール', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#room-back').click();
  // before laundry the pole is empty and the basket full; after it, your clothes hang in your color
  await page.locator('.scene-dot').nth(4).click();
  await expect(page.locator('.hung-clothes')).toBeHidden();
  await expect(page.locator('.basket-pile')).toBeVisible();
  await page.evaluate(async () => { const { houseApi, refresh } = await import('/src/api.js'); await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'laundry', method: 'rhythm', hits: 6, total_beats: 8, duration_seconds: 8 }); await refresh(); });
  await expect(page.locator('.hung-clothes')).toBeVisible();
  await expect(page.locator('.basket-pile')).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--my-outfit').trim())).toBe('#7FD6CF');
  await expect(page.locator('.laundry-basket .sparkles')).toBeVisible();
});

test('trash cans empty and sparkle once you took the garbage out', async ({ page }) => {
  await enter(page);
  await page.locator('.scene-dot').nth(0).click();
  await expect(page.locator('.trash-pile')).toBeVisible();
  await page.evaluate(async () => {
    const { houseApi, refresh } = await import('/src/api.js');
    const c = document.createElement('canvas'); c.width = 40; c.height = 40; const g = c.getContext('2d'); g.fillRect(0, 0, 20, 40);
    const cut = await houseApi('/media?kind=cutout', await new Promise(r => c.toBlob(r, 'image/png')));
    const landmarks = Array.from({ length: 33 }, (_, i) => ({ x: .5, y: i / 40, z: 0, visibility: 1 }));
    await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'garbage', method: 'pose', media_id: cut.id, landmarks });
    await refresh();
  });
  await expect(page.locator('.trash-pile')).toBeHidden();
  await expect(page.locator('.trash-cans .sparkles')).toBeVisible();
});
