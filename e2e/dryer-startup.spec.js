import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from './onboarding-helper.js';
test('drying starts the real audio model and classifies microphone windows', async ({page,context}) => {
  test.setTimeout(90000);
  await context.grantPermissions(['microphone']);
  await page.goto('/'); await setWelcomeName(page,'音声確認'); await setHouseName(page,'音声モデル');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();
  await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();
  await page.getByRole('button',{name:'スキップ',exact:true}).click();
  await page.locator('.scene-dot').nth(3).click();
  await page.locator('[data-chore=dryer]').click();
  await page.getByRole('button',{name:/^乾かす/}).click();
  // No model mock: exercise the installed JS exports, WASM, YAMNet and PCM worklet.
  await expect(page.getByRole('meter',{name:'マイクの音量'})).toBeVisible({timeout:60000});
  await expect(page.locator('.capture-status')).toContainText('/ 10びょ〜',{timeout:15000});
  await expect(page.locator('.mic-level small')).not.toHaveText('ドライヤーをつけてみてね');
  await page.locator('#sheet-close').click();
  await expect(page.locator('#sheet')).not.toBeVisible();
});
test('opening a notification during dryer classification closes capture and stops the microphone',async({page,context})=>{
 test.setTimeout(90000);await context.grantPermissions(['microphone']);
 await page.addInitScript(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{const stream=await original(options);window.capturedTracks=stream.getTracks();return stream;};});
 await page.goto('/');await setWelcomeName(page,'音声確認');await setHouseName(page,'通知の確認');
 await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();await page.getByRole('button',{name:'スキップ',exact:true}).click();
 await page.locator('.scene-dot').nth(3).click();await page.locator('[data-chore=dryer]').click();await page.getByRole('button',{name:/^乾かす/}).click();
 await expect(page.getByRole('meter',{name:'マイクの音量'})).toBeVisible({timeout:60000});
 await page.evaluate(async()=>{
  const {houseApi,client}=await import('/src/api.js');const {record}=await houseApi('/darupoyo',{request_id:crypto.randomUUID(),chore:'dryer',caption:'判定中の通知'});
  navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{type:'darupoyo-notification-open',id:'capture-interrupt',link:'/#'+new URLSearchParams({house:client.house,post:record.id,kind:'darupoyo'})}}));
 });
 await expect(page.locator('.pin-viewer')).toContainText('判定中の通知');await expect(page.locator('#sheet')).not.toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.capturedTracks.every(t=>t.readyState==='ended'))).toBe(true);
});
