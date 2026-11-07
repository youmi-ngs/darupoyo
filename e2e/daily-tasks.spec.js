import { test, expect } from '@playwright/test';
test.beforeEach(async ({ context }) => { await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen','1')); });
async function enter(page) {
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('もち'); await page.getByLabel('新しいハウスの名前').fill('ゆるいおうち');
  await page.getByRole('button',{name:'ハウスを作る',exact:true}).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
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
  await friend.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));
  await friend.goto(page.url()); await friend.getByRole('button',{name:'招待コードで入る'}).click();
  await friend.getByLabel('あなたの名前').fill('友だち'); await friend.getByLabel('招待コード').fill(token);
  await friend.getByRole('button',{name:'招待に参加する'}).click(); await friend.getByRole('button',{name:'おじゃまします！'}).click();
  await compose(page);
  await expect(page.getByRole('button',{name:'このだるぽよを共有'})).toBeDisabled();
  await page.getByLabel('ひとこと（任意・140文字まで）').fill('  ');
  await expect(page.getByRole('button',{name:'このだるぽよを共有'})).toBeDisabled();
  await page.getByLabel('ひとこと（任意・140文字まで）').fill('今日は洗い物、そのまま〜');
  await page.getByRole('button',{name:'このだるぽよを共有'}).click(); await page.getByRole('button',{name:'お部屋へ',exact:true}).click();
  const after=await state(page); expect(after.state.completed).toEqual(before.state.completed); expect(after.happiness).toBe(0);
  await friend.locator('[data-go="5"].scene-tab').click();
  await expect(friend.locator('.darupoyo-record')).toContainText('今日は洗い物、そのまま〜');
  await expect(friend.locator('.darupoyo-record')).toContainText('もち');
  await page.reload(); await page.locator('[data-go="5"].scene-tab').click();
  await expect(page.locator('.darupoyo-record')).toContainText('今日は洗い物、そのまま〜');
  await expect(page.locator('.door.is-lit')).toHaveCount(0); await context.close();
});
test('photo-only records preview before sharing and display in the board',async({page})=>{
  await enter(page); await compose(page);
  const png=await page.evaluate(()=>{ const c=document.createElement('canvas');c.width=50;c.height=60;return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('.darupoyo-dialog input[type=file]').setInputFiles({name:'today.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.locator('.darupoyo-preview')).toBeVisible();
  await page.getByRole('button',{name:'写真を外す'}).click(); await expect(page.getByRole('button',{name:'このだるぽよを共有'})).toBeDisabled();
  await page.locator('.darupoyo-dialog input[type=file]').setInputFiles({name:'today.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByRole('button',{name:'このだるぽよを共有'}).click(); await page.getByRole('button',{name:'お部屋へ',exact:true}).click();
  await page.locator('[data-go="5"].scene-tab').click();
  await expect(page.locator('.darupoyo-record img')).toHaveAttribute('src',/^blob:/);
  expect((await state(page)).state.completed).toEqual({});
});
test('a lost save response can retry the same record without duplication',async({page})=>{
  await enter(page); await compose(page); await page.getByLabel('ひとこと（任意・140文字まで）').fill('休んだよ');
  let failed=false;
  await page.route('**/darupoyo',async route=>{
    if(route.request().method()==='POST' && !failed){ failed=true;await route.fetch();await route.abort(); } else await route.continue();
  });
  await page.getByRole('button',{name:'このだるぽよを共有'}).click();
  await expect(page.getByRole('button',{name:'共有を再試行'})).toBeEnabled();
  await expect(page.getByLabel('ひとこと（任意・140文字まで）')).toBeDisabled();
  await page.getByRole('button',{name:'共有を再試行'}).click(); await page.getByRole('button',{name:'お部屋へ',exact:true}).click();
  const records=await page.evaluate(async()=>{ const {houseApi}=await import('/src/api.js');return houseApi('/darupoyo'); });
  expect(records.items).toHaveLength(1);
});
test('completed chores are pinned with a kanryo sticker, including unplanned chores',async({page})=>{
  await enter(page);
  await page.evaluate(async()=>{ const {houseApi,refresh}=await import('/src/api.js');await houseApi('/completions',{request_id:crypto.randomUUID(),chore:'dryer',method:'sound',duration_seconds:10});await refresh(); });
  await page.locator('#open-fridge').click();
  await expect(page.locator('#board-magnets .completion-sticker')).toHaveText('かんりょ〜');
  await expect(page.locator('#board-magnets .completion-sticker')).toBeVisible();
  await expect(page.locator('#board-magnets .unstick')).toHaveCount(0);
  await expect(page.locator('#tray [data-id="dryer"]')).toHaveCount(0);
  await page.reload(); await page.locator('#open-fridge').click();
  await expect(page.locator('#board-magnets .completion-sticker')).toBeVisible();
});
test('furniture reacts on taps and keyboard, with a temporary prize every five plays',async({page})=>{
  await enter(page); const before=await state(page);
  await page.locator('[data-go="0"].scene-tab').click(); const furniture=page.getByRole('button',{name:'くつ箱であそぶ'});
  for(let i=0;i<4;i++) await furniture.click(); await expect(page.locator('.furniture-prize')).toHaveCount(0);
  await furniture.focus(); await furniture.press('Enter');
  await expect(page.getByRole('button',{name:'落ちたつけまつげを拾う'})).toBeVisible();
  await page.getByRole('button',{name:'落ちたつけまつげを拾う'}).click();
  await expect(page.locator('.furniture-play-status')).toHaveText('つけまゲット♡ ＋1');
  expect((await state(page)).state).toEqual(before.state);
  await page.reload(); await page.locator('[data-go="0"].scene-tab').click();
  await page.getByRole('button',{name:'くつ箱であそぶ'}).click(); await expect(page.locator('.furniture-prize')).toHaveCount(0);
});
