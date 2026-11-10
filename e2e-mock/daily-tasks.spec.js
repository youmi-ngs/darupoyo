import { setWelcomeName, setHouseName } from '../e2e/onboarding-helper.js';
import { test, expect } from '@playwright/test';
test('mock darupoyo shares, retries, persists and is removed with the account',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));
  await page.goto('/'); await setWelcomeName(page, 'もち'); await setHouseName(page, 'mock');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button',{name:/^だるぽよ/}).click();
  await page.getByLabel('ひとこと（任意・30文字まで）').fill('お休み〜'); await page.getByRole('button',{name:'きょーゆー'}).click();
  await page.getByRole('button',{name:'けーじばんを見る',exact:true}).click();
  const result=await page.evaluate(async()=>{
    const {houseApi}=await import('/src/api.js'); const body={request_id:crypto.randomUUID(),chore:'laundry',caption:'今日はここまで'};
    await houseApi('/darupoyo',body); const retry=await houseApi('/darupoyo',body);
    return {retry,records:await houseApi('/darupoyo'),dashboard:await houseApi('/dashboard')};
  });
  expect(result.retry.created).toBe(false); expect(result.records.items).toHaveLength(2); expect(result.dashboard.state.completed).toEqual({}); expect(Object.values(result.dashboard.lights)).toEqual([true]);
  await page.reload(); await page.locator('.scene-dot').nth(1).click(); await page.locator('#open-board').click(); await expect(page.locator('.pin-grid .pin-darupoyo')).toHaveCount(2); await expect(page.locator('.door.is-me')).toHaveClass(/is-lit/); await page.locator('.board-back').click();
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click(); await page.locator('#delete-account').click();
  await page.locator('.delete-dialog input').check(); await page.locator('.delete-dialog [data-confirm]').click(); await expect(page.locator('.onboarding')).toBeVisible();
  const db=await page.evaluate(()=>JSON.parse(localStorage.getItem('darupoyo-mock')));
  expect(Object.keys(db.darupoyo_records)).toHaveLength(0); expect(Object.keys(db.darupoyo_requests)).toHaveLength(0);
});
