import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => ['darupoyo:entered', 'darupoyo:guide-ready'].forEach(event => window.addEventListener(event, () => queueMicrotask(() => document.querySelector('.first-guide [data-skip]')?.click())))); });
async function newHouse(page, name, first = false) {
  if (!first) { await page.locator('#open-menu').click(); await page.locator('#menu-house').click(); await page.locator('#house-add').click(); }
  else await setWelcomeName(page, 'もち');
  await setHouseName(page, name);
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
}
const listIn = (page, name, path) => page.evaluate(async ([name, path]) => {
  const { client, api } = await import('/src/api.js');
  const id = client.houses.find(h => h.name === name).id;
  return (await api('/houses/' + id + path)).items;
}, [name, path]);

test('だるぽよ: the 共有範囲 pill picks houses, and the record shows up in each of them', async ({ page }) => {
  await page.goto('/');
  await newHouse(page, '実家', true);
  await newHouse(page, '寮');
  await page.locator('.scene-dot').nth(2).click(); await page.locator('[data-chore="meal"]').click(); await page.getByRole('button', { name: /^だるぽよ/ }).click();
  await expect(page.locator('#darupoyo-caption')).toHaveAttribute('placeholder', '書かんくてもおけ'); // #226
  const chip = page.locator('.darupoyo-dialog .audience-chip');
  await expect(chip).toHaveText(/寮/);
  await chip.click();
  const sheet = page.locator('dialog.audience-sheet');
  await expect(sheet.getByRole('checkbox', { name: /寮/ })).toBeChecked();
  await expect(sheet.getByRole('checkbox', { name: /寮/ })).toBeDisabled();
  await sheet.getByRole('checkbox', { name: 'すべてのハウス' }).check();
  await expect(sheet.getByRole('checkbox', { name: '実家' })).toBeChecked();
  await sheet.getByRole('button', { name: 'けってい' }).click();
  await expect(chip).toHaveText(/すべてのハウス/);
  await page.getByRole('button', { name: 'きょーゆー' }).click();
  await expect(page.locator('.darupoyo-dialog.is-success')).toBeVisible();
  expect((await listIn(page, '実家', '/darupoyo')).length).toBe(1);
  expect((await listIn(page, '寮', '/darupoyo')).length).toBe(1);
});

test('a chore record: by default it stays in this house; picking 実家 posts it there too', async ({ page }) => {
  await page.goto('/');
  await newHouse(page, '実家', true);
  await newHouse(page, '寮');
  // dryer: post with the default (this house only)
  await page.evaluate(async () => { const { houseApi, refresh } = await import('/src/api.js'); await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'dryer', method: 'sound', duration_seconds: 11, share_to: [] }); await refresh(); });
  expect((await listIn(page, '実家', '/posts')).length).toBe(0);
  // うちらのなう with 実家 picked
  await page.evaluate(async () => {
    const { houseApi, client } = await import('/src/api.js');
    const c = document.createElement('canvas'); c.width = 60; c.height = 60; c.getContext('2d').fillRect(0, 0, 60, 60);
    const media = await houseApi('/media?kind=selfie', await new Promise(r => c.toBlob(r, 'image/jpeg')));
    const home = client.houses.find(h => h.name === '実家').id;
    await houseApi('/moments', { request_id: crypto.randomUUID(), media_id: media.id, caption: 'おは', share_to: [home] });
  });
  expect((await listIn(page, '実家', '/moments')).map(m => m.caption)).toEqual(['おは']);
  // the pill shows on the うちらのなう card too
  await page.locator('#open-moments, [data-open-moments]').first().click();
  await expect(page.locator('.now-dialog .audience-chip')).toHaveText(/寮/);
});

test('from やっほ〜 you can go back and fix the name you just typed', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('あなたの名前').fill('もちい');
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.locator('.onboarding h2')).toHaveText('やっほ〜');
  await page.getByRole('button', { name: '名前にもどる' }).click();
  await expect(page.getByLabel('あなたの名前')).toHaveValue('もちい');
  await page.getByLabel('あなたの名前').fill('もち');
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await expect(page.locator('.onboarding h2')).toHaveText('やっほ〜');
  await page.getByRole('button', { name: '新しく家をつくる' }).click(); await page.getByLabel('新しいハウスの名前').fill('なまえ');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  const me = await page.evaluate(async () => { const { client } = await import('/src/api.js'); const d = await (await import('/src/api.js')).houseApi('/dashboard'); return d.house.members[client.uid].display_name; });
  expect(me).toBe('もち');
});
