import { test, expect } from '@playwright/test';
test.beforeEach(async({context})=>{await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));});
test('pose camera timer counts down and a failed pose can be retaken without leaving the camera (#10 #13)',async({page,context})=>{
  test.setTimeout(90000);
  await context.grantPermissions(['camera']);
  await page.goto('/');await page.getByLabel('あなたの名前').fill('pose');await page.getByLabel('新しいハウスの名前').fill('timer');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(0).click();await page.locator('[data-chore="trash"]').click();await page.getByRole('button',{name:/サンタのポーズ/}).click();
  await page.getByRole('button',{name:'3秒'}).click();
  await expect(page.getByRole('button',{name:'3秒'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  await expect(page.locator('.capture-count')).toBeVisible();await expect(page.locator('.capture-timer')).toHaveCount(0);
  await expect(page.locator('.capture-status')).toContainText('秒後に撮るよ');
  await expect(page.getByRole('button',{name:'もう1回撮る'})).toBeVisible({timeout:45000});
  await expect(page.locator('.capture-status')).toContainText('全身を見つけられませんでした');
  await page.getByRole('button',{name:'もう1回撮る'}).click();
  await expect(page.locator('video')).toBeVisible();
  await expect(page.getByRole('button',{name:'3秒'})).toHaveAttribute('aria-pressed','true');
});
