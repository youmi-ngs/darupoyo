import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page) {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, 'home');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
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
  await expect(page.locator('.okaeri-gal .resident-character')).toHaveCount(1);
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
  await expect(page.locator('.mr-dark p')).toHaveText('ななはまだ寝てるっぽい…');
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

test('the bird on the pole talks in gal slang and the black cat stays only while there is garbage', async ({ page }) => {
  await enter(page);
  await page.locator('.scene-dot').nth(4).click();
  await page.locator('.pole-bird').click();
  await expect(page.locator('.pole-bird')).toHaveClass(/is-talking/);
  await expect(page.locator('.pole-bird .critter-bubble')).not.toHaveText('');
  await page.locator('.scene-dot').nth(0).click();
  await expect(page.locator('.trash-cat')).toBeVisible();
  await page.locator('.trash-cat').click();
  await expect(page.locator('.trash-cat .critter-bubble')).toHaveText(/にゃ|ごろごろ/);
  await page.evaluate(async () => {
    const { houseApi, refresh } = await import('/src/api.js');
    const c = document.createElement('canvas'); c.width = 40; c.height = 40; c.getContext('2d').fillRect(0, 0, 20, 40);
    const cut = await houseApi('/media?kind=cutout', await new Promise(r => c.toBlob(r, 'image/png')));
    await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'garbage', method: 'pose', media_id: cut.id, landmarks: Array.from({ length: 33 }, (_, i) => ({ x: .5, y: i / 40, z: 0, visibility: 1 })) });
    await refresh();
  });
  await expect(page.locator('.trash-cat')).toHaveCSS('opacity', '0');
});


test('furniture touch has no outline; keyboard focus remains visible (#132)', async ({ page }) => {
  await enter(page);
  await page.locator('.scene-dot').first().click();
  const furniture = page.locator('.outside-house');
  await furniture.tap();
  await expect(furniture).toHaveCSS('outline-style', 'none');
  await expect(furniture).toHaveCSS('-webkit-tap-highlight-color', 'rgba(0, 0, 0, 0)');
  await furniture.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(furniture).toBeFocused();
  await expect(furniture).toHaveCSS('outline-style', 'solid');
  await expect(furniture).toHaveCSS('outline-width', '3px');
});

test('diners sit on the existing chairs, stay centered and fit a six-person house (#135 #141)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.locator('.scene-dot').nth(2).click();
  await expect.poll(async () => Math.abs((await page.locator('[data-scene=ldk]').boundingBox()).x)).toBeLessThan(1);
  await page.evaluate(async () => {
    const { renderActivities } = await import('/src/resident-activities.js');
    const ids = ['one','two','three','four','five','six'];
    const gals = ['heisei','reiwa','kuro','hime'];
    renderActivities({ house: { member_ids: ids, members: Object.fromEntries(ids.map((id,i) => [id, { display_name:id, gal:gals[i%4], theme:'pink' }])) }, state: { activity: Object.fromEntries(ids.map(id => [id, { chore:'meal', at:new Date().toISOString(), phase:'started', gal:'reiwa' }])) } });
  });
  // Measure chair alignment without the scene's decorative sway animation.
  await page.addStyleTag({ content: '.plan, .plan * { animation: none !important; transition: none !important; }' });
  const seats = page.locator('.meal-seats .resident-avatar');
  await expect(seats).toHaveCount(6);
  const layout = await page.locator('.meal-seats').evaluate(group => {
    const box = group.getBoundingClientRect();
    return [...group.children].map(figure => {
      const b=figure.getBoundingClientRect(), art=figure.querySelector('.resident-art').getBoundingClientRect();
      return { x:(b.x+b.width/2-box.x)/box.width, seatY:(b.y+75-box.y)/box.height, centered:Math.abs(art.x+art.width/2-b.x-b.width/2), left:b.x,right:b.right };
    });
  });
  expect(layout[0].x).toBeCloseTo(25/180, 2);
  expect(layout[1].x).toBeCloseTo(155/180, 2);
  expect(layout[0].seatY).toBeCloseTo(70/120, 2);
  for(const item of layout) { expect(item.centered).toBeLessThan(1); expect(item.left).toBeGreaterThanOrEqual(0); expect(item.right).toBeLessThanOrEqual(390); }
});

test('outside house is complete artwork clipped at the edge; balcony moon stays above the pole (#139 #137)', async ({ page }) => {
  await page.setViewportSize({ width:390,height:667 });
  await enter(page); await page.locator('.scene-dot').first().click();
  await expect.poll(async () => Math.abs((await page.locator('[data-scene=outside]').boundingBox()).x)).toBeLessThan(1);
  const outside=page.locator('.outside-house');
  expect(await outside.locator('use').getAttribute('href')).toBe('/furniture/outside-house.svg#art');
  const bounds=await outside.boundingBox(); expect(bounds.x).toBeGreaterThan(0); expect(bounds.x+bounds.width).toBeGreaterThan(390);
  await page.locator('.scene-dot').nth(4).click();
  await page.evaluate(()=>document.body.dataset.daylight='night');
  await expect.poll(async () => Math.abs((await page.locator('[data-scene=balcony]').boundingBox()).x)).toBeLessThan(1);
  const moon=await page.locator('.sv-balcony .sv-sun').boundingBox(), pole=await page.locator('.balcony-pole').boundingBox();
  expect(moon.y+moon.height).toBeLessThan(pole.y+16);
});

test('a record without a photo shows the gal doing it in the enlarged けーじばん view too, not sound bars', async ({ page }) => {
  await enter(page);
  await page.evaluate(async () => { const { houseApi, refresh } = await import('/src/api.js'); await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'dryer', method: 'sound', duration_seconds: 11 }); await refresh(); });
  await page.locator('#open-board').click();
  await expect(page.locator('.pin-grid .pin-post .pin-photo.is-drawing .resident-character')).toHaveCount(1);
  await page.locator('.pin-grid .pin-post').click();
  const photo = page.locator('#photo-modal .pm-photo');
  await expect(photo.locator('.resident-character')).toBeVisible();
  await expect(photo.locator('.wave')).toHaveCount(0);
});
