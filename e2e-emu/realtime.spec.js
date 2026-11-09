import { setWelcomeName, setHouseName } from '../e2e/onboarding-helper.js';
import { test, expect } from '@playwright/test';
import { playRhythm, stillCamera } from '../e2e/rhythm-helper.js';
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
});

// Signs in through the Auth Emulator's fake Google account picker.
async function signIn(page, name) {
  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  const popup = await popupPromise;
  await popup.getByText('Add new account').click();
  await popup.locator('#autogen-button').click();
  await popup.locator('#display-name-input').fill(name);
  await popup.locator('#sign-in').click();
  await expect(page.getByLabel('あなたの名前')).toBeVisible();
}

test('a friend clearing a chore lights their room on my screen via Firestore', async ({ page, browser }) => {
  await signIn(page, 'もち');
  await setWelcomeName(page, 'もち');
  await setHouseName(page, 'エミュハウス');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('#open-menu').click();
  await page.locator('#open-settings').click(); await page.getByRole('button', { name: '招待リンク', exact: true }).click();
  const code = await page.getByRole('textbox', { name: '招待コード', exact: true }).inputValue();
  await page.locator('#sheet-close').click();

  const friendContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await stillCamera(friendContext);
  const friend = await friendContext.newPage();
  await signIn(friend, 'ともだち');
  await friend.addInitScript(() => localStorage.setItem('darupoyo-howto-seen', '1'));
  await friend.goto('/');
  await friend.reload();
  await setWelcomeName(friend, 'ともだち'); await friend.getByRole('button',{name:'友達の家に住む',exact:true}).click(); await friend.getByLabel('招待コード').fill(code);

  await friend.getByRole('button', { name: '招待に参加する' }).click();
  await expect(friend.locator('.onboarding')).toHaveCount(0);
  await friend.getByRole('button', { name: 'おじゃまします！' }).click();
  await expect(page.locator('.doors .door')).toHaveCount(2, { timeout: 15000 });
  await expect(page.locator('.door.is-lit')).toHaveCount(0);

  // The friend clears laundry with the camera rhythm.
  await friend.locator('.scene-dot').nth(4).click();
  await friend.locator('[data-chore="laundry"]').click();
  await friend.getByRole('button', { name: /^干す/ }).click();
  await playRhythm(friend, 8);
  await friend.getByRole('button', { name: '部屋に飾る', exact: true }).click();
  await expect(friend.getByText('記録できた！')).toBeVisible();

  // Polling is every 60 s in Firebase mode, so lighting up within 10 s comes from onSnapshot.
  await expect(page.locator('.door.is-lit')).toHaveCount(1, { timeout: 10000 });
});
