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
