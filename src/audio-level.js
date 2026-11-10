// Keep model input volume consistent across microphone gains; never amplify silence.
// The meter and audibility gate continue to use the original signal.
export function normalizeAudio(samples) {
  const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  const centered = Float32Array.from(samples, x => x - mean);
  const rms = Math.sqrt(centered.reduce((sum, x) => sum + x * x, 0) / centered.length);
  let peak = 0; for (const x of centered) peak = Math.max(peak, Math.abs(x));
  const gain = rms >= .005 ? Math.min(4, .05 / rms, .95 / Math.max(peak, .0001)) : 1;
  return { samples: centered.map(x => x * gain), rms, gain };
}
