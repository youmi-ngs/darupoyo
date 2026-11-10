import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from './onboarding-helper.js';
for(const viewport of [{width:390,height:844},{width:844,height:390}]) test(`camera and photo fill their frame at ${viewport.width}x${viewport.height}`,async({page,context})=>{
  await page.setViewportSize(viewport); await context.grantPermissions(['camera']);
  await page.goto('/'); await setWelcomeName(page,'写真'); await setHouseName(page,'写真枠');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();
  await page.getByRole('button',{name:'スキップ',exact:true}).click();
  await page.locator('.scene-dot').nth(1).click(); await page.locator('[data-open-moments]').click();
  const frame=page.locator('.now-frame'), video=frame.locator('video');
  await expect(video).toBeVisible();
  const camera=await video.boundingBox(), bounds=await frame.boundingBox();
  expect(Math.abs(camera.width-bounds.width)).toBeLessThan(1); expect(Math.abs(camera.height-bounds.height)).toBeLessThan(1);
  expect(await video.evaluate(el=>getComputedStyle(el).objectFit)).toBe('cover');
  await page.getByRole('button',{name:'撮る',exact:true}).click();
  const canvas=frame.locator('canvas'); await expect(canvas).toBeVisible();
  await expect.poll(()=>canvas.evaluate(el=>{const b=el.getBoundingClientRect();return Math.abs(b.width/b.height-el.width/el.height);})).toBeLessThan(.01);
  const photo=await frame.boundingBox(); expect(Math.max(photo.width,photo.height)).toBeLessThanOrEqual(181);
  await page.screenshot({path:`/tmp/round3-photo-${viewport.width}.png`,animations:'disabled'});
});
