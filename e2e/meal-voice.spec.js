import { test, expect } from '@playwright/test';
// The fake microphone hums all the time, so tests set the loudness the page measures:
// window.testLevel (0 = quiet). say() is a voice for 0.6s, then quiet.
async function setup(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    const box = document.createElement('div'); box.className = 'capture'; document.body.replaceChildren(box);
    window.controller = new AbortController(); window.outcome = 'pending'; window.testLevel = 0;
    AnalyserNode.prototype.getFloatTimeDomainData = function(a) { a.fill(0); for (let i = 0; i < a.length; i += 2) a[i] = window.testLevel * Math.SQRT2; };
    window.SpeechRecognition = class { constructor() { throw new Error('must not start speech recognition'); } };
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async c => { window.testMic = await real(c); return testMic; };
    const { recordMealVoice } = await import('/src/meal-voice.js');
    // #120: stands in for the server check; tests set window.heard to what Gemini "hears".
    window.heard = [true]; window.checked = 0;
    const verify = async blob => { window.checked++; window.sentBytes = blob.size; const heard = window.heard.shift(); if (heard instanceof Error) throw heard; return { heard, id: 'voice-' + window.checked }; };
    recordMealVoice(box, 'いただきます', controller.signal, verify).then(v => { window.voiceSize = v.voice?.size || 0; window.voiceId = v.voiceMediaId; window.outcome = v.matched; }, e => window.outcome = e.name);
  });
}
const say = page => page.evaluate(() => new Promise(r => setTimeout(() => { window.testLevel = 0.2; setTimeout(() => { window.testLevel = 0; r(); }, 600); }, 400)));
const state = page => page.locator('.meal-voice');
const status = page => page.locator('.meal-voice [role=status]');

test('saying いただきます once is checked as soon as the voice stops: no stop or confirm button', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'listening');
  await expect(status(page)).toHaveText('「いただきます」と言ってね');
  await expect(page.getByRole('button', { name: /録音を止める|この音声を使う/ })).toHaveCount(0);
  const before = Date.now();
  await say(page);
  await expect(state(page)).toHaveAttribute('data-state', 'success');
  expect(Date.now() - before).toBeLessThan(3000); // about 0.7s after the voice ends, plus the check
  await expect(status(page)).toHaveText('「いただきます」聞こえた！');
  await expect.poll(() => page.evaluate(() => outcome)).toBe(true);
  expect(await page.evaluate(() => [checked, voiceId, voiceSize > 0, sentBytes > 0])).toEqual([1, 'voice-1', true, true]);
  expect(await page.evaluate(() => testMic.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});

test('when Gemini does not hear it, the mic listens again by itself (#120)', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.heard = [false, true]; });
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await say(page);
  await expect(status(page)).toHaveText('「いただきます」が聞き取れなかったよ。もう一回言ってね');
  await expect(state(page)).toHaveAttribute('data-state', 'listening');
  expect(await page.evaluate(() => outcome)).toBe('pending');
  await say(page);
  await expect.poll(() => page.evaluate(() => outcome)).toBe(true);
  expect(await page.evaluate(() => [checked, voiceId])).toEqual([2, 'voice-2']);
});

test('after three misses it stops and waits for a tap; the photo-only way stays open', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { window.heard = [false, false, false, true]; });
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  for (let i = 0; i < 3; i++) { await expect(state(page)).toHaveAttribute('data-state', 'listening'); await say(page); await expect.poll(() => page.evaluate(() => checked)).toBe(i + 1); }
  await expect(state(page)).toHaveAttribute('data-state', 'error');
  expect(await page.evaluate(() => testMic.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: 'もう一回言う' }).click();
  await say(page);
  await expect.poll(() => page.evaluate(() => outcome)).toBe(true);
});

test('ten quiet seconds stop the mic without sending anything', async ({ page }) => {
  await setup(page); await page.clock.install();
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'listening');
  await page.clock.runFor(10050);
  await expect(status(page)).toHaveText('声が聞こえなかったよ。もう一回言ってね');
  expect(await page.evaluate(() => checked)).toBe(0);
  expect(await page.evaluate(() => testMic.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
});

test('the mic can be turned off while listening', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'listening');
  await page.getByRole('button', { name: 'マイクをオフにする' }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'idle');
  expect(await page.evaluate(() => testMic.getTracks().every(t => t.readyState === 'ended'))).toBe(true);
  await say(page); expect(await page.evaluate(() => checked)).toBe(0);
});

test('denial offers retry or photo fallback, without saving a recording', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('button', { name: 'マイクをオンにする' })).toBeEnabled();
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

test('no spinning ring around the record button while the microphone starts (#131)', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(() => {}); }); // permission prompt stays open
  await page.getByRole('button', { name: 'マイクをオンにする' }).click();
  await expect(state(page)).toHaveAttribute('data-state', 'starting');
  expect(await page.locator('.meal-voice-toggle').evaluate(b => getComputedStyle(b, '::after').animationName)).toBe('none');
});
