import { confirmMealVoice } from './meal-voice.js';
import { action, blobOf, check, openCamera } from './camera.js';
import { laundryRhythm, dryerSound } from './audio.js';
import { createPoseLandmarker, hasFullBody, poseSimilarity, presetScore, PRESET_PASS } from './pose.js';
import { createSegmenter, cutout } from './segment.js';
import { sfx } from './sfx.js';
export { poseSimilarity };

function choose(root, options, signal) {
  return new Promise((resolve, reject) => {
    const buttons = options.map(({ label, value, sub }) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ' + (sub ? 'btn-sub' : 'btn-main'); button.textContent = label;
      button.onclick = () => { buttons.forEach(b => b.remove()); signal.removeEventListener('abort', abort); resolve(value); };
      root.append(button); return button;
    });
    const abort = () => { buttons.forEach(b => b.remove()); reject(new DOMException('中止しました', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
  });
}
export function countdown(seconds, show, signal) {
  return new Promise((resolve, reject) => {
    let left = seconds; show(left);
    const abort = () => { clearInterval(timer); reject(new DOMException('中止しました', 'AbortError')); };
    const timer = setInterval(() => {
      left--; show(left);
      if (left <= 0) { clearInterval(timer); signal.removeEventListener('abort', abort); resolve(); }
    }, 1000);
    signal.addEventListener('abort', abort, { once: true });
  });
}
const TIMER_KEY = 'darupoyo-camera-timer', TIMER_CHOICES = [0, 3, 5, 10];
function timerPicker(root) {
  let current = 0;
  try { const saved = Number(localStorage.getItem(TIMER_KEY)); if (TIMER_CHOICES.includes(saved)) current = saved; } catch {}
  const row = document.createElement('div'); row.className = 'capture-timer'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'タイマー');
  const label = document.createElement('span'); label.textContent = 'タイマー'; row.append(label);
  const buttons = TIMER_CHOICES.map(sec => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = sec ? sec + '秒' : 'なし'; button.setAttribute('aria-pressed', String(sec === current));
    button.onclick = () => { current = sec; buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(TIMER_CHOICES[i] === sec))); try { localStorage.setItem(TIMER_KEY, String(sec)); } catch {} };
    row.append(button); return button;
  });
  root.append(row);
  return { seconds: () => current, remove: () => row.remove() };
}
// Shows how close the live camera pose is while the person gets ready.
function livePreview(video, landmarker, choice, reference, status, resources) {
  let frame, last = 0;
  const loop = now => {
    frame = requestAnimationFrame(loop);
    if (now - last < 150 || video.readyState < 2) return;
    last = now;
    const result = landmarker.detectForVideo(video, now), landmarks = result.landmarks[0];
    result.close();
    if (!hasFullBody(landmarks)) status.textContent = '全身が入るように、少し離れてね';
    else if (choice.preset) status.textContent = choice.title + ' ' + presetScore(choice.preset, landmarks) + '%';
    else if (choice.mode === 'original-copy' && reference?.landmarks) status.textContent = 'まねっこ度 ' + poseSimilarity(landmarks, reference.landmarks) + '%';
    else status.textContent = '全身OK。好きなポーズで撮ってね';
  };
  frame = requestAnimationFrame(loop);
  const stop = () => cancelAnimationFrame(frame);
  resources.push(stop);
  return stop;
}

