import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async({context})=>{await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));});
test('pose camera timer counts down and a failed pose can be retaken without leaving the camera (#10 #13)',async({page,context})=>{
  test.setTimeout(90000);
  await context.grantPermissions(['camera']);
  await page.goto('/');await setWelcomeName(page, 'pose');await setHouseName(page, 'timer');await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', { name: 'おうちに入る', exact: true }).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(0).click();await page.locator('[data-chore="trash"]').click(); await page.getByRole('button',{name:/^ゴミ捨てる/}).click();await page.getByRole('button',{name:/サンタのポーズ/}).click();
  await page.getByRole('button',{name:'3秒'}).click();
  await expect(page.getByRole('button',{name:'3秒'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  await expect(page.locator('.capture-count')).toBeVisible();await expect(page.locator('.capture-timer')).toHaveCount(0);
  await expect(page.locator('.capture-status')).toContainText('秒後に撮るよ');
  await expect(page.getByRole('button',{name:'もう1回撮る'})).toBeVisible({timeout:45000});
  await expect(page.locator('.capture-status')).toContainText('人が見つからなかったよ');
  await page.getByRole('button',{name:'もう1回撮る'}).click();
  await expect(page.locator('.capture video')).toBeVisible();
  await expect(page.getByRole('button',{name:'3秒'})).toHaveAttribute('aria-pressed','true');
});

// The pose and cutout models stand in as ones that always find a person, so the garbage card
// can be followed to the end: judged as the photo comes in, then プレゼントを届ける (Figma 06 → 11).
const fakePose = `
export const PRESET_PASS = 60;
export const PRESET_POSES = {};
export const presetScore = () => 88;
export const poseSimilarity = () => 70;
export const hasUpperBody = l => !!l;
export async function createPoseLandmarker() {
  const landmarks = Array.from({ length: 33 }, (_, i) => ({ x: .5, y: i / 40, z: 0, visibility: 1 }));
  return { detectForVideo: () => ({ landmarks: [landmarks], close() {} }), close() {} };
}`;
const fakeSegment = `
export async function createSegmenter() { return { close() {} }; }
export function cutout(_, canvas, ctx) { ctx.clearRect(0, 0, canvas.width / 3, canvas.height); return .4; }`;

test('ゴミ出し: the pose is judged as soon as the photo is in, and プレゼントを届ける sends it with the word (Figma 06 → 11)', async ({ page, context }) => {
  await context.grantPermissions(['camera']);
  await page.route(/\/src\/pose\.js/, route => route.fulfill({ contentType: 'application/javascript', body: fakePose }));
  await page.route(/\/src\/segment\.js/, route => route.fulfill({ contentType: 'application/javascript', body: fakeSegment }));
  await page.goto('/'); await setWelcomeName(page, 'pose'); await setHouseName(page, 'present'); await page.getByRole('button', { name: 'ハウスをつくる', exact: true }).click(); await page.getByRole('button', {name:'おうちに入る'}).click(); await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(0).click(); await page.locator('[data-chore="trash"]').click(); await page.getByRole('button', { name: /^ゴミ捨てる/ }).click(); await page.getByRole('button', { name: /サンタのポーズ/ }).click();
  const send = page.getByRole('button', { name: 'プレゼントを届ける' });
  await expect(page.locator('.capture-status')).toHaveText('上半身が入ればOKだよ！');
  await expect(send).toBeDisabled();
  // the timer sits right under the photo, the word under the timer
  expect(await page.locator('.capture > *').evaluateAll(n => n.map(e => e.className).filter(c => /capture-(frame|timer|word|use)/.test(c)).map(c => c.match(/capture-(frame|timer|word|use)/)[0]))).toEqual(['capture-frame', 'capture-timer', 'capture-word', 'capture-use']);
  const word = page.locator('#sheet').getByLabel('ひとこと（かかなくてもおけ♡）');
  await expect(word).toHaveAttribute('placeholder', 'めりくり！');
  await word.fill('ゴミ捨てえらい');
  await page.getByRole('button', { name: 'この写真を撮る' }).click();
  // judged right away: no extra step, the button wakes up
  await expect(page.locator('.capture-status')).toContainText('プレゼントを届けよ');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText('記録できたよん。今日もえらい！')).toBeVisible();
  await expect(page.locator('#sheet-title')).toHaveText('サンタのポーズ');
  await expect(page.locator('.done-caption')).toHaveText('ゴミ捨てえらい');
  await expect(page.locator('.done-verdict .gal-text')).not.toHaveText('');
  const [post] = await page.evaluate(async () => { const { houseApi } = await import('/src/api.js'); return (await houseApi('/posts')).items; });
  expect([post.chore, post.method, post.caption]).toEqual(['garbage', 'pose', 'ゴミ捨てえらい']);
  await page.getByRole('button', { name: 'け〜じばんをちぇけらする' }).click();
  await expect(page.locator('#board-view')).toBeVisible();
});
