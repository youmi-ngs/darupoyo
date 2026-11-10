import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from './onboarding-helper.js';

test('house choices are ready on opening even while membership refresh is pending', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('darupoyo-howto-seen','1'));
  await page.goto('/'); await setWelcomeName(page,'ぽよ'); await setHouseName(page,'すぐ見えるハウス');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();
  await page.getByRole('button',{name:'ハウスに入る'}).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  for (const reload of [false, true]) {
    if (reload) { await page.reload(); await expect(page.locator('.onboarding')).toHaveCount(0); }
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const intercept = async route => { await gate; await route.continue(); };
    await page.route('**/api/houses', intercept);
    await page.locator('#open-menu').click(); await page.locator('#menu-house').click();
    await expect(page.locator('#house-switcher')).toBeVisible();
    await expect(page.locator('#house-list .house-choice b')).toHaveText(['すぐ見えるハウス'], {timeout:300});
    await expect(page.locator('#house-list [aria-current=true]')).toBeVisible();
    const refreshed = page.waitForResponse(r => r.url().endsWith('/api/houses') && r.request().method() === 'GET');
    release(); await refreshed;
    await page.unroute('**/api/houses', intercept);
    await page.locator('#house-switch-close').click();
    await expect(page.locator('#house-switcher')).not.toBeVisible();
  }
});