export async function capture(root, chore, choice, reference, signal) {
  root.innerHTML = '<div class="capture"><h2 class="sheet-title" id="sheet-title"></h2><p class="capture-status" role="status" aria-live="polite"></p></div>';
  const box = root.firstChild, status = box.querySelector('p'); box.querySelector('h2').textContent = choice.title;
  const resources = [];
  const cleanup = () => { resources.splice(0).reverse().forEach(stop => { try { stop(); } catch {} }); };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    check(signal);
    if (chore === 'laundry') return await laundryRhythm(box, status, choice, signal, resources);
    if (chore === 'dryer') return await dryerSound(box, status, signal, resources);
    const live = document.createElement('div'); live.className = 'capture-live';
    const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true;
    const count = document.createElement('span'); count.className = 'capture-count'; count.setAttribute('aria-hidden', 'true'); count.hidden = true;
    live.append(video, count); box.append(live);
    const liveText = chore === 'meal' ? 'ごはんを撮影してください。写真だけで記録できます。' : '全身を枠に入れて撮影。背景は端末内で切り抜いてから送ります。';
    status.textContent = liveText;
    if (reference?.image && choice.mode === 'original-copy') { const img = document.createElement('img'); img.src = reference.image; img.alt = '今日のお手本'; img.style.maxHeight = '150px'; box.append(img); }
    const stream = await openCamera(video, chore === 'meal' ? 'environment' : 'user', resources, signal);
    let landmarker, segmenter, stopPreview = () => {};
    const canvas = document.createElement('canvas'); canvas.hidden = true; box.append(canvas);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const takePhoto = async () => {
      live.hidden = false; canvas.hidden = true; status.textContent = liveText;
      if (landmarker) {
        await landmarker.setOptions({ runningMode: 'VIDEO' }); check(signal);
        stopPreview = livePreview(video, landmarker, choice, reference, status, resources);
      }
      const picker = chore === 'meal' ? null : timerPicker(box);
      await action(box, 'この写真を撮る', signal); check(signal);
      stopPreview();
      const seconds = picker ? picker.seconds() : 0; picker?.remove();
      if (seconds) {
        await countdown(seconds, left => { count.hidden = !left; count.textContent = left; if (left) status.textContent = left + '秒後に撮るよ'; }, signal);
      }
      canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0); sfx.shutter();
      live.hidden = true; canvas.hidden = false;
    };
    const stopCamera = () => { stream.getTracks().forEach(t => t.stop()); live.remove(); };
    if (chore === 'meal') {
      for (;;) {
        await takePhoto();
        status.textContent = '撮れた写真を確認してね。';
        if (await choose(box, [{ label: 'この写真を使う', value: true }, { label: 'もう1回撮る', value: false, sub: true }], signal)) break;
      }
      stopCamera();
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      const evidence = { method: 'photo', blob: await blobOf(canvas, 'image/jpeg'), kind: 'meal' };
      if (!Speech) return evidence;
      status.hidden = true;
      if (await confirmMealVoice(box, Speech, signal)) {
        evidence.method = 'photo_voice';
        evidence.itadakimasu = true;
      }
      return evidence;
    }
    status.textContent = 'ポーズ判定を準備中…';
    landmarker = await createPoseLandmarker({ runningMode: 'VIDEO' });
    resources.push(() => landmarker.close()); check(signal);
    for (;;) {
      await takePhoto();
      status.textContent = 'ポーズと背景を端末内で処理しています…';
      await landmarker.setOptions({ runningMode: 'IMAGE' }); check(signal);
      const result = landmarker.detect(canvas);
      try {
        const landmarks = result.landmarks[0];
        if (!hasFullBody(landmarks)) {
          status.textContent = '全身を見つけられませんでした。明るい場所で少し離れて撮ってね';
          await choose(box, [{ label: 'もう1回撮る', value: false }], signal);
          continue;
        }
        const score = choice.preset ? presetScore(choice.preset, landmarks) : null;
        if (score !== null && score < PRESET_PASS) {
          status.textContent = choice.title + 'に見えなかったかも（' + score + '%）。もう一度撮ってね';
          await choose(box, [{ label: 'もう1回撮る', value: false }], signal);
          continue;
        }
        if (!segmenter) { segmenter = await createSegmenter(); resources.push(() => segmenter.close()); check(signal); }
        if (cutout(segmenter, canvas, ctx) < .02) {
          status.textContent = '人をうまく切り抜けませんでした。明るい場所で撮ってね';
          await choose(box, [{ label: 'もう1回撮る', value: false }], signal);
          continue;
        }
        status.textContent = '切り抜きを確認してください。背景が残る場合は撮り直してください。';
        if (!await choose(box, [{ label: 'この切り抜きを使う', value: true }, { label: 'もう1回撮る', value: false, sub: true }], signal)) continue;
        check(signal); stopCamera();
        const evidence = { method: 'pose', blob: await blobOf(canvas), kind: 'cutout', landmarks: landmarks.map(({ x,y,z,visibility }) => ({ x,y,z,visibility })), pose_name: choice.title, result: { score } };
        if (choice.mode === 'original-copy' && reference) { evidence.reference_post_id = reference.post_id; evidence.similarity = poseSimilarity(landmarks, reference.landmarks); }
        return evidence;
      } finally { result.close(); }
    }
  } finally { cleanup(); signal.removeEventListener('abort', cleanup); }
}
