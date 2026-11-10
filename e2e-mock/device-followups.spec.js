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
for (const surface of ['dryer','mypage','howto','house','now','darupoyo']) {
 test(`notification tap replaces ${surface} with the target detail without navigation`,async({page})=>{
  await enter(page);
  const target=await page.evaluate(async()=>{
   const {houseApi,client}=await import('/src/api.js');
   const {record}=await houseApi('/darupoyo',{request_id:crypto.randomUUID(),chore:'meal',caption:'通知の目的地'});
   return {id:crypto.randomUUID(),link:'/#'+new URLSearchParams({house:client.house,post:record.id,kind:'darupoyo'})};
  });
  if(surface==='dryer'){await page.locator('.scene-dot').nth(3).click();await page.locator('[data-chore=dryer]').click();}
  else if(surface==='darupoyo'){await page.locator('[data-chore=meal]').click();await page.getByRole('button',{name:/^だるぽよ/}).click();}
  else if(surface==='now'){await page.locator('.scene-dot').nth(1).click();await page.locator('[data-open-moments]').click();}
  else {await page.locator('#open-menu').click();await page.locator(surface==='mypage'?'#open-settings':surface==='howto'?'#open-howto':'#menu-house').click();}
  await page.evaluate(target=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'darupoyo-notification-open',...target}})),target);
  await expect(page.locator('.pin-viewer')).toContainText('通知の目的地');
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.locator('#sheet')).not.toBeVisible();
 });
}
test('resume recovers a missed notification from the real worker and acknowledges it',async({page})=>{
 await enter(page);await page.locator('.scene-dot').nth(3).click();await page.locator('[data-chore=dryer]').click();
 await page.evaluate(async()=>{
  const {houseApi,client}=await import('/src/api.js');
  const {record}=await houseApi('/darupoyo',{request_id:crypto.randomUUID(),chore:'dryer',caption:'休止から復帰'});
  await navigator.serviceWorker.register('/push-sw.js');await navigator.serviceWorker.ready;
  const cache=await caches.open('darupoyo-notification-target');
  await cache.put('/__pending-notification',new Response(JSON.stringify({id:'resume-test',link:'/?notification=resume-test#'+new URLSearchParams({house:client.house,post:record.id,kind:'darupoyo'})})));
  window.dispatchEvent(new Event('focus'));
 });
 await expect(page.locator('.pin-viewer')).toContainText('休止から復帰');
 await expect(page.locator('#sheet')).not.toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>!!await(await caches.open('darupoyo-notification-target')).match('/__pending-notification'))).toBe(false);
});
test('board separates author, category and status and names moments consistently',async({page})=>{
 await page.setViewportSize({width:390,height:844});await enter(page);
 await page.evaluate(async()=>{
  const {houseApi,refresh}=await import('/src/api.js');
  const canvas=document.createElement('canvas');canvas.width=200;canvas.height=250;const ctx=canvas.getContext('2d');ctx.fillStyle='#edc5e7';ctx.fillRect(0,0,200,250);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve));const {id}=await houseApi('/media?kind=selfie',blob);
  await houseApi('/moments',{request_id:crypto.randomUUID(),media_id:id,caption:'ひとやすみしてる〜'});
  await houseApi('/darupoyo',{request_id:crypto.randomUUID(),chore:'meal',caption:'今日はゆるっと'});
  await houseApi('/completions',{request_id:crypto.randomUUID(),chore:'dryer',method:'sound',duration_seconds:10});await refresh();
 });
 await page.locator('#open-board').click();
 await expect(page.locator('.pin-grid .pin-moment .pin-category')).toHaveText('テストのなう');
 await expect(page.locator('.pin-grid .pin-darupoyo .pin-category')).toHaveText('ごはん');
 await expect(page.locator('.pin-grid .pin-darupoyo .pin-state')).toHaveText('だるぽよ');
 await expect(page.locator('.pin-grid .pin-post .pin-state')).toHaveText('やったよ');
 await expect(page.locator('.pin-grid .pin-author strong').first()).toHaveText('テスト');
 await page.screenshot({path:'/tmp/darupoyo-board-followups.png',animations:'disabled'});
 await page.locator('.pin-grid .pin-moment').click();await expect(page.locator('.pin-viewer .pm-title')).toContainText(['テストのなう']);
});
