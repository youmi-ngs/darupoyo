import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from '../e2e/onboarding-helper.js';

async function enter(page, guide = false) {
  if (!guide) await page.addInitScript(() => ['darupoyo:entered', 'darupoyo:guide-ready'].forEach(event => window.addEventListener(event, () => queueMicrotask(() => document.querySelector('.first-guide [data-skip]')?.click()))));
  await page.goto('/'); await setWelcomeName(page,'もち'); await setHouseName(page,'確認ハウス');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();
  await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
}
async function settings(page) {
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
}
test('30 visible characters, optional text, compact photo and board categories', async ({page}) => {
  await enter(page); await page.locator('[data-chore=meal]').click(); await page.getByRole('button',{name:/^だるぽよ/}).click();
  const composer=page.locator('.darupoyo-dialog'), input=composer.locator('textarea');
  await expect(composer).toContainText('ま、そんな日もあるっしょ〜♡');
  await expect(composer).toContainText('かかなくてもおけ♡');
  await input.fill('👨‍👩‍👧‍👦'.repeat(31)); await expect(input).toHaveValue('👨‍👩‍👧‍👦'.repeat(30));
  await expect(composer.locator('[data-save]')).toBeEnabled();
  await expect(composer.locator('[data-count]')).toHaveText('30 / 30');
  await input.fill('👨‍👩‍👧‍👦'.repeat(30));
  await expect(composer.locator('[data-count]')).toHaveText('30 / 30');
  const buffer=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=600;return c.toDataURL().split(',')[1];}),'base64');
  await composer.locator('[data-file]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer});
  const photo=composer.locator('.darupoyo-preview'); await expect(photo).toBeVisible();
  expect((await photo.boundingBox()).height).toBeLessThanOrEqual(151);
  await photo.click(); await expect(page.locator('.photo-preview-dialog')).toBeVisible();
  await page.locator('.photo-preview-dialog button').click(); await expect(input).toHaveValue('👨‍👩‍👧‍👦'.repeat(30));
  await input.fill(''); await composer.locator('[data-remove]').click();
  await page.screenshot({animations:'disabled',path:'test-results/feedback-composer.png'});
  await composer.locator('[data-save]').click(); await page.getByRole('button',{name:'けーじばんを見る',exact:true}).click();
  await expect(page.locator('.pin-grid .pin-category')).toHaveText('もちのごはん');
  await expect(page.locator('.pin-grid .pin-state')).toHaveText('だるぽよ');
  await expect(page.locator('.pin-grid .pin-author strong')).toHaveText('もち');
  await page.screenshot({animations:'disabled',path:'test-results/feedback-board.png'});
});
test('name limits preserve old names, invite links and profile cancel leave settings open', async ({page}) => {
  await enter(page); await settings(page);
  await page.locator('#account-edit').click(); await page.locator('[name=display_name]').fill('あ'.repeat(13));
  await expect(page.locator('[name=display_name]')).toHaveValue('あ'.repeat(12));
  await expect(page.locator('#display_name-limit')).toHaveText('12 / 12文字');
  await expect(page.locator('[name=display_name]')).toHaveAttribute('aria-invalid','false');
  await page.locator('[name=display_name]').fill('あ'.repeat(12)); await page.locator('#account-form [type=submit]').click();
  await expect(page.locator('.account-row b')).toHaveText('あ'.repeat(12));
  await page.locator('#house-edit').click();
  await page.locator('[name=house_name]').fill('家'.repeat(21));
  await expect(page.locator('[name=house_name]')).toHaveValue('家'.repeat(20));
  await page.locator('#house-form .account-cancel').click();
  await page.evaluate(async()=>{const {client}=await import('/src/api.js');const db=JSON.parse(localStorage.getItem('darupoyo-mock'));db.houses[client.house].members[client.uid].display_name='長い名前'.repeat(15);localStorage.setItem('darupoyo-mock',JSON.stringify(db));});
  await page.reload(); await settings(page); await expect(page.locator('.account-row b')).toHaveText('長い名前'.repeat(15));
  await page.locator('#account-edit').click(); await page.locator('#account-form [type=submit]').click();
  await expect(page.locator('.account-row b')).toHaveText('長い名前'.repeat(15));
  await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async data=>window.sharedInvite=data});});
  await page.locator('#share-invite').click();
  expect(await page.evaluate(()=>window.sharedInvite.url)).toContain('?invite=');
  await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('cancel','AbortError');}});});
  await page.locator('#share-invite').click();
  await expect(page.locator('#invite-status')).toBeHidden();
  await expect(page.locator('#share-invite')).toBeEnabled();
  const chooser=page.waitForEvent('filechooser'); await page.locator('#profile-photo').click(); await chooser;
  await page.locator('#social-card input').dispatchEvent('cancel'); await page.locator('#settings-title').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.screenshot({animations:'disabled',path:'test-results/feedback-settings.png'});
});
test('first entry guidance can be skipped and replayed without repeating on reload', async({page})=>{
  await enter(page,true); await expect(page.locator('.first-guide')).toBeVisible();
  await expect(page.locator('[data-chore=meal]')).toHaveClass(/guide-target/);
  await page.getByRole('button',{name:'スキップ',exact:true}).click(); await page.reload();
  await expect(page.locator('.onboarding')).toHaveCount(0); await expect(page.locator('.first-guide')).toHaveCount(0);
  await page.locator('#open-menu').click(); await page.locator('#open-howto').click();
  await page.getByRole('button',{name:'操作案内をもう一度見る'}).click();
  await expect(page.locator('.first-guide')).toBeVisible();
  await expect(page.locator('[data-chore=meal]')).toBeInViewport();
  await page.screenshot({animations:'disabled',path:'test-results/feedback-first-guide.png'});
  await page.getByRole('button',{name:'ごはんをタップしてみる'}).click(); await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('.first-guide')).toHaveCount(0);
});

