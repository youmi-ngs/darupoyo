import { test, expect } from '@playwright/test';
test('mock darupoyo shares, retries, persists and is removed with the account',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('もち'); await page.getByLabel('新しいハウスの名前').fill('mock');
  await page.getByRole('button',{name:'ハウスを作る',exact:true}).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button',{name:/^だるぽよ/}).click();
  await page.getByLabel('ひとこと（任意・140文字まで）').fill('お休み〜'); await page.getByRole('button',{name:'このだるぽよを共有'}).click();
  await page.getByRole('button',{name:'お部屋へ',exact:true}).click();
  const result=await page.evaluate(async()=>{
    const {houseApi}=await import('/src/api.js'); const body={request_id:crypto.randomUUID(),chore:'laundry',caption:'今日はここまで'};
    await houseApi('/darupoyo',body); const retry=await houseApi('/darupoyo',body);
    return {retry,records:await houseApi('/darupoyo'),dashboard:await houseApi('/dashboard')};
  });
  expect(result.retry.created).toBe(false); expect(result.records.items).toHaveLength(2); expect(result.dashboard.state.completed).toEqual({});
  await page.reload(); await page.locator('.scene-dot').nth(1).click(); await page.locator('#open-board').click(); await expect(page.locator('.pin-grid .pin-darupoyo')).toHaveCount(2); await page.locator('.board-back').click();
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click(); await page.locator('#delete-account').click();
  await page.locator('.delete-dialog input').check(); await page.locator('.delete-dialog [data-confirm]').click(); await expect(page.locator('.onboarding')).toBeVisible();
  const db=await page.evaluate(()=>JSON.parse(localStorage.getItem('darupoyo-mock')));
  expect(Object.keys(db.darupoyo_records)).toHaveLength(0); expect(Object.keys(db.darupoyo_requests)).toHaveLength(0);
});
