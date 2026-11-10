import {test,expect} from '@playwright/test';
import {setWelcomeName,setHouseName} from '../e2e/onboarding-helper.js';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
async function enter(page){
 await page.goto('/');await setWelcomeName(page,'確認');await setHouseName(page,'ひとこと');
 await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();await page.getByRole('button',{name:'スキップ',exact:true}).click();
}
test('darupoyo shares without opening text; opt-in preserves a draft when collapsed',async({page})=>{
 await enter(page);await page.locator('[data-chore=meal]').click();await page.getByRole('button',{name:/^だるぽよ/}).click();
 const dialog=page.locator('.darupoyo-dialog'),input=dialog.locator('textarea');
 await expect(input).toBeHidden();await expect(dialog.locator('[data-save]')).toBeEnabled();
 await page.screenshot({path:'/tmp/optional-caption-empty.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'＋ ひとこと',exact:true}).click();await input.fill('ゆるっと');
 await dialog.getByRole('button',{name:'− ひとこと',exact:true}).click();await expect(input).toHaveValue('ゆるっと');await expect(input).toBeHidden();
 await dialog.getByRole('button',{name:'✎ ひとことを編集',exact:true}).click();await input.fill('');
 await dialog.getByRole('button',{name:'− ひとこと',exact:true}).click();await dialog.locator('[data-save]').click();await expect(dialog).toContainText('記録かんりょ');
});
test('meal and moments show their caption inputs immediately',async({page,context})=>{
 await context.grantPermissions(['camera','microphone']);await enter(page);
 await page.locator('[data-chore=meal]').click();await page.getByRole('button',{name:/^たべる/}).click();
 await expect(page.locator('.capture-word input')).toBeVisible();
 await expect(page.locator('#sheet .caption-add')).toHaveCount(0);
 await page.locator('#sheet-close').click();await page.locator('.scene-dot').nth(1).click();await page.locator('[data-open-moments]').click();
 await expect(page.locator('.now-field input')).toBeVisible();
 await expect(page.locator('.now-dialog .caption-add')).toHaveCount(0);
 await page.locator('.now-field input').fill('おはよ');
 await expect(page.locator('.now-field input')).toHaveValue('おはよ');
});
