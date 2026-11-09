import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import {test,expect} from '@playwright/test';
async function enter(page) {
  await page.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));
  await page.goto('/');await setWelcomeName(page, '統合');await setHouseName(page, 'みんなのおうち');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click();await expect(page.locator('.onboarding')).toHaveCount(0);
}
test('menu keeps exactly three actions and the copied invite code joins the house',async({page,browser})=>{
  await enter(page);
  await page.getByRole('button',{name:'メニューを開く'}).click();
  await expect(page.locator('#utility-menu [data-menu-action]')).toHaveText(['マイページ','遊び方','ハウス切り替え']);
  await page.getByRole('button',{name:'マイページ',exact:true}).click();await expect(page.locator('#utility-menu')).not.toBeVisible();await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#settings-close').click();await page.getByRole('button',{name:'メニューを開く'}).click();await page.getByRole('button',{name:'遊び方',exact:true}).click();
  await expect(page.locator('#howto-page')).toBeVisible();await page.locator('#howto-close').click();
  await page.getByRole('button',{name:'メニューを開く'}).click();await page.locator('#open-settings').click();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.copied = t; return Promise.resolve(); } } }));
  await page.getByRole('button',{name:'コードをコピー',exact:true}).click(); await expect(page.locator('#invite-status')).toContainText('招待コードをコピーしたよ');
  const code=await page.evaluate(() => window.copied);
  expect(code).toBe(await page.locator('#settings-invite').textContent());
  const context=await browser.newContext();const friend=await context.newPage();await friend.goto(page.url());
  await setWelcomeName(friend, '招待されたマブ');
  await friend.getByRole('button',{name:'友達の家に住む',exact:true}).click();
  await friend.getByLabel('招待コード').fill(code);
  await friend.getByRole('button',{name:'招待に参加する'}).click();
  await expect(friend.getByRole('button',{name:'おじゃまします！'})).toBeVisible();await context.close();
});
test('desktop keeps the menu inside the phone-width house',async({page})=>{
  await page.setViewportSize({width:1280,height:800});await enter(page);
  await expect.poll(()=>page.locator('#house-view').evaluate(e=>e.getBoundingClientRect().width)).toBe(430);
  await page.getByRole('button',{name:'メニューを開く'}).click();await expect(page.locator('#utility-menu')).toBeInViewport();
  const box=await page.locator('#utility-menu').boundingBox(), house=await page.locator('#house-view').boundingBox(); expect(box.x).toBeGreaterThanOrEqual(house.x); expect(box.x+box.width).toBeLessThanOrEqual(house.x+house.width);
  await page.keyboard.press('Escape');await expect(page.locator('#utility-menu')).not.toBeVisible();
});
