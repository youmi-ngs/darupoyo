import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAudio} from '../src/audio-level.js';
test('microphone gain and DC offset do not change normalized waveform', () => {
  const signal = Float32Array.from({length:16000}, (_,i) => .05*Math.sin(i*.2));
  const a=normalizeAudio(signal), b=normalizeAudio(signal.map(x=>x*4+.1));
  assert.ok(a.samples.every((x,i)=>Math.abs(x-b.samples[i])<.000001));
  assert.ok(b.gain<a.gain); assert.ok(b.rms>a.rms);
});
test('silence stays silent and quiet noise is not amplified', () => {
  assert.ok(normalizeAudio(new Float32Array(100)).samples.every(x=>x===0));
  assert.equal(normalizeAudio(Float32Array.from([.001,-.001])).gain,1);
});
