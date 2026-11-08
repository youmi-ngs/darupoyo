import { test, expect } from '@playwright/test';
test('the みんなの今 button opens うちらのなう: take, retake, add a word and みせちゃう (Figma 207:914)', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('カメラ'); await page.getByLabel('新しいハウスの名前').fill('近況'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(5).click(); await page.locator('[data-open-moments]').click();
  const now = page.getByRole('dialog', { name: 'うちらのなう' });
  await expect(now).toBeVisible();
  await expect(now.getByText('今のうちら撮ろ〜')).toBeVisible();
  await expect(now.locator('video')).toBeVisible();
  await expect(now.getByRole('button', { name: 'みせちゃう' })).toBeDisabled(); // nothing to show yet
  await now.getByRole('button', { name: '撮る' }).click();
  await expect(now.locator('canvas')).toBeVisible();
  await now.getByRole('button', { name: '撮り直す' }).click(); // back to the camera
  await expect(now.locator('video')).toBeVisible();
  await now.getByRole('button', { name: '撮る' }).click();
  const word = now.getByLabel('ひとこと（30文字まで）');
  await expect(word).toHaveAttribute('maxlength', '30');
  await word.fill('おはよう');
  await now.getByRole('button', { name: 'みせちゃう' }).click();
  await expect(now).toBeHidden();
  await expect(page.locator('#toast')).toContainText('みんなに見せたよ');
  await expect(page.locator('.door.is-lit')).toHaveCount(0); // not a chore
  // it is on けーじばん, with the gal's word (#158)
  await page.locator('.scene-dot').nth(1).click(); await page.locator('#open-board').click();
  await page.locator('.pin-grid .pin-moment').click();
  await expect(page.locator('.pin-viewer .pin-viewer-text')).toHaveText('おはよう');
  await expect(page.locator('.pin-viewer .moment-praise')).toContainText(/ギャル/);
});

test('without a camera, a photo from the library can be shown', async ({ page, context }) => {
  await context.addInitScript(() => { localStorage.setItem('darupoyo-howto-seen', '1'); navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.goto('/'); await page.getByLabel('あなたの名前').fill('え'); await page.getByLabel('新しいハウスの名前').fill('ら'); await page.getByRole('button', { name: 'ハウスを作る', exact: true }).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(5).click(); await page.locator('[data-open-moments]').click();
  const now = page.getByRole('dialog', { name: 'うちらのなう' });
  await expect(now.getByText('カメラを使えないので、左下からライブラリの写真をえらんでね')).toBeVisible();
  await expect(now.getByRole('button', { name: '撮る' })).toBeHidden();
  const png = await page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 300; c.height = 200; c.getContext('2d').fillRect(0, 0, 300, 200); return Array.from(new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())); });
  await now.locator('.now-library input').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await now.getByRole('button', { name: 'みせちゃう' }).click();
  await expect(now).toBeHidden();
  expect(await page.evaluate(async () => { const { houseApi } = await import('/src/api.js'); return (await houseApi('/moments')).items.length; })).toBe(1);
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
  await expect(page.locator('.now-dialog video')).toBeVisible();
}
const show = async page => {
  await page.getByRole('button', { name: '撮る' }).click();
  await page.getByRole('button', { name: 'みせちゃう' }).click();
  await expect(page.locator('.now-dialog')).toBeHidden();
};
const leftColor = page => page.evaluate(async () => {
  const { houseApi } = await import('/src/api.js'); const [m] = (await houseApi('/moments')).items;
  const bitmap = await createImageBitmap(await houseApi('/media/' + m.media_id));
  const c = new OffscreenCanvas(bitmap.width, bitmap.height), g = c.getContext('2d'); g.drawImage(bitmap, 0, 0);
  const [r, , b] = g.getImageData(10, bitmap.height / 2, 1, 1).data; return r > b ? 'red' : 'blue';
});

test('a front-camera selfie is saved as it looked in the preview, not flipped (#161)', async ({ page }) => {
  await openSelfie(page);
  await expect(page.locator('.now-dialog video')).toHaveClass(/is-mirrored/); // preview shows blue on the left
  await page.getByRole('button', { name: '撮る' }).click();
  await expect(page.locator('.now-dialog canvas')).not.toHaveClass(/is-mirrored/); // the pixels themselves are mirrored
  await page.getByRole('button', { name: 'みせちゃう' }).click(); await expect(page.locator('.now-dialog')).toBeHidden();
  expect(await leftColor(page)).toBe('blue');
});

test('the back camera can be used for a selfie, and it is not mirrored (#161)', async ({ page }) => {
  await openSelfie(page);
  await page.getByRole('button', { name: '外カメラに切り替える' }).click();
  await expect(page.getByRole('button', { name: '内カメラに切り替える' })).toBeVisible();
  expect(await page.evaluate(() => window.asked)).toEqual(['user', 'environment']);
  await expect(page.locator('.now-dialog video')).not.toHaveClass(/is-mirrored/);
  await show(page);
  expect(await leftColor(page)).toBe('red');
});

test('on a short phone screen the shutter and みせちゃう are visible without scrolling (#161)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 600 });
  await openSelfie(page);
  await expect(page.getByRole('button', { name: '撮る' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'みせちゃう' })).toBeInViewport();
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
