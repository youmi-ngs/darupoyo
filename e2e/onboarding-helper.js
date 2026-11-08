import { expect } from '@playwright/test';
export async function setWelcomeName(page, name) {
  await expect(page.locator('.onboarding')).toHaveAttribute('data-screen', 'card');
  if (await page.getByLabel('あなたの名前').count()) {
    await page.getByLabel('あなたの名前').fill(name);
    await page.getByRole('button', { name: '次へ', exact: true }).click();
  }
}
export async function setHouseName(page, name) {
  await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click();
  await page.getByLabel('新しいハウスの名前').fill(name);
}
