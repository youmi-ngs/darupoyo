import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    const box = document.createElement('div');
    box.className = 'capture';
    document.body.replaceChildren(box);
    window.controller = new AbortController();
    window.attempts = [];
    class Speech {
      constructor() { window.attempts.push(this); }
      start() { if (window.failStart) throw new Error('unavailable'); }
      abort() { this.aborted = true; }
    }
    const { confirmMealVoice } = await import('/src/meal-voice.js');
    window.outcome = 'pending';
    confirmMealVoice(box, Speech, controller.signal).then(value => window.outcome = value, error => window.outcome = error.name);
  });
}
async function emit(page, name, data) {
  await page.evaluate(({ name, data }) => window.attempts.at(-1)[name]?.(data), { name, data });
}

test('shows readiness, listening, processing and persistent success before continuing', async ({ page }) => {
  await setup(page);
  await expect(page.getByText('いただきます、しよう', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'starting');
  await emit(page, 'onaudiostart');
  await expect(page.getByText('「いただきます」と言ってね', { exact: true })).toBeVisible();
  await emit(page, 'onspeechstart');
  await expect(page.getByText('うん、聞いてるよ')).toBeVisible();
  await emit(page, 'onspeechend');
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'processing');
  await emit(page, 'onresult', { results: [[{ transcript: 'いただきます' }]] });
  await expect(page.getByText('聞こえた！')).toBeVisible();
  expect(await page.evaluate(() => ({ outcome, stopped: attempts[0].aborted }))).toEqual({ outcome: 'pending', stopped: true });
  await page.getByRole('button', { name: '次へ' }).click();
  expect(await page.evaluate(() => outcome)).toBe(true);
});

test('silent end, denial, nonmatching results and thrown starts offer retry', async ({ page }) => {
  await setup(page);
  await page.locator('.meal-voice-toggle').click();
  await emit(page, 'onend');
  await expect(page.getByText('もう一回、言ってみて', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'もう一度試す' }).click();
  await emit(page, 'onerror', { error: 'not-allowed' });
  await expect(page.getByText('ブラウザでマイクを許可してね')).toBeVisible();
  await page.locator('.meal-voice-toggle').click();
  await emit(page, 'onresult', { results: [[{ transcript: 'こんにちは' }]] });
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'error');
  await page.evaluate(() => window.failStart = true);
  await page.locator('.meal-voice-toggle').click();
  await expect(page.getByText('マイクが使えないみたい')).toBeVisible();
  await page.getByRole('button', { name: '写真だけで進む' }).click();
  expect(await page.evaluate(() => outcome)).toBe(false);
});

test('stop, timeout, photo fallback and dismissal release recognition and ignore stale events', async ({ page }) => {
  await setup(page);
  await page.clock.install();
  await page.locator('.meal-voice-toggle').click();
  await page.evaluate(() => window.lateResult = attempts[0].onresult);
  await page.getByRole('button', { name: '音声認識をやめる' }).click();
  await page.evaluate(() => lateResult({ results: [[{ transcript: 'いただきます' }]] }));
  await expect(page.getByText('いただきます、しよう')).toBeVisible();
  await page.locator('.meal-voice-toggle').click();
  await page.clock.runFor(15000);
  await expect(page.getByText('もう一回、言ってみて')).toBeVisible();
  await page.locator('.meal-voice-toggle').click();
  await page.getByRole('button', { name: '写真だけで進む' }).click();
  expect(await page.evaluate(() => attempts.every(s => s.aborted))).toBe(true);
  expect(await page.evaluate(() => outcome)).toBe(false);
  await setup(page);
  await page.locator('.meal-voice-toggle').click();
  await page.evaluate(() => controller.abort());
  expect(await page.evaluate(() => ({ outcome, stopped: attempts[0].aborted }))).toEqual({ outcome: 'AbortError', stopped: true });
});
