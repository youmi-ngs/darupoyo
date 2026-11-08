// Tells from microphone loudness when someone has said something and then stopped,
// so 「いただきます」 can be checked as soon as it is said, without a stop button.
// Feed it the loudness (RMS, 0..1) of each slice and the slice length in ms.
// It answers 'waiting' (no voice yet), 'speaking', or 'done' (voice, then quiet).
export function utteranceDetector({ calibrateMs = 300, minSpeechMs = 250, quietMs = 700 } = {}) {
  let time = 0, floor = 0, samples = 0, speech = 0, quiet = 0, started = false;
  return (rms, ms) => {
    time += ms;
    // The first moment sets how loud the room is, so a noisy room is not taken for a voice.
    if (time <= calibrateMs) { floor = (floor * samples + rms) / ++samples; return 'waiting'; }
    const loud = rms > Math.min(0.08, Math.max(0.02, floor * 3));
    if (loud) { speech += ms; quiet = 0; if (speech >= minSpeechMs) started = true; }
    else { quiet += ms; if (!started && quiet >= 400) speech = 0; } // a cough or a click is not a voice
    if (started && quiet >= quietMs) return 'done';
    return started ? 'speaking' : 'waiting';
  };
}

export const rmsOf = samples => Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
