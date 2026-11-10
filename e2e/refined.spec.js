import { test, expect } from '@playwright/test';
import { setWelcomeName, setHouseName } from './onboarding-helper.js';
test.use({ viewport: { width: 390, height: 704 } });
test.beforeEach(async ({ context }) => context.addInitScript(() => ['darupoyo:entered', 'darupoyo:guide-ready'].forEach(event => window.addEventListener(event, () => queueMicrotask(() => document.querySelector('.first-guide [data-skip]')?.click())))));

test('welcome keeps drafts on back, validates invitations and submits explicitly', async ({ page }) => {
  let creates = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/houses')) creates++; });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeHidden();
  await page.getByLabel('あなたの名前').fill('ぽよ');
  await page.getByLabel('あなたの名前').press('Enter');
  await setHouseName(page, '入力途中のおうち');
  expect(creates).toBe(0);
  await page.getByRole('button', { name: 'もどる', exact: true }).click();
  await page.getByRole('button', { name: '友達の家に住む', exact: true }).click();
  await page.getByLabel('招待コード').fill('INVALID');
  await page.getByLabel('招待コード').press('Enter');
  await expect(page.locator('.onboarding [role=status]')).toBeVisible();
  await expect(page.getByRole('button', { name: '招待に参加する' })).toBeEnabled();
  await page.getByRole('button', { name: 'もどる', exact: true }).click();
  await page.getByRole('button', { name: '新しく家をつくる', exact: true }).click();
  await expect(page.getByLabel('新しいハウスの名前')).toHaveValue('入力途中のおうち');
  await page.getByLabel('新しいハウスの名前').press('Enter');
  await expect(page.getByRole('heading', { name: '新しくつくったよ！' })).toBeVisible();
  await expect(page.locator('.created-house-name')).toHaveText('入力途中のおうち');
  await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  expect(creates).toBe(1);
});

test('trash asks for a pose only after starting; composer can cancel without posting', async ({ page }) => {
  await page.goto('/'); await setWelcomeName(page, 'ぽよ'); await setHouseName(page, 'refined');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').first().click();
  await page.locator('[data-chore=trash]').click();
  await expect(page.getByRole('button', { name: /サンタのポーズ/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^ゴミ捨てる/ }).click();
  await expect(page.locator('.refined-poses button')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /サンタのポーズ/ })).toBeVisible();
  await page.locator('#sheet-close').click();
  await page.locator('[data-chore=trash]').click();
  await page.getByRole('button', { name: /^だるぽよ/ }).click();
  await page.getByLabel('ひとこと（任意・30文字まで）').fill('おやすみ');
  await expect(page.locator('[data-count]')).toHaveText('4 / 30');
  await page.evaluate(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => { window.photoStream = await get(options); return window.photoStream; };
  });
  await page.getByRole('button', { name: '写真を撮る', exact: true }).click();
  await expect(page.locator('.photo-camera video')).toBeVisible();
  await page.getByRole('button', { name: '撮影する', exact: true }).click();
  await expect(page.locator('.darupoyo-preview')).toBeVisible();
  await expect(page.locator('.photo-camera')).toHaveCount(0);
  expect(await page.evaluate(() => window.photoStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await expect(page.getByLabel('ひとこと（任意・30文字まで）')).toHaveValue('おやすみ');
  const library = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'ライブラリから選ぶ' }).click();
  expect(await (await library).element().getAttribute('capture')).toBeNull();
  await page.locator('.darupoyo-dialog [data-close]').click();
  const records = await page.evaluate(async () => (await import('/src/api.js')).houseApi('/darupoyo'));
  expect(records.items).toHaveLength(0);
});

async function openComposer(page) {
  await page.goto('/'); await setWelcomeName(page, 'カメラ'); await setHouseName(page, 'だるぽよ写真');
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', { name: 'ハウスに入る', exact: true }).click();
  await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(2).click();
  await page.locator('[data-chore=meal]').click();
  await page.getByRole('button', { name: /^だるぽよ/ }).click();
}

test('camera denial leaves the draft intact and the library available', async ({ page }) => {
  await openComposer(page);
  await page.getByLabel('ひとこと（任意・30文字まで）').fill('のんびり');
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: '写真を撮る', exact: true }).click();
  await expect(page.locator('.darupoyo-dialog [role=status]')).toContainText('カメラの利用を許可');
  await expect(page.locator('.photo-camera')).toHaveCount(0);
  await expect(page.getByLabel('ひとこと（任意・30文字まで）')).toHaveValue('のんびり');
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'ライブラリから選ぶ' }).click();
  expect(await (await picker).element().getAttribute('capture')).toBeNull();
  await expect(page.locator('[data-save]')).toBeEnabled();
});

test('cancelling a pending camera releases a stream that arrives later', async ({ page }) => {
  await openComposer(page);
  await page.evaluate(() => {
    const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = options => new Promise(resolve => {
      window.releasePhotoCamera = async () => { window.lateStream = await get(options); resolve(window.lateStream); };
    });
  });
  await page.getByRole('button', { name: '写真を撮る', exact: true }).click();
  await page.getByRole('button', { name: '撮影をやめる' }).click();
  await page.evaluate(() => window.releasePhotoCamera());
  await expect.poll(() => page.evaluate(() => window.lateStream.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await expect(page.locator('.photo-camera')).toHaveCount(0);
  await expect(page.locator('.darupoyo-preview')).toBeHidden();
  await expect(page.locator('[data-save]')).toBeEnabled();
});
