import {test,expect} from '@playwright/test';
import {setWelcomeName,setHouseName} from './onboarding-helper.js';
test('other-house notification changes data in place and late old-house refresh cannot undo it',async({page})=>{
 await page.goto('/');await setWelcomeName(page,'通知確認');await setHouseName(page,'元の家');
 await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();await page.getByRole('button',{name:'スキップ',exact:true}).click();
 const target=await page.evaluate(async()=>{
  const {api,client}=await import('/src/api.js');window.sameDocument='notification-test';
  const house=await api('/houses',{name:'通知先の家',display_name:'通知確認'});
  const {record}=await api('/houses/'+house.id+'/darupoyo',{request_id:crypto.randomUUID(),chore:'dryer',caption:'別の家の投稿'});
  return {old:client.house,house:house.id,link:'/#'+new URLSearchParams({house:house.id,post:record.id,kind:'darupoyo'})};
 });
 let release,started;const held=new Promise(r=>release=r),intercepted=new Promise(r=>started=r);
 await page.route('**/houses/'+target.old+'/dashboard',async route=>{
  const response=await route.fetch();started();await held;await route.fulfill({response});
 },{times:1});
 await page.evaluate(()=>{import('/src/api.js').then(m=>{window.oldRefresh=m.refresh();});});await intercepted;
 await page.locator('.scene-dot').nth(3).click();await page.locator('[data-chore=dryer]').click();
 await page.evaluate(link=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'darupoyo-notification-open',id:'live-other-house',link}})),target.link);
 await expect(page.locator('.pin-viewer')).toContainText('別の家の投稿');await expect(page.locator('#sheet')).toBeHidden();
 release();await page.evaluate(()=>window.oldRefresh);
 expect(await page.evaluate(()=>window.sameDocument)).toBe('notification-test');
 expect(await page.evaluate(async()=>(await import('/src/api.js')).client.house)).toBe(target.house);
 await expect(page.locator('.account-row small')).toContainText('通知先の家');
 // Subsequent writes and a reload must also use the notified house.
 const saved=await page.evaluate(async()=>{const {houseApi}=await import('/src/api.js');return houseApi('/darupoyo',{request_id:crypto.randomUUID(),chore:'meal',caption:'切替後の投稿'});});
 const records=await page.evaluate(async house=>(await import('/src/api.js')).api('/houses/'+house+'/darupoyo'),target.house);
 expect(records.items.some(record=>record.id===saved.record.id)).toBe(true);
 await page.reload();await expect(page.locator('.onboarding')).toHaveCount(0);
 expect(await page.evaluate(async()=>(await import('/src/api.js')).client.house)).toBe(target.house);
});
