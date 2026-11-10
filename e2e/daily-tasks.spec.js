import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => ['darupoyo:entered', 'darupoyo:guide-ready'].forEach(event => window.addEventListener(event, () => queueMicrotask(() => document.querySelector('.first-guide [data-skip]')?.click())))); });
async function enter(page) {
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, 'ゆるいおうち');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
}
async function compose(page) {
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button',{name:/^だるぽよ/}).click();
  await expect(page.locator('.darupoyo-dialog')).toBeVisible();
}
async function state(page) {
  return page.evaluate(async()=>{ const { houseApi }=await import('/src/api.js'); return houseApi('/dashboard'); });
}
test('darupoyo shares text, preserves completion state and survives reload',async({page,browser})=>{
  await enter(page); const before=await state(page);
  const token=await page.evaluate(async()=>{ const {houseApi}=await import('/src/api.js'); return (await houseApi('/invites',{})).token; });
  const context=await browser.newContext(); const friend=await context.newPage();
  await friend.addInitScript(()=>['darupoyo:entered', 'darupoyo:guide-ready'].forEach(event => window.addEventListener(event, () => queueMicrotask(() => document.querySelector('.first-guide [data-skip]')?.click()))));
  await friend.goto(page.url()); await setWelcomeName(friend, '友だち'); await friend.getByRole('button',{name:'友達の家に住む',exact:true}).click();  await friend.getByLabel('招待コード').fill(token);
  await friend.getByRole('button',{name:'招待に参加する'}).click(); await friend.getByRole('button',{name:'おじゃまします！'}).click();
  await compose(page);
  await expect(page.getByRole('button',{name:'きょーゆー'})).toBeEnabled(); // #142: 「だるぽよ」 alone can be shared
  await page.getByLabel('ひとこと（任意・30文字まで）').fill('  ');
  await expect(page.getByRole('button',{name:'きょーゆー'})).toBeEnabled();
  await page.getByLabel('ひとこと（任意・30文字まで）').fill('今日は洗い物、そのまま〜');
  await page.getByRole('button',{name:'きょーゆー'}).click(); await page.getByRole('button',{name:'けーじばんを見る',exact:true}).click();
  const after=await state(page); expect(after.state.completed).toEqual(before.state.completed); expect(after.happiness).toBe(50);
  await friend.locator('.scene-dot').nth(1).click(); await friend.locator('#open-board').click();
  await expect(friend.locator('.pin-grid .pin-darupoyo')).toContainText('今日は洗い物、そのまま〜');
  await expect(friend.locator('.pin-grid .pin-darupoyo')).toHaveAttribute('aria-label', /^もち：/);
  await page.reload(); await page.locator('.scene-dot').nth(1).click(); await page.locator('#open-board').click();
  await expect(page.locator('.pin-grid .pin-darupoyo')).toContainText('今日は洗い物、そのまま〜');
  await expect(page.locator('.door.is-lit')).toHaveCount(1);
  await expect(page.locator('.door.is-me')).toHaveClass(/is-lit/);
  await expect(friend.locator('.door.is-me')).not.toHaveClass(/is-lit/);
  await page.locator('.board-back').click(); await page.locator('.scene-dot').last().click();
  await page.locator('.door.is-me').click(); await expect(page.locator('.myroom')).toHaveClass(/is-lit/);
  await expect(page.locator('.mr-plate')).toContainText('だるぽよ共有済み'); await context.close();
});
test('caption and photo share one composer, photo removal preserves text, and both reach the board',async({page})=>{
  await enter(page); await compose(page);
  await page.getByLabel('ひとこと（任意・30文字まで）').fill('ひと休みの写真');
  const png=await page.evaluate(()=>{ const c=document.createElement('canvas');c.width=50;c.height=60;return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('.darupoyo-dialog input[data-file]').setInputFiles({name:'today.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.locator('.composer-input .darupoyo-preview')).toBeVisible();
  const photoBox = await page.locator('.darupoyo-preview').boundingBox();
  const removeBox = await page.getByRole('button',{name:'写真を外す'}).boundingBox();
  expect(removeBox.x).toBeGreaterThan(photoBox.x);
  expect(removeBox.x + removeBox.width).toBeLessThanOrEqual(photoBox.x + photoBox.width);
  expect(removeBox.y).toBeGreaterThanOrEqual(photoBox.y);
  expect(removeBox.y).toBeLessThan(photoBox.y + photoBox.height / 2);
  await page.getByRole('button',{name:'写真を外す'}).click();
  await expect(page.locator('[data-photo]')).toBeHidden();
  await expect(page.getByLabel('ひとこと（任意・30文字まで）')).toHaveValue('ひと休みの写真');
  await expect(page.getByRole('button',{name:'きょーゆー'})).toBeEnabled();
  await page.locator('.darupoyo-dialog input[data-file]').setInputFiles({name:'today.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByRole('button',{name:'きょーゆー'}).click(); await page.getByRole('button',{name:'けーじばんを見る',exact:true}).click();
  await expect(page.locator('#board-view')).toBeVisible();
  await expect(page.locator('.pin-grid .pin-darupoyo .pin-photo > img[alt$="ごはんの記録"]')).toHaveAttribute('src',/^blob:/);
  await expect(page.locator('.pin-grid .pin-darupoyo')).toContainText('ひと休みの写真');
  expect((await state(page)).state.completed).toEqual({});
});
test('a lost save response can retry the same record without duplication',async({page})=>{
  await enter(page); await compose(page); await page.getByLabel('ひとこと（任意・30文字まで）').fill('休んだよ');
  let failed=false;
  await page.route('**/darupoyo',async route=>{
    if(route.request().method()==='POST' && !failed){ failed=true;await route.fetch();await route.abort(); } else await route.continue();
  });
  await page.getByRole('button',{name:'きょーゆー'}).click();
  await expect(page.getByRole('button',{name:'共有を再試行'})).toBeEnabled();
  await expect(page.getByLabel('ひとこと（任意・30文字まで）')).toBeEnabled();
  await page.getByRole('button',{name:'共有を再試行'}).click(); await page.getByRole('button',{name:'けーじばんを見る',exact:true}).click();
  const records=await page.evaluate(async()=>{ const {houseApi}=await import('/src/api.js');return houseApi('/darupoyo'); });
  expect(records.items).toHaveLength(1);
});
test('furniture reacts on taps and keyboard, with a temporary prize (つけま・ネイルチップ・アメピン・ピアスのキャッチ) every five plays',async({page})=>{
  await enter(page); const before=await state(page);
  await page.locator('.scene-dot').nth(1).click(); const furniture=page.getByRole('button',{name:'玄関のドアであそぶ'});
  for(let i=0;i<4;i++) await furniture.click(); await expect(page.locator('.furniture-prize')).toHaveCount(0);
  await furniture.focus(); await furniture.press('Enter');
  await expect(page.locator('.furniture-prize')).toBeVisible();
  await expect(page.locator('.furniture-prize')).not.toHaveAttribute('role','button');
  await expect(page.getByRole('button',{name:/拾う/})).toHaveCount(0);
  await expect(page.locator('.furniture-play-status')).toHaveText(/^(つけま|ネイルチップ|アメピン|ピアスのキャッチ)みっけ♡ ラッキ〜$/);
  await expect(page.locator('.furniture-play-status')).not.toHaveClass(/is-visible/);
  await expect(page.locator('.furniture-prize')).toContainText('ラッキ〜');
  await expect(page.locator('.furniture-prize')).toHaveCount(0,{timeout:5000});
  expect((await state(page)).state).toEqual(before.state);
  await page.reload(); await page.locator('.scene-dot').nth(1).click();
  await page.getByRole('button',{name:'玄関のドアであそぶ'}).click(); await expect(page.locator('.furniture-prize')).toHaveCount(0);
});

test('IME input stops at the limit and can submit after composition', async ({page}) => {
  await enter(page); await compose(page);
  const input=page.getByLabel('ひとこと（任意・30文字まで）'), save=page.locator('.darupoyo-dialog [data-save]');
  await input.pressSequentially('a'.repeat(31)); await expect(input).toHaveValue('a'.repeat(30));
  await input.fill('');
  await input.dispatchEvent('compositionstart');
  await input.evaluate(el=>{el.value='あ'.repeat(31);el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));});
  await expect(save).toBeEnabled(); await expect(input).toHaveValue('あ'.repeat(30));
  await input.dispatchEvent('compositionend');
  await expect(input).toHaveValue('あ'.repeat(30));
  await expect(page.locator('.darupoyo-dialog [data-count]')).toHaveText('30 / 30');
  await expect(save).toBeEnabled(); await expect(input).toBeEnabled();
  await input.fill('あ'.repeat(30)); await expect(save).toBeEnabled();
  await save.click(); await page.getByRole('button',{name:'けーじばんを見る',exact:true}).click();
  await expect(page.locator('.pin-grid .pin-darupoyo')).toContainText('あ'.repeat(30));
});
test('rejected darupoyo can edit its draft and submit again', async ({page})=>{
  await enter(page); await compose(page);
  const input=page.getByLabel('ひとこと（任意・30文字まで）');
  await input.fill('修正前');
  const bodies=[];
  await page.route('**/darupoyo',async route=>{
    if(route.request().method()!=='POST') return route.continue();
    bodies.push(route.request().postDataJSON());
    if(bodies.length===1) return route.fulfill({status:422,contentType:'application/json',body:'{"detail":"validation error"}'});
    return route.continue();
  });
  await page.getByRole('button',{name:'きょーゆー'}).click();
  await expect(page.getByRole('button',{name:'共有を再試行'})).toBeEnabled();
  await expect(input).toBeEnabled();
  await expect(page.locator('.darupoyo-dialog [data-close]')).toBeEnabled();
  await expect(page.locator('.darupoyo-dialog [data-library]')).toBeEnabled();
  await input.fill('修正したよ');
  await page.getByRole('button',{name:'きょーゆー'}).click(); await page.getByRole('button',{name:'けーじばんを見る',exact:true}).click();
  expect(bodies).toHaveLength(2); expect(bodies[1].caption).toBe('修正したよ');
  expect(bodies[1].request_id).not.toBe(bodies[0].request_id);
  await expect(page.locator('.pin-grid .pin-darupoyo')).toContainText('修正したよ');
});
