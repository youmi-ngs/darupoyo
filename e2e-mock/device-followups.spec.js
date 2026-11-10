import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from '../e2e/onboarding-helper.js';
async function enter(page, skip=true) {
  await page.goto('/'); await setWelcomeName(page,'テスト'); await setHouseName(page,'実機確認');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();
  await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();
  await expect(page.locator('.first-guide')).toBeVisible();
  if(skip) await page.getByRole('button',{name:'スキップ',exact:true}).click();
}
test('returning member without local guide history is not treated as a new resident',async({page})=>{
  await enter(page);
  await page.evaluate(async()=>{const {client}=await import('/src/api.js');localStorage.removeItem('darupoyo-first-guide-'+client.uid);});
  await page.reload(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('.first-guide')).toHaveCount(0);
});
test('guide stays at the meal until skipped, then navigation works again',async({page})=>{
  await enter(page,false);
  const plan=page.locator('#plan');
  await expect(page.locator('.scene-dot').nth(2)).toHaveAttribute('aria-current','');
  await page.keyboard.press('ArrowRight');
  expect(await plan.evaluate(el=>getComputedStyle(el).overflowX)).toBe('hidden');
  await page.locator('.scene-dot').nth(3).dispatchEvent('click');
  await expect(page.locator('.scene-dot').nth(2)).toHaveAttribute('aria-current','');
  await page.getByRole('button',{name:'スキップ',exact:true}).click();
  await page.locator('.scene-dot').nth(3).click();
  await expect(page.locator('.scene-dot').nth(3)).toHaveAttribute('aria-current','');
});
test('share commits capped IME input even if compositionend never arrives',async({page})=>{
  await enter(page); await page.locator('[data-chore=meal]').click(); await page.getByRole('button',{name:/^だるぽよ/}).click();
  const field=page.locator('.darupoyo-dialog textarea');
  await field.dispatchEvent('compositionstart');
  await field.evaluate(el=>{el.value='あ'.repeat(31);el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));});
  await expect(field).toHaveValue('あ'.repeat(30));
  await page.locator('.darupoyo-dialog [data-save]').click();
  await expect(page.locator('.darupoyo-dialog')).toContainText('記録かんりょ');
});
test('foreground notification is tappable above mypage and opens its other-house record',async({page})=>{
  await enter(page);
  const link=await page.evaluate(async()=>{
    const {api}=await import('/src/api.js');const house=await api('/houses',{name:'通知先',display_name:'テスト'});
    const {record}=await api('/houses/'+house.id+'/darupoyo',{request_id:crypto.randomUUID(),chore:'meal',caption:'表示中の通知'});
    return '/#'+new URLSearchParams({house:house.id,post:record.id,kind:'darupoyo'});
  });
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await page.evaluate(link=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'darupoyo-push',body:'友達が記録したよ',link}})),link);
  await expect(page.locator('.push-banner')).toBeVisible();
  await page.locator('.push-banner button').first().click();
  await expect(page.locator('.pin-viewer')).toContainText('表示中の通知');
});
