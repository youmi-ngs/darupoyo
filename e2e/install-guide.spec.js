import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from './onboarding-helper.js';
async function howto(page) {
  await page.addInitScript(() => localStorage.setItem('darupoyo-howto-seen','1'));
  await page.goto('/'); await setWelcomeName(page,'ぽよ'); await setHouseName(page,'追加の案内');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();
  await page.getByRole('button',{name:'ハウスに入る'}).click();
  await page.locator('#open-menu').click(); await page.locator('#open-howto').click();
  await expect(page.locator('#settings #install-card')).toHaveCount(0);
}
test('iPhone instructions explain Share and adding to the home screen, and close back to how-to', async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(navigator,'userAgent',{get:()=> 'iPhone'}));
  await howto(page); await page.locator('.howto-card.is-active').getByRole('button',{name:'5ページ目へ'}).click(); await page.locator('#install-app').click();
  const guide=page.locator('.install-guide');
  await expect(guide.locator('.install-device:visible')).toHaveCount(0);
  await expect(guide.locator('[data-choose]')).toHaveCount(3);
  await guide.getByRole('button',{name:'iPhone・iPad Safari'}).click();
  await expect(guide.locator('[data-device=ios]')).toBeVisible();
  await expect(guide.locator('[data-device=ios]')).toContainText('iPhone・iPad');
  await expect(guide.locator('[data-device=ios]')).toContainText('共有ボタン');
  await expect(guide.locator('details, summary')).toHaveCount(0);
  for (const device of ['ios','android','desktop']) {
    await guide.locator(`[data-choose=${device}]`).click();
    await expect(guide.locator(`[data-choose=${device}]`)).toHaveAttribute('aria-pressed','true');
    await expect(guide.locator('.install-device:visible')).toHaveCount(1);
    await expect(guide.locator(`[data-device=${device}] .install-steps`)).toBeVisible();
  }
  for (const device of ['ios','android']) await expect(guide.locator(`[data-device=${device}] .install-steps li`)).toHaveCount(2);
  await expect(guide.locator('[data-install]')).toBeHidden();
  await guide.getByRole('button',{name:'閉じる'}).click();
  await expect(page.locator('#howto-page')).toBeVisible();
  await expect(page.locator('#install-app')).toBeFocused();
});
test('native install is user-triggered, dismissible, and hidden after installation', async ({page}) => {
  await howto(page);
  await page.evaluate(() => {
    window.prompts=0;
    window.offerInstall = outcome => {
      const event=new Event('beforeinstallprompt',{cancelable:true});
      event.prompt=async()=>{window.prompts++;}; event.userChoice=Promise.resolve({outcome});
      window.dispatchEvent(event);
    };
    window.offerInstall('dismissed');
  });
  expect(await page.evaluate(()=>window.prompts)).toBe(0);
  await page.locator('.howto-card.is-active').getByRole('button',{name:'5ページ目へ'}).click();
  await page.locator('#install-app').click();
  const guide=page.locator('.install-guide');
  await expect(guide.locator('[data-install]')).toBeHidden();
  await guide.getByRole('button',{name:'Android Chrome',exact:true}).click();
  await expect(guide.locator('[data-device=android]')).toBeVisible();
  await expect(guide.locator('[data-device=android]')).toContainText('Android');
  await guide.locator('[data-install]').click();
  await expect(guide.locator('[role=status]')).toContainText('またいつでも');
  await expect(guide.locator('[data-install]')).toBeHidden();
  await expect(page.locator('#install-card')).toBeVisible();
  await page.evaluate(()=>window.offerInstall('accepted'));
  await guide.locator('[data-install]').click();
  expect(await page.evaluate(()=>window.prompts)).toBe(2);
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
  await expect(guide).not.toBeVisible();
  await expect(page.locator('#install-card')).toContainText('もうホーム画面に追加できてるよ');
  await expect(page.locator('#install-app')).toBeHidden();
});
test('the home-screen app keeps the card, but says it is already added (#177)', async ({page}) => {
  await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{get:()=>true}));
  await howto(page);
  await expect(page.locator('.howto-card')).toHaveCount(5);
  await expect(page.locator('#howto-track')).toHaveAttribute('aria-label', /全5ページ/);
  await expect(page.locator('#install-card')).toContainText('もうホーム画面に追加できてるよ');
  await expect(page.locator('#install-app')).toBeHidden();
});
test('the terms and privacy policy are linked from マイページ and the sign-in screen, and say 18+', async ({page}) => {
  await page.goto('/privacy.html');
  await expect(page.getByRole('heading', { name: 'プライバシーポリシー', level: 1 })).toBeVisible();
  await expect(page.locator('main')).toContainText('18歳以上');
  await page.goto('/terms.html');
  await expect(page.getByRole('heading', { name: '利用規約', level: 1 })).toBeVisible();
  await expect(page.locator('a[href="/privacy.html"]').first()).toBeVisible();
  await page.goto('/');
  await expect(page.locator('#settings .legal-links a[href="/terms.html"]')).toHaveCount(1);
  await expect(page.locator('#settings .legal-links a[href="/privacy.html"]')).toHaveCount(1);
});
for (const [name, viewport] of [['phone', { width: 375, height: 568 }], ['pc', { width: 1280, height: 800 }]]) {
  test(`the sign-in logo keeps clear of the Google button (${name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      document.querySelectorAll('dialog[open]').forEach(d => d.close()); document.querySelector('.onboarding')?.remove();
      const { createWelcome } = await import('/src/welcome-ui.js'); createWelcome().login(() => new Promise(() => {}));
    });
    const button = page.locator('.google-sign-in');
    await expect(button).toBeVisible(); await page.waitForTimeout(1200); // after the logo has risen
    const [logo, sign, legal] = await Promise.all(['.refined-welcome .welcome-logo', '.google-sign-in', '.welcome-legal'].map(s => page.locator(s).boundingBox()));
    expect(sign.y - (logo.y + logo.height)).toBeGreaterThanOrEqual(40);
    expect(legal.y).toBeGreaterThan(sign.y + sign.height);
  });
}
