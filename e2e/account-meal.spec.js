import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
});
async function enter(page) {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('もち'); await page.getByLabel('新しいハウスの名前').fill('new features');
  await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
test('account deletion is confirmed, removes data and returns to onboarding', async ({ page }) => {
  await enter(page);
  const prior = await page.evaluate(async () => { const { client } = await import('/src/api.js'); return {uid:client.uid, house:client.house}; });
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click(); await page.locator('#delete-account').click();
  await expect(page.locator('.delete-dialog [data-confirm]')).toBeDisabled();
  await page.locator('.delete-dialog [data-cancel]').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#delete-account').click(); await page.locator('.delete-dialog input').check();
  await page.locator('.delete-dialog [data-confirm]').click();
  await expect(page.locator('.onboarding')).toBeVisible();
  const response = await page.request.get('/api/houses/' + prior.house + '/dashboard', { headers: {Authorization: 'Bearer dev:' + prior.uid} });
  expect(response.status()).toBe(409);
  expect(await page.evaluate(() => localStorage.getItem('darupoyo-uid'))).not.toBe(prior.uid);
});
test('meal finish shares the satisfied avatar and keeps both recordings in one meal', async ({ page, browser }) => {
  await enter(page);
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click(); await page.locator('.set-toggle summary').click();
  await page.locator('.gal-card[aria-label]').last().click(); await page.locator('#settings-close').click();
  const fixture = await page.evaluate(async () => {
    const { client, houseApi } = await import('/src/api.js');
    const c = document.createElement('canvas'); c.width=100;c.height=120;
    const blob = await new Promise(r=>c.toBlob(r,'image/png'));
    const photo = await houseApi('/media?kind=meal',blob);
    const voice = await houseApi('/media?kind=voice',new Blob([new Uint8Array([26,69,223,163]),new Uint8Array(300)],{type:'audio/webm'}));
    const {post} = await houseApi('/completions',{request_id:crypto.randomUUID(),chore:'meal',method:'photo_voice',media_id:photo.id,voice_media_id:voice.id,itadakimasu:true,gal:'hime'});
    const {token} = await houseApi('/invites',{}); return {uid:client.uid,house:client.house,post:post.id,token};
  });
  const other = await browser.newContext(); const friend = await other.newPage();
  await friend.addInitScript(() => localStorage.setItem('darupoyo-howto-seen','1'));
  await friend.goto(page.url()); await friend.getByRole('button',{name:'招待コードで入る'}).click();
  await friend.getByLabel('あなたの名前').fill('友だち'); await friend.getByLabel('招待コード').fill(fixture.token); await friend.getByRole('button',{name:'招待に参加する'}).click();
  await friend.getByRole('button',{name:'おじゃまします！'}).click();
  await expect(friend.locator('.resident-avatar')).toHaveAttribute('aria-label','もち：いただきます');
  await expect(page.locator('.resident-avatar')).toHaveAttribute('aria-label','もち：いただきます');
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button',{name:/ごちそうさまを録音/}).click();
  await page.getByRole('button',{name:'マイクをオンにする'}).click(); await expect(page.locator('.meal-voice')).toHaveAttribute('data-state','recording');
  await page.waitForTimeout(700); // actual short audio clip from the fake microphone
  await page.getByRole('button',{name:'録音を止める'}).click(); await page.getByRole('button',{name:'この音声を使う'}).click();
  await page.getByRole('button',{name:'ごちそうさまを保存'}).click();
  await expect(friend.locator('.resident-avatar')).toHaveAttribute('aria-label','もち：ごちそうさま・満腹');
  await expect(page.locator('.resident-avatar')).toHaveClass(/is-satisfied/);
  await page.locator('#nav-room').click(); await page.locator('.mr-frame').first().click();
  await expect(page.getByRole('button',{name:'いただきます を聞く'})).toBeVisible();
  await expect(page.getByRole('button',{name:'ごちそうさま を聞く'})).toBeVisible();
  const posts = await page.request.get('/api/houses/' + fixture.house + '/posts', {headers:{Authorization:'Bearer dev:'+fixture.uid}});
  expect((await posts.json()).items).toHaveLength(1);
  await other.close();
});
test('board remains a swipe destination and the menu contains only three utilities', async ({ page }) => {
  await enter(page); await expect(page.locator('#open-menu')).toBeVisible();
  await expect(page.locator('#open-settings')).not.toBeVisible();
  await page.locator('#open-menu').click();
  await expect(page.locator('#utility-menu [data-menu-action]')).toHaveText(['設定','遊び方','招待リンク']);
  await page.keyboard.press('Escape'); await expect(page.locator('#utility-menu')).not.toBeVisible();
  await page.locator('[data-go="5"].scene-tab').click();
  await expect(page.locator('.sv-board')).toBeInViewport(); await expect(page.locator('#timeline')).toBeVisible();
  await page.locator('#open-menu').click(); await page.locator('#open-howto').click(); await expect(page.locator('#howto-page')).toBeVisible();
});
