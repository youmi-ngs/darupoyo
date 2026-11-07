// 効果音とギャルの「声っぽい」音（#8 #17）。音源ファイルは使わず、その場で Web Audio で作る。
// 設定でオフにできる（この端末だけ）。
const KEY = 'darupoyo-sound';
let ctx = null;

export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setSound(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* 保存できなくても鳴らし分けはできる */ }
}

function audio() {
  if (!soundOn()) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx || ctx.state === 'closed') ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
// iPhone は、タップの中で一度鳴らす準備をしないと音が出ない。
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { if (ctx?.state === 'suspended') void ctx.resume(); else if (!ctx) audio(); }, { capture: true });
}

function tone(c, { type = 'sine', freq, to, at = 0, dur = .12, vol = .1 }) {
  const t = c.currentTime + at, osc = c.createOscillator(), gain = c.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + .01);
  gain.gain.exponentialRampToValueAtTime(.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t); osc.stop(t + dur + .02);
}

export const sfx = {
  // マグネットを貼る「ポコッ」
  pop() { const c = audio(); if (!c) return; tone(c, { type: 'sine', freq: 520, to: 880, dur: .09, vol: .14 }); },
  // マグネットを外す「ポッ」（下がる音）
  unpop() { const c = audio(); if (!c) return; tone(c, { type: 'sine', freq: 700, to: 380, dur: .09, vol: .1 }); },
  // 写真を撮った「カシャ」
  shutter() {
    const c = audio(); if (!c) return;
    const t = c.currentTime, len = Math.floor(c.sampleRate * .08), buffer = c.createBuffer(1, len, c.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const noise = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    noise.buffer = buffer; filter.type = 'highpass'; filter.frequency.value = 1800; gain.gain.value = .25;
    noise.connect(filter).connect(gain).connect(c.destination); noise.start(t);
    tone(c, { type: 'square', freq: 1600, at: .04, dur: .03, vol: .04 });
  },
  // 記録できた「テレレレッ↑」
  clear() {
    const c = audio(); if (!c) return;
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(c, { type: 'triangle', freq: f, at: i * .08, dur: i === 3 ? .4 : .12, vol: .12 }));
    [1318.5, 1568, 2093].forEach((f, i) => tone(c, { type: 'sine', freq: f, at: .34 + i * .05, dur: .2, vol: .05 }));
  },
  // おしい「ぽわわ〜ん」
  miss() {
    const c = audio(); if (!c) return;
    [440, 415.3, 392].forEach((f, i) => tone(c, { type: 'triangle', freq: f, to: i === 2 ? 330 : undefined, at: i * .16, dur: i === 2 ? .45 : .15, vol: .1 }));
  },
  // アプリを開いているときに届いた通知「ピコン」
  ding() { const c = audio(); if (!c) return; tone(c, { type: 'sine', freq: 1318.5, dur: .1, vol: .1 }); tone(c, { type: 'sine', freq: 1760, at: .09, dur: .25, vol: .1 }); },
};

// ギャルごとの声の高さ・音色・しゃべる速さ。
export const VOICES = {
  heisei: { base: 330, type: 'square', step: .062, spread: .35, formant: 1500, vol: .05 },   // 高めでハイテンション、はずむ
  reiwa: { base: 270, type: 'triangle', step: .078, spread: .18, formant: 1100, vol: .1 },  // ゆるめでなめらか
  kuro: { base: 190, type: 'sawtooth', step: .07, spread: .28, formant: 850, vol: .05 },    // 低めでパンチ
  hime: { base: 430, type: 'sine', step: .088, spread: .14, formant: 1900, vol: .12, vibrato: 7 }, // 高くて甘い
};
// 文字の音の高さ（同じ文字はいつも同じ高さ）。ペンタトニックで、どう並んでもかわいく聞こえる。
const SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];
const SPOKEN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}A-Za-z0-9ー]/u;

// どうぶつの森みたいに、セリフの文字ごとに「ポポポ」としゃべる音。最大24音。
export function galVoice(gal, text) {
  const c = audio(); const v = VOICES[gal];
  if (!c || !v || !text) return 0;
  const chars = [...text].filter((ch) => SPOKEN.test(ch)).slice(0, 24);
  const excited = /[!！↑]\s*$/.test(text) || /[!！]/.test(text.slice(-4)), sweet = /♡|💕|💖/.test(text);
  const out = c.createGain(); out.gain.value = 1; out.connect(c.destination);
  const start = c.currentTime + .02;
  chars.forEach((ch, i) => {
    const t = start + i * v.step, last = i === chars.length - 1;
    const note = SCALE[ch.codePointAt(0) % SCALE.length] * (1 + (Math.random() - .5) * v.spread * .3);
    const freq = v.base * note * (ch === 'ー' ? .94 : 1);
    const osc = c.createOscillator(), filter = c.createBiquadFilter(), gain = c.createGain();
    osc.type = v.type; osc.frequency.setValueAtTime(freq, t);
    // 最後の音：テンション高いと上がる、ふつうは少し下がる
    const dur = last ? .2 : v.step * .8;
    if (last) osc.frequency.exponentialRampToValueAtTime(freq * (excited ? 1.5 : .85), t + dur);
    if (v.vibrato || (last && sweet)) {
      const lfo = c.createOscillator(), depth = c.createGain();
      lfo.frequency.value = v.vibrato || 7; depth.gain.value = freq * .03;
      lfo.connect(depth).connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + .02);
    }
    // 母音っぽく聞こえるように、文字ごとに響く帯域を少し動かす
    filter.type = 'bandpass'; filter.Q.value = 2.5; filter.frequency.value = v.formant * (.75 + (ch.codePointAt(0) % 5) * .12);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(v.vol * 2.2, t + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, t + dur);
    osc.connect(filter).connect(gain).connect(out);
    osc.start(t); osc.stop(t + dur + .02);
  });
  return chars.length;
}

// ベランダの鳥の「ピピッ」
export function chirp() {
  const c = audio(); if (!c) return;
  tone(c, { type: 'sine', freq: 2400, to: 3200, dur: .06, vol: .07 });
  tone(c, { type: 'sine', freq: 2600, to: 3600, at: .09, dur: .07, vol: .07 });
}
// ゴミバコの黒猫の「ニャ〜」
export function meow() {
  const c = audio(); if (!c) return;
  tone(c, { type: 'triangle', freq: 520, to: 900, dur: .16, vol: .11 });
  tone(c, { type: 'triangle', freq: 900, to: 430, at: .16, dur: .36, vol: .09 });
}
