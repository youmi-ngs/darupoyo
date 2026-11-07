import { test, expect } from '@playwright/test';
test.beforeEach(async({context,page})=>{
  await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({json:{current:{weather_code:61}}}));
});
async function enter(page) {
 await page.goto('/');await page.getByLabel('あなたの名前').fill('空');await page.getByLabel('新しいハウスの名前').fill('東京');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
}
test('clock, Tokyo weather and daylight follow time and weather',async({page})=>{
 await page.clock.setFixedTime(new Date(2026,10,7,9,30));await enter(page);
 await expect(page.locator('body')).toHaveAttribute('data-daylight','day');
 await expect(page.locator('body')).toHaveAttribute('data-weather','rain');
 await expect(page.locator('.weather-credit')).toHaveCount(0);
 await expect(page.getByText('東京の空', { exact: false })).toHaveCount(0);
 await expect(page.locator('.clock-hour')).toHaveAttribute('transform','rotate(285 15 15)');
 await expect(page.locator('.clock-minute')).toHaveAttribute('transform','rotate(180 15 15)');
 await page.clock.setFixedTime(new Date(2026,10,7,22,0));
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('body')).toHaveAttribute('data-daylight','night');
 await expect(page.locator('.window-sky')).toHaveCSS('fill','rgb(38, 54, 94)');
 await page.screenshot({path:'test-results/night-scene.png'});
 await page.locator('[data-go="3"].scene-tab').click();
 await expect(page.locator('.laundry-basket')).toBeVisible();
 await expect(page.locator('.balcony-clouds')).toBeVisible();
 await expect(page.locator('.balcony-rain')).toBeVisible();
 await expect(page.locator('.balcony-clouds')).toHaveCSS('fill', 'rgb(105, 115, 143)');
 await page.screenshot({path:'test-results/balcony-scene.png'});
});
test('decorating previews the room without falsely completing a chore',async({page})=>{
 await enter(page);await page.locator('[data-go="4"].scene-tab').click();await page.locator('.doors .door').click();
 await expect(page.locator('.myroom')).not.toHaveClass(/is-lit/);
 await page.locator('#room-paint').click();await expect(page.locator('#room-view')).toHaveClass(/is-decorating/);
 await expect(page.locator('.mr-dark')).toHaveCSS('opacity','0');
 await page.getByRole('button',{name:'mint',exact:true}).click();
 await expect(page.getByRole('button',{name:'mint',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#room-view')).toHaveClass(/is-decorating/);
 await page.locator('#room-paint').click();await expect(page.locator('.mr-dark')).toHaveCSS('opacity','1');
 await expect(page.locator('.myroom')).not.toHaveClass(/is-lit/);
});


test('fridge sways with the room and respects reduced motion', async ({ page }) => {
 await enter(page);
 await page.evaluate(() => { document.querySelector('#plan').classList.add('is-swaying'); });
 await expect(page.locator('#open-fridge')).toHaveCSS('animation-name', 'fridgehalo, furniture-sway');
 await page.emulateMedia({ reducedMotion: 'reduce' });
 await expect(page.locator('#open-fridge')).toHaveCSS('animation-name', 'none');
});
