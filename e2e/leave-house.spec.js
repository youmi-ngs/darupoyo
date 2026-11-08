import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1')); });
async function enter(page, house = 'たいきょ') {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('もち'); await page.getByLabel('新しいハウスの名前').fill(house);
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
// bob joins through the API; returns his token so the test can look from his side.
const addBob = page => page.evaluate(async () => {
  const { client, houseApi, refresh } = await import('/src/api.js');
  const { token } = await houseApi('/invites', {}); const bob = 'Bearer dev:bob' + client.uid.slice(0, 6);
  await fetch('/api/join', { method: 'POST', headers: { Authorization: bob, 'Content-Type': 'application/json' }, body: JSON.stringify({ token, display_name: 'ぼぶ' }) });
  await refresh(); return { bob, house: client.house };
});
const openSettings = async page => { await page.locator('#open-menu').click(); await page.locator('#open-settings').click(); };

test('with others in the house you can move out, and the house stays for them', async ({ page }) => {
  await enter(page);
  const { bob, house } = await addBob(page);
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'ハウスを削除' })).toBeDisabled();
  await expect(page.locator('#delete-house-note')).toHaveText('ほかの住人がいる間は、ハウスを削除できないよ');
  await page.getByRole('button', { name: 'ハウスから退去' }).click();
  const dialog = page.getByRole('dialog', { name: 'ハウスから退去の確認' });
  await expect(dialog.locator('h2')).toHaveText('「たいきょ」から退去しますか？');
  await expect(dialog.getByRole('button', { name: '退去する' })).toBeDisabled();
  await dialog.getByLabel('削除する内容を確認しました').check();
  await dialog.getByRole('button', { name: '退去する' }).click();
  // back to the start, with no house of your own any more
  await expect(page.locator('.onboarding h2')).toHaveText('だるぽよへようこそ');
  await expect(page.getByRole('button', { name: /に入る$/ })).toHaveCount(0);
  const left = await page.evaluate(async ([bob, house]) => (await (await fetch(`/api/houses/${house}/dashboard`, { headers: { Authorization: bob } })).json()).house.member_ids.length, [bob, house]);
  expect(left).toBe(1);
});

test('the last resident deletes the house; there is nothing to move out of', async ({ page }) => {
  await enter(page, 'ひとり');
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'ハウスから退去' })).toBeHidden();
  await expect(page.locator('#delete-house-note')).toBeHidden();
  await page.getByRole('button', { name: 'ハウスを削除' }).click();
  const dialog = page.getByRole('dialog', { name: 'ハウス削除の確認' });
  await expect(dialog.locator('h2')).toHaveText('「ひとり」を削除しますか？');
  await dialog.getByRole('button', { name: 'やめる' }).click();
  await expect(dialog).toBeHidden();
  await openSettings(page); await page.getByRole('button', { name: 'ハウスを削除' }).click();
  await dialog.getByLabel('削除する内容を確認しました').check();
  await dialog.getByRole('button', { name: 'ハウスを削除' }).click();
  await expect(page.locator('.onboarding h2')).toHaveText('だるぽよへようこそ');
  expect(await page.evaluate(async () => { const { api } = await import('/src/api.js'); return (await api('/houses')).items.length; })).toBe(0);
});
