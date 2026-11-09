import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
import { playRhythm, stillCamera } from './rhythm-helper.js';
test.beforeEach(async({context})=>{await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));});

test('create, invite, sync, rhythm, private meal, persistence and room theme', async ({ page, browser }) => {
  await stillCamera(page.context());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const apiRequests = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.goto('/');
  await setWelcomeName(page, 'もち');
  await setHouseName(page, '温玉テスト');
  await page.getByRole('button', { name: 'ハウスをつくる', exact:true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);

  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('#settings-invite')).not.toHaveText('友だちを招待しよう');
  const code = await page.locator('#settings-invite').textContent();
  await page.locator('#settings-close').click();
  const context = await browser.newContext({ viewport: {width:390,height:844} }); const friend = await context.newPage();
  await friend.goto('/'); await setWelcomeName(friend, 'ともだち'); await friend.getByRole('button',{name:'友達の家に住む',exact:true}).click(); await friend.getByLabel('招待コード').fill(code);  await friend.getByRole('button', {name:'招待に参加する'}).click();
  await expect(friend.locator('.onboarding')).toHaveCount(0);
  await expect(page.locator('.doors .door')).toHaveCount(2);
  await page.locator('.scene-dot').nth(4).click();
  await page.locator('[data-chore="laundry"]').click();
  await page.getByRole('button', {name:/^干す/}).click();
  await expect(page.locator('.rhythm-camera video')).toBeVisible();
  await expect(page.locator('.rhythm-note')).toHaveCount(8);
  await playRhythm(page, 7);
  await expect(page.locator('.result-main')).toHaveText('7 / 8 ヒット');
  await page.getByRole('button', {name:'部屋に飾る',exact:true}).click();
  await expect(page.getByText('記録できた！')).toBeVisible();
  await page.getByRole('button', {name:'けーじばんを見る',exact:true}).click();
  await expect(page.locator('.door.is-lit')).toHaveCount(1);
  await expect(friend.locator('.door.is-lit')).toHaveCount(1);
  // A camera-independent API photo fixture tests authenticated upload and actual UI rendering.
  const result = await page.evaluate(async () => {
    const uid = localStorage.getItem('darupoyo-uid'), house = localStorage.getItem('darupoyo-house-'+uid), headers = { Authorization:'Bearer dev:'+uid };
    const canvas = document.createElement('canvas'); canvas.width=32;canvas.height=32; const ctx=canvas.getContext('2d');ctx.fillStyle='#ffb3de';ctx.fillRect(0,0,32,32);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const media=await fetch('/api/houses/'+house+'/media?kind=meal',{method:'POST',headers:{...headers,'Content-Type':blob.type},body:blob}).then(r=>r.json());
    const response=await fetch('/api/houses/'+house+'/completions',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({request_id:crypto.randomUUID(),chore:'meal',method:'photo',media_id:media.id})});
    return {status:response.status,house,media:media.id};
  });
  expect(result.status).toBe(200);
  await page.reload(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(5).click(); await page.locator('.door.is-me').click(); await expect(page.locator('.mr-frame img')).toHaveCount(1);
  await page.locator('#room-paint').click(); await page.getByRole('button',{name:'ミント',exact:true}).click();
  await expect(page.getByRole('button',{name:'ミント',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('#room-paint').click();
  await page.screenshot({path:'test-results/mobile-room.png'});
  await page.locator('#room-back').click(); await page.locator('.scene-dot').nth(1).click();
  await page.screenshot({path:'test-results/mobile-house.png'});
  const outsider = await browser.newContext(); const request = await outsider.request.get(new URL('/api/houses/', page.url()).href+result.house+'/media/'+result.media,{headers:{Authorization:'Bearer dev:outsider'}}); expect(request.status()).toBe(404);
  await outsider.close(); await context.close(); expect(errors).toEqual([]);
  if (process.env.VITE_API_BASE_URL) expect(apiRequests.some(url => url.startsWith(process.env.VITE_API_BASE_URL + '/houses'))).toBe(true);
});

test('without camera permission a meal photo can come from the library, and nothing is recorded by itself (#117)', async ({ page }) => {
  await page.addInitScript(()=>{ navigator.mediaDevices.getUserMedia = async()=>{throw new DOMException('Denied','NotAllowedError');}; });
  await page.goto('/'); await setWelcomeName(page, 'camera'); await setHouseName(page, 'permission'); await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-chore="meal"]').click(); await page.getByRole('button',{name:/^たべる/}).click();
  await expect(page.locator('.capture-status')).toContainText('カメラを使えないので');
  await expect(page.locator('.capture-library')).toBeVisible();
  await expect(page.getByRole('button',{name:'この写真を撮る'})).toHaveCount(0);
  await expect(page.locator('.door.is-lit')).toHaveCount(0);
  await expect(page.locator('#post')).toHaveCount(0);
});
test('missing camera explains it for laundry', async ({ page }) => {
  await page.addInitScript(()=>{ navigator.mediaDevices.getUserMedia = async()=>{throw new DOMException('none','NotFoundError');}; });
  await page.goto('/'); await setWelcomeName(page, 'nocam'); await setHouseName(page, 'no device'); await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-chore="laundry"]').click(); await page.getByRole('button',{name:/^干す/}).click();
  await expect(page.locator('#toast')).toHaveText('カメラが見つかりません');
  await expect(page.getByRole('button',{name:/^干す/})).toBeVisible();
  await expect(page.locator('.door.is-lit')).toHaveCount(0);
});

test('switch between houses from the menu', async ({ page }) => {
  const create = async name => {
    await setWelcomeName(page, 'もち');
    await setHouseName(page, name);
    await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
    await expect(page.locator('.onboarding')).toHaveCount(0);
  };
  const switchHouse = async () => {
    await page.locator('#open-menu').click(); await page.locator('#menu-house').click();
    await page.locator('#house-add').click();
    await expect(page.locator('.onboarding')).toBeVisible();
  };
  await page.goto('/');
  await create('ひとつめ');
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  // The settings drawer must still fit without scrolling.
  const settings = page.locator('#settings .drawer-inner');
  expect(await settings.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await page.locator('#settings-close').click();
  await switchHouse();
  await create('ふたつめ');
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('.account-row small')).toContainText('ふたつめ');
  await page.locator('#settings-close').click();
  await switchHouse();
  await page.getByRole('button', { name: 'すでに入居済みの家に帰る' }).click();
  await page.getByRole('button', { name: 'ひとつめに帰る' }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('.account-row small')).toContainText('ひとつめ');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/settings-switch.png' });
});

test('rename yourself and the house from settings', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await setWelcomeName(page, 'もち');
  await setHouseName(page, '温玉');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  const howto = page.locator('#howto-page[open] #howto-close');
  if (await howto.count()) await howto.click();
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  const form = page.locator('#account-form');
  await page.getByRole('button', { name: '名前を編集' }).click();
  await expect(form.getByLabel('名前', { exact: true })).toHaveValue('もち');
  await expect(form.getByLabel('家の名前')).toHaveCount(0);
  await expect(page.locator('#house-form')).toBeHidden();
  const inner = page.locator('#settings .drawer-inner');
  expect(await inner.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await form.getByLabel('名前', { exact: true }).fill('もちこ');
  await form.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('#account-form')).toBeHidden();
  await expect(page.locator('.account-row b')).toHaveText('もちこ');
  await expect(page.locator('#settings-house-name')).toHaveText('温玉');
  await page.locator('#house-edit').click();
  const houseForm = page.locator('#house-form');
  await expect(houseForm.getByLabel('家の名前')).toHaveValue('温玉');
  await expect(form).toBeHidden();
  await houseForm.getByLabel('家の名前').fill('キャンセル');
  await houseForm.getByRole('button', { name: 'やめる' }).click();
  await expect(page.locator('#settings-house-name')).toHaveText('温玉');
  await page.locator('#house-edit').click();
  await expect(houseForm.getByLabel('家の名前')).toHaveValue('温玉');
  await houseForm.getByLabel('家の名前').fill('ぽよハウス');
  await houseForm.getByRole('button', { name: '保存' }).click();
  await expect(houseForm).toBeHidden();
  await expect(page.locator('.account-row b')).toHaveText('もちこ');
  await expect(page.locator('.account-row small')).toContainText('ぽよハウス');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/settings-rename.png' });
  await page.reload();
  await expect(page.locator('.onboarding')).toHaveCount(0);
   await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('.account-row b')).toHaveText('もちこ');
  await expect(page.locator('.account-row small')).toContainText('ぽよハウス');
});
