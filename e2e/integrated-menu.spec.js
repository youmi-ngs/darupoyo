import {test,expect} from '@playwright/test';
async function enter(page) {
  await page.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));
  await page.goto('/');await page.getByLabel('あなたの名前').fill('統合');await page.getByLabel('新しいハウスの名前').fill('みんなのおうち');
  await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
}
test('menu keeps exactly three actions and the invite link opens the join flow',async({page,browser})=>{
  await enter(page);
  await page.getByRole('button',{name:'メニューを開く'}).click();
  await expect(page.locator('#utility-menu [data-menu-action]')).toHaveText(['設定','遊び方','招待リンク']);
  await page.getByRole('button',{name:'設定',exact:true}).click();await expect(page.locator('#utility-menu')).not.toBeVisible();await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#settings-close').click();await page.getByRole('button',{name:'メニューを開く'}).click();await page.getByRole('button',{name:'遊び方',exact:true}).click();
  await expect(page.locator('#howto-page')).toBeVisible();await page.locator('#howto-close').click();
  await page.getByRole('button',{name:'メニューを開く'}).click();await page.getByRole('button',{name:'招待リンク',exact:true}).click();
  const link=await page.getByRole('textbox',{name:'招待リンク',exact:true}).inputValue();
  expect(new URLSearchParams(new URL(link).hash.slice(1)).get('invite')).toBe(await page.getByRole('textbox',{name:'招待コード',exact:true}).inputValue());
  const context=await browser.newContext();const friend=await context.newPage();await friend.goto(link);
  await expect(friend.getByRole('button',{name:'招待に参加する'})).toBeVisible();
  await friend.getByLabel('あなたの名前').fill('招待されたマブ');await friend.getByRole('button',{name:'招待に参加する'}).click();
  await expect(friend.getByRole('button',{name:'おじゃまします！'})).toBeVisible();await context.close();
});
test('desktop keeps the phone-width house and menu centered',async({page})=>{
  await page.setViewportSize({width:1280,height:800});await enter(page);
  await expect.poll(()=>page.locator('#house-view').evaluate(e=>e.getBoundingClientRect().width)).toBe(430);
  await page.getByRole('button',{name:'メニューを開く'}).click();await expect(page.locator('#utility-menu')).toBeInViewport();
  const box=await page.locator('#utility-menu').boundingBox();expect(Math.abs(box.x+box.width/2-640)).toBeLessThan(2);
  await page.keyboard.press('Escape');await expect(page.locator('#utility-menu')).not.toBeVisible();
});
