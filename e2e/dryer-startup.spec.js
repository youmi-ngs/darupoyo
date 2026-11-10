import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from './onboarding-helper.js';
test('drying starts the real audio model and classifies microphone windows', async ({page,context}) => {
  test.setTimeout(90000);
  await context.grantPermissions(['microphone']);
  await page.goto('/'); await setWelcomeName(page,'音声確認'); await setHouseName(page,'音声モデル');
  await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();
  await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();
  await page.getByRole('button',{name:'スキップ',exact:true}).click();
  await page.locator('.scene-dot').nth(3).click();
  await page.locator('[data-chore=dryer]').click();
  await page.getByRole('button',{name:/^乾かす/}).click();
  // No model mock: exercise the installed JS exports, WASM, YAMNet and PCM worklet.
  await expect(page.getByRole('meter',{name:'マイクの音量'})).toBeVisible({timeout:60000});
  await expect(page.locator('.capture-status')).toContainText('/ 10びょ〜',{timeout:15000});
  await expect(page.locator('.mic-level small')).not.toHaveText('ドライヤーをつけてみてね');
  await page.locator('#sheet-close').click();
  await expect(page.locator('#sheet')).not.toBeVisible();
});
