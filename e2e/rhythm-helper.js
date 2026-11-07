// Plays the laundry rhythm in tests: the camera cannot see a real slap here, so the dev-only
// "test-slap" event stands in for one at each beat. Times are driven by Playwright's fake clock.
export const BEAT_MS = 800, TOTAL_BEATS = 8, OK_MS = 320, COUNTDOWN_MS = 3000;

// The still test camera shows no person, so the dev-only "test-upper-body" event stands in for
// the upper-body check that unlocks the start button (#106).
export async function unlockStart(page) {
  const start = page.getByRole('button', { name: 'リズムをはじめる' });
  await start.waitFor({ timeout: 20000 });
  await page.locator('.capture').dispatchEvent('test-upper-body');
  await start.click({ trial: true });
  return start;
}

export async function playRhythm(page, hits) {
  const start = await unlockStart(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await start.click();
  await page.clock.runFor(COUNTDOWN_MS); // 3・2・1 (#107)
  for (let k = 0; k < TOTAL_BEATS; k++) {
    await page.clock.runFor(BEAT_MS);
    if (k < hits) await page.locator('.capture').dispatchEvent('test-slap');
  }
  await page.clock.runFor(BEAT_MS + OK_MS);
  await page.clock.resume();
}

// Chromium's fake camera is animated, which the motion check would count as slaps.
// A still frame keeps hit counts exact; only "test-slap" makes hits.
export async function stillCamera(context) {
  await context.addInitScript(() => {
    const real = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!real) return;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!constraints?.video) return real(constraints);
      const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 640;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c9b6f2'; ctx.fillRect(0, 0, 480, 640);
      const stream = canvas.captureStream(5);
      // Keep frames flowing (same picture) so the video element plays.
      const timer = setInterval(() => { ctx.fillRect(0, 0, 1, 1); }, 200);
      stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer));
      return stream;
    };
  });
}
