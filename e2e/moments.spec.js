import { test, expect } from '@playwright/test';
test('selfies share a photo without completing chores or lighting rooms',async({page,context})=>{
 await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));
 await page.goto('/');await page.getByLabel('あなたの名前').fill('カメラ');await page.getByLabel('新しいハウスの名前').fill('近況');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
 await page.locator('.scene-dot').nth(5).click();await page.locator('[data-open-moments]').click();
 await page.getByRole('button',{name:'自撮りを撮る',exact:true}).click();
 await page.getByRole('button',{name:'この写真を撮る',exact:true}).click();
 await page.getByRole('button',{name:'もう1回撮る',exact:true}).click();
 await page.getByRole('button',{name:'この写真を撮る',exact:true}).click();
 await page.getByRole('button',{name:'この写真を使う',exact:true}).click();
 await page.getByLabel('ひとこと（任意）').fill('おはよう');
 await page.getByRole('button',{name:'みんなに共有',exact:true}).click();
 await expect(page.locator('.moments-dialog article')).toHaveCount(1);
 await expect(page.locator('.moments-dialog article')).toContainText('おはよう');
 // #158: the gal this resident picked answers under the selfie
 await expect(page.locator('.moments-dialog article .moment-praise')).toContainText(/ギャル/);
 await expect(page.locator('.moments-dialog article .moment-praise > span:last-child')).not.toHaveText('');
 await page.locator('.moments-dialog [data-close]').click();
 await expect(page.locator('.door.is-lit')).toHaveCount(0);
 await page.reload();await expect(page.locator('.onboarding')).toHaveCount(0);
 await page.locator('.scene-dot').nth(5).click();await page.locator('[data-open-moments]').click();
 await expect(page.locator('.moments-dialog article')).toContainText('おはよう');
});

test('the gal line shows on the けーじばん card of a selfie too (#158)', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('もち'); await page.getByLabel('新しいハウスの名前').fill('いま'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(async () => {
    const { houseApi } = await import('/src/api.js');
    await houseApi('/profile', { gal: 'hime' }, 'PUT');
    const c = document.createElement('canvas'); c.width = c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40);
    const { id } = await houseApi('/media?kind=selfie', await new Promise(r => c.toBlob(r, 'image/jpeg')));
    await houseApi('/moments', { request_id: crypto.randomUUID(), media_id: id, caption: 'カフェきた' });
  });
  await page.locator('.scene-dot').nth(1).click(); await page.locator('#open-board').click();
  await page.locator('.pin-grid .pin-moment').click();
  const viewer = page.locator('.pin-viewer');
  await expect(viewer.locator('.pin-viewer-text')).toHaveText('カフェきた');
  await expect(viewer.locator('.moment-praise b')).toHaveText('姫ギャル');
  await expect(viewer.locator('.moment-praise > span:last-child')).not.toHaveText('');
});

