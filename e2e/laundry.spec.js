import { test, expect } from '@playwright/test';
test.beforeEach(async({context})=>{await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));});
test('mic rhythm starts the camera, shows the note lane and releases both devices (#24 #26 #37)',async({page,context})=>{
  await context.grantPermissions(['camera','microphone']);
  await page.goto('/');await page.getByLabel('あなたの名前').fill('wash');await page.getByLabel('新しいハウスの名前').fill('sparkle');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-go="3"].scene-tab').click();await page.locator('[data-chore="laundry"]').click();await page.getByRole('button',{name:/バサバサでリズム/}).click();
  await expect(page.locator('.rhythm-camera video')).toBeVisible();await expect(page.locator('.rhythm-note')).toHaveCount(8);
  await page.evaluate(()=>{window.testVideo=document.querySelector('.rhythm-camera video').srcObject;});
  await page.getByRole('button',{name:'リズムをはじめる'}).click();
  await page.locator('#post').or(page.locator('#retry')).first().waitFor({state:'visible',timeout:15000});
  expect(await page.evaluate(()=>window.testVideo.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
});
test('rhythm still works with the microphone only when the camera is unavailable',async({page})=>{
  await page.addInitScript(()=>{const real=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async c=>{if(c.video)throw new DOMException('Denied','NotAllowedError');return real(c);};});
  await page.goto('/');await page.getByLabel('あなたの名前').fill('nocam');await page.getByLabel('新しいハウスの名前').fill('micro');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-go="3"].scene-tab').click();await page.locator('[data-chore="laundry"]').click();await page.getByRole('button',{name:/バサバサでリズム/}).click();
  await expect(page.locator('.capture-status')).toContainText('マイクの音だけ');await expect(page.locator('.rhythm-camera')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'リズムをはじめる'})).toBeVisible();
});
test('a rhythm with no hit shows a gal cheer and a retry instead of going back silently (#34)',async({page})=>{
  await page.goto('/');await page.getByLabel('あなたの名前').fill('miss');await page.getByLabel('新しいハウスの名前').fill('zero');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-go="3"].scene-tab').click();await page.locator('[data-chore="laundry"]').click();
  await page.clock.install();
  await page.getByRole('button',{name:'洗濯リズム',exact:false}).last().click();
  await page.getByRole('button',{name:'リズムをはじめる'}).click();
  await page.clock.runFor(8*800+500);
  await expect(page.getByRole('heading',{name:'おしい〜！'})).toBeVisible();
  await expect(page.locator('.sheet-text')).toHaveText('0 / 8 ヒット');
  await expect(page.locator('.gal-text')).toContainText('もう一回いこ！');
  await expect(page.locator('.gal-face')).toBeVisible();
  await page.getByRole('button',{name:'もう一回'}).click();
  await expect(page.getByRole('button',{name:'リズムをはじめる'})).toBeVisible();
  await page.getByRole('button',{name:'リズムをはじめる'}).click();
  await page.clock.runFor(8*800+500);
  await page.getByRole('button',{name:'ほかのやり方'}).click();
  await expect(page.locator('.choice')).toBeVisible();
});
