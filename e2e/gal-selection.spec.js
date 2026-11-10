import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from './onboarding-helper.js';
test('gal selection shows one check, responds to taps, and persists after reload', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>['darupoyo:entered', 'darupoyo:guide-ready'].forEach(event => window.addEventListener(event, () => queueMicrotask(() => document.querySelector('.first-guide [data-skip]')?.click()))));
  await page.goto('/'); await setWelcomeName(page,'ぽよ'); await setHouseName(page,'ギャルのおうち');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();
  await page.getByRole('button',{name:'ハウスに入る'}).click();
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  for (const selector of ['[data-gal=heisei]','[data-gal=hime]',':first-child']) {
    const choice=page.locator('#gal-picker > button'+selector);
    const saved=page.waitForResponse(r=>r.url().endsWith('/profile')&&r.request().method()==='PUT');
    await choice.click(); await saved;
    await expect(choice).toHaveAttribute('aria-pressed','true');
    await expect(choice.locator('.gal-selected-badge')).toHaveText('✓ 選択中');
    await expect(page.locator('#gal-picker .gal-selected-badge')).toHaveCount(1);
    await expect(choice).toHaveClass(/just-selected/);
  }
  await page.locator('#gal-toggle').screenshot({path:'/tmp/gal-selection.png'});
  await page.reload(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('#open-menu').click(); await page.locator('#open-settings').click();
  await expect(page.locator('#gal-picker > button').first()).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#gal-picker .gal-selected-badge')).toHaveCount(1);
});