// #161: a fake camera whose left half is red and right half blue, that reports the facing it was asked for.
const twoCameras = () => {
  window.asked = [];
  navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'front' }, { kind: 'videoinput', deviceId: 'back' }];
  navigator.mediaDevices.getUserMedia = async constraints => {
    const facing = constraints.video?.facingMode || 'user'; window.asked.push(facing);
    const c = document.createElement('canvas'); c.width = 600; c.height = 720; const g = c.getContext('2d');
    const paint = () => { g.fillStyle = '#ff0000'; g.fillRect(0, 0, 300, 720); g.fillStyle = '#0000ff'; g.fillRect(300, 0, 300, 720); };
    paint(); setInterval(paint, 100);
    const stream = c.captureStream(10), track = stream.getVideoTracks()[0], settings = track.getSettings.bind(track);
    track.getSettings = () => ({ ...settings(), facingMode: facing });
    return stream;
  };
};
async function openSelfie(page) {
  await page.addInitScript(twoCameras); await page.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('かがみ'); await page.getByLabel('新しいハウスの名前').fill('いま'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(5).click(); await page.locator('[data-open-moments]').click();
  await page.getByRole('button', { name: '自撮りを撮る', exact: true }).click();
  await expect(page.locator('.capture-live video')).toBeVisible();
}
const leftColor = page => page.evaluate(async () => {
  const { houseApi } = await import('/src/api.js'); const [m] = (await houseApi('/moments')).items;
  const bitmap = await createImageBitmap(await houseApi('/media/' + m.media_id));
  const c = new OffscreenCanvas(bitmap.width, bitmap.height), g = c.getContext('2d'); g.drawImage(bitmap, 0, 0);
  const [r, , b] = g.getImageData(10, bitmap.height / 2, 1, 1).data; return r > b ? 'red' : 'blue';
});

test('a front-camera selfie is saved as it looked in the preview, not flipped (#161)', async ({ page }) => {
  await openSelfie(page);
  await expect(page.locator('.capture-live video')).toHaveClass(/is-mirrored/); // preview shows blue on the left
  await page.getByRole('button', { name: 'この写真を撮る' }).click();
  await expect(page.locator('.capture canvas')).not.toHaveClass(/is-mirrored/); // the pixels themselves are mirrored
  await page.getByRole('button', { name: 'この写真を使う' }).click();
  await page.getByRole('button', { name: 'みんなに共有', exact: true }).click();
  await expect(page.locator('.moments-dialog article')).toHaveCount(1);
  expect(await leftColor(page)).toBe('blue');
});

test('the back camera can be used for a selfie, and it is not mirrored (#161)', async ({ page }) => {
  await openSelfie(page);
  await page.getByRole('button', { name: '外カメラに切り替える' }).click();
  await expect(page.getByRole('button', { name: '内カメラに切り替える' })).toBeVisible();
  expect(await page.evaluate(() => window.asked)).toEqual(['user', 'environment']);
  await expect(page.locator('.capture-live video')).not.toHaveClass(/is-mirrored/);
  await page.getByRole('button', { name: 'この写真を撮る' }).click();
  await page.getByRole('button', { name: 'この写真を使う' }).click();
  await page.getByRole('button', { name: 'みんなに共有', exact: true }).click();
  await expect(page.locator('.moments-dialog article')).toHaveCount(1);
  expect(await leftColor(page)).toBe('red');
});

test('on a short phone screen the shutter is visible without scrolling (#161)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 600 });
  await openSelfie(page);
  await expect(page.getByRole('button', { name: 'この写真を撮る' })).toBeInViewport();
  await expect(page.locator('.moments-dialog > p').first()).toBeHidden();
});

test('in the けーじばん viewer, みんなの今 posts can be swiped through', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('もち'); await page.getByLabel('新しいハウスの名前').fill('すわいぷ'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.evaluate(async () => {
    const { houseApi } = await import('/src/api.js');
    for (const caption of ['ひとつめ', 'ふたつめ', 'みっつめ']) {
      const c = document.createElement('canvas'); c.width = c.height = 40; c.getContext('2d').fillRect(0, 0, 40, 40);
      const { id } = await houseApi('/media?kind=selfie', await new Promise(r => c.toBlob(r, 'image/jpeg')));
      await houseApi('/moments', { request_id: crypto.randomUUID(), media_id: id, caption });
    }
  });
  await page.locator('.scene-dot').nth(1).click(); await page.locator('#open-board').click();
  await expect(page.locator('.pin-grid .pin-moment')).toHaveCount(3);
  await page.locator('.pin-grid .pin-moment').first().click(); // newest first
  const viewer = page.locator('.pin-viewer'), count = viewer.locator('.pin-viewer-count');
  const shown = () => viewer.evaluate(v => { const t = v.querySelector('.pin-viewer-track'); return t.children[Math.round(t.scrollLeft / t.clientWidth)].querySelector('.pin-viewer-text').textContent; });
  await expect(count).toHaveText('1 / 3');
  expect(await shown()).toBe('みっつめ');
  // a sideways swipe moves to the next one
  const box = await viewer.locator('.pin-viewer-track').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 100); await page.mouse.wheel(box.width, 0);
  await expect(count).toHaveText('2 / 3');
  expect(await shown()).toBe('ふたつめ');
  // and the arrow keys work too
  await viewer.locator('.pin-viewer-track').press('ArrowRight');
  await expect(count).toHaveText('3 / 3');
  expect(await shown()).toBe('ひとつめ');
  // opening a later card starts there
  await viewer.getByRole('button', { name: '閉じる' }).click();
  await page.locator('.pin-grid .pin-moment').nth(1).click();
  await expect(count).toHaveText('2 / 3');
});
