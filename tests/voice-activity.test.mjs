import test from 'node:test';
import assert from 'node:assert/strict';
import { utteranceDetector, rmsOf } from '../src/voice-activity.js';

// Runs a loudness timeline [[rms, ms], ...] in 50ms slices and returns the last answer and when it changed.
const run = (timeline, detect = utteranceDetector()) => {
  const seen = []; let t = 0;
  for (const [rms, ms] of timeline) for (let i = 0; i < ms; i += 50) { t += 50; const a = detect(rms, 50); if (seen.at(-1)?.[0] !== a) seen.push([a, t]); }
  return seen;
};

test('a voice followed by a short quiet is done about 0.7 seconds after it ends', () => {
  const seen = run([[0.005, 500], [0.2, 900], [0.005, 1000]]);
  assert.deepEqual(seen.map(s => s[0]), ['waiting', 'speaking', 'done']);
  assert.equal(seen.at(-1)[1], 500 + 900 + 700);
});

test('silence and a single click never count as speech', () => {
  assert.deepEqual(run([[0.005, 3000]]).map(s => s[0]), ['waiting']);
  assert.deepEqual(run([[0.005, 500], [0.3, 100], [0.005, 2000]]).map(s => s[0]), ['waiting']);
});

test('a short pause inside the phrase does not end it', () => {
  const seen = run([[0.005, 400], [0.2, 400], [0.005, 400], [0.2, 400], [0.005, 800]]);
  assert.deepEqual(seen.map(s => s[0]), ['waiting', 'speaking', 'done']);
  assert.equal(seen.at(-1)[1], 400 + 400 + 400 + 400 + 700);
});

test('a noisy room raises the bar, so its hum is not a voice but talking over it is', () => {
  assert.deepEqual(run([[0.03, 3000]]).map(s => s[0]), ['waiting']);
  assert.deepEqual(run([[0.03, 400], [0.25, 600], [0.03, 800]]).map(s => s[0]), ['waiting', 'speaking', 'done']);
});

test('rmsOf measures loudness', () => {
  assert.equal(rmsOf([0, 0, 0, 0]), 0);
  assert.ok(Math.abs(rmsOf([0.5, -0.5, 0.5, -0.5]) - 0.5) < 1e-9);
});