test('notification target switches houses and opens the exact record', async({page})=>{
  await enter(page);
  const target=await page.evaluate(async()=>{
    const {api,client}=await import('/src/api.js');
    const house=await api('/houses',{name:'通知のハウス',display_name:'もち'});
    const {record}=await api('/houses/'+house.id+'/darupoyo',{request_id:crypto.randomUUID(),chore:'dryer',caption:'通知対象'});
    return {house:house.id,post:record.id,oldHouse:client.house};
  });
  await settings(page);
  await page.goto('/#'+new URLSearchParams({house:target.house,post:target.post,kind:'darupoyo'}));
  await expect(page.locator('.pin-viewer')).toBeVisible();
  await expect(page.locator('.pin-viewer')).toContainText('通知対象');
  expect(await page.evaluate(async()=>(await import('/src/api.js')).client.house)).toBe(target.house);
});

test('today pose displays the uploaded template after refresh; sound frame is an avatar',async({page})=>{
  await enter(page);
  await page.evaluate(async()=>{
    const {houseApi,refresh}=await import('/src/api.js');
    const c=document.createElement('canvas');c.width=80;c.height=100;c.getContext('2d').fillRect(0,0,80,100);
    const photo=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
    const {id}=await houseApi('/media?kind=cutout',photo);
    await houseApi('/completions',{request_id:crypto.randomUUID(),chore:'garbage',method:'pose',media_id:id,pose_name:'テストのお手本',landmarks:Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}))});
    await houseApi('/completions',{request_id:crypto.randomUUID(),chore:'dryer',method:'sound',duration_seconds:10});
    await refresh();
  });
  await expect(page.locator('#pose-shot img')).toHaveCount(1);
  await expect(page.locator('#pose-by')).toContainText('もち');
  await page.reload(); await expect(page.locator('#pose-shot img')).toHaveCount(1);
  await page.locator('.door.is-me').click();
  await expect(page.locator('.mr-frame .is-drawing .resident-character')).toHaveCount(1);
});


for (const kind of ['darupoyo', 'post']) test(`notification ${kind} opens before historical photo downloads finish`, async ({ page }) => {
  await enter(page);
  const target = await page.evaluate(async kind => {
    const { houseApi, client } = await import('/src/api.js');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 20;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const { id } = await houseApi('/media?kind=cutout', blob);
    const completion = await houseApi('/completions', { request_id: crypto.randomUUID(), chore: 'garbage', method: 'pose', media_id: id,
      landmarks: Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 })) });
    const { record } = await houseApi('/darupoyo', { request_id: crypto.randomUUID(), chore: 'meal', caption: '待たずに開く記録' });
    return { house: client.house, post: kind === 'post' ? completion.post.id : record.id, kind };
  }, kind);
  await page.addInitScript(() => {
    const original = Response.prototype.blob;
    Response.prototype.blob = async function () {
      window.photoDownloadPending = true;
      await new Promise(resolve => { window.releasePhotoDownload = resolve; });
      return original.call(this);
    };
  });
  await page.goto('/#' + new URLSearchParams(target));
  if (kind === 'darupoyo') {
    await expect(page.locator('.pin-viewer')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.pin-viewer')).toContainText('待たずに開く記録');
  } else {
    await expect(page.locator('#photo-modal')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#photo-modal')).toContainText('写真を読み込み中');
    await page.evaluate(() => window.releasePhotoDownload());
    await expect(page.locator('#photo-modal .pm-photo img')).toBeVisible();
  }
  expect(await page.evaluate(() => window.photoDownloadPending)).toBe(true);
});
