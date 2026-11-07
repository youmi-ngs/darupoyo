import { test, expect } from '@playwright/test';
async function setup(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    const box = document.createElement('div'); box.className = 'capture'; document.body.replaceChildren(box);
    window.controller = new AbortController(); window.outcome = 'pending'; window.audioBytes = 0;
    const nativeStart = MediaRecorder.prototype.start;
    MediaRecorder.prototype.start = function(...args) { this.addEventListener('dataavailable', e => window.audioBytes += e.data.size); return nativeStart.apply(this, args); };
    window.SpeechRecognition = class { constructor() { throw new Error('must not start speech recognition'); } };
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async c => { window.testMic = await real(c); return testMic; };
    const { recordMealVoice } = await import('/src/meal-voice.js');
    // #120: stands in for the server check; tests set window.heard to what Gemini "hears".
    window.heard = [true]; window.checked = 0;
    const verify = async () => { window.checked++; const heard = window.heard.shift(); if (heard instanceof Error) throw heard; return { heard, id: 'voice-' + window.checked }; };
    recordMealVoice(box, 'いただきます', controller.signal, verify).then(v => { window.voiceSize = v.voice?.size || 0; window.voiceId = v.voiceMediaId; window.outcome = v.matched; }, e => window.outcome = e.name);
  });
}
test('records on iPhone without competing recognition, previews, and saves only on confirmation', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'userAgent', { value: 'iPhone Safari', configurable: true }));
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'recording');
  await expect.poll(() => page.evaluate(() => audioBytes)).toBeGreaterThan(200);
  await page.getByRole('button', { name: '録音を止める' }).click();
  await expect(page.locator('audio')).toBeVisible();
  expect(await page.evaluate(() => outcome)).toBe('pending');
  expect(await page.evaluate(() => testMic.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: 'この音声を使う' }).click();
  await expect.poll(() => page.evaluate(() => outcome)).toBe(true);
  expect(await page.evaluate(() => voiceSize)).toBeGreaterThan(0);
});
test('denial offers retry or photo fallback, without saving a recording', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('button', { name: 'もう一度録音する' })).toBeEnabled();
  await page.getByRole('button', { name: '写真だけで進む' }).click();
  await expect.poll(() => page.evaluate(() => outcome)).toBe(false);
});
test('closing a pending permission prompt releases a late stream', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.grantMic = resolve; }); });
  await page.locator('.meal-voice-toggle').click();
  await page.evaluate(() => controller.abort());
  await expect.poll(() => page.evaluate(() => outcome)).toBe('AbortError');
  await page.evaluate(() => { window.released = false; grantMic({getTracks: () => [{stop: () => window.released = true}]}); });
  await expect.poll(() => page.evaluate(() => released)).toBe(true);
});
test('ten second limit stops recording and retake discards the old preview', async ({ page }) => {
  await setup(page); await page.clock.install();
  await page.locator('.meal-voice-toggle').click();
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'recording');
  await expect.poll(() => page.evaluate(() => audioBytes)).toBeGreaterThan(200);
  await page.clock.runFor(10000);
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'review');
  await page.getByRole('button', { name: '録音し直す' }).click();
  await expect(page.locator('audio')).toBeHidden();
  await page.evaluate(() => controller.abort());
  await expect.poll(() => page.evaluate(() => outcome)).toBe('AbortError');
  expect(await page.evaluate(() => testMic.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});

test('a recording without 「いただきます」 is not used: record again, then it counts (#120)', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.heard = [false, true]; });
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect.poll(() => page.evaluate(() => audioBytes)).toBeGreaterThan(200);
  await page.getByRole('button', { name: '録音を止める' }).click();
  await page.getByRole('button', { name: 'この音声を使う' }).click();
  await expect(page.locator('.meal-voice [role=status]')).toHaveText('「いただきます」が聞き取れなかったよ。もう一度録音してね');
  expect(await page.evaluate(() => outcome)).toBe('pending');
  await page.getByRole('button', { name: '録音し直す' }).click();
  await expect.poll(() => page.evaluate(() => audioBytes)).toBeGreaterThan(400);
  await page.getByRole('button', { name: '録音を止める' }).click();
  await page.getByRole('button', { name: 'この音声を使う' }).click();
  await expect.poll(() => page.evaluate(() => outcome)).toBe(true);
  expect(await page.evaluate(() => [window.checked, window.voiceId])).toEqual([2, 'voice-2']);
});
