import { confirmMealVoice } from './meal-voice.js';
import { action, blobOf, check, countdown, openCamera, photoCrop, timing } from './camera.js';
import { laundryRhythm, dryerSound } from './audio.js';
import { createPoseLandmarker, hasFullBody, poseSimilarity, presetScore, PRESET_PASS } from './pose.js';
import { createSegmenter, cutout } from './segment.js';
import { sfx } from './sfx.js';
export { poseSimilarity, countdown };

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
// VIDEO-mode detection needs strictly increasing timestamps, for preview frames and taken photos alike.
let lastVideoTime = 0;
const videoTime = () => (lastVideoTime = Math.max(lastVideoTime + 1, performance.now()));
// Shows how close the live camera pose is while the person gets ready.
function livePreview(video, landmarker, choice, reference, status, resources) {
  let frame, last = 0;
  const loop = now => {
    frame = requestAnimationFrame(loop);
    if (now - last < 150 || video.readyState < 2) return;
    last = now;
    const result = landmarker.detectForVideo(video, videoTime()), landmarks = result.landmarks[0];
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
  let finished = false; // models that finish loading after capture ended are closed right away
  const cleanup = () => { resources.splice(0).reverse().forEach(stop => { try { stop(); } catch {} }); };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    check(signal);
    if (chore === 'laundry') return await laundryRhythm(box, status, choice, signal, resources);
    if (chore === 'dryer') return await dryerSound(box, status, signal, resources);
    const isPhoto = chore === 'meal' || chore === 'selfie';
    const live = document.createElement('div'); live.className = 'capture-live' + (isPhoto ? ' is-photo-frame' : '');
    const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true;
    const count = document.createElement('span'); count.className = 'capture-count'; count.setAttribute('aria-hidden', 'true'); count.hidden = true;
    live.append(video, count); box.append(live);
    const liveText = chore === 'selfie' ? '今のじぶんを、ハウスのみんなに。' : chore === 'meal' ? 'ごはんを撮影してください。写真だけで記録できます。' : '全身を枠に入れて撮影。背景は端末内で切り抜いてから送ります。';
    status.textContent = liveText;
    if (reference?.image && choice.mode === 'original-copy') { const img = document.createElement('img'); img.src = reference.image; img.alt = '今日のお手本'; img.style.maxHeight = '150px'; box.append(img); }
    // #98: ポーズ判定のモデル読み込みを、カメラの許可・起動と同時に始める（以前はカメラ起動後に順番に待っていた）。
    const modelAt = performance.now();
    const landmarkerReady = isPhoto ? null : createPoseLandmarker({ runningMode: 'VIDEO' }).then(model => {
      timing('pose-load', modelAt);
      if (signal.aborted || finished) model.close(); else resources.push(() => model.close());
      return model;
    });
    landmarkerReady?.catch(() => {}); // the error is rethrown where it is awaited below
    const stream = await openCamera(video, chore === 'meal' ? 'environment' : 'user', resources, signal);
    let landmarker, segmenter, segmenterReady, stopPreview = () => {};
    const canvas = document.createElement('canvas'); canvas.hidden = true; canvas.classList.toggle('is-photo-frame', isPhoto); box.append(canvas);
    // Mirror only the preview; retain raw pixels/landmarks for pose scoring and storage.
    const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
    const mirrored = facing === 'user' || (chore !== 'meal' && facing !== 'environment');
    video.classList.toggle('is-mirrored', mirrored); canvas.classList.toggle('is-mirrored', mirrored);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const takePhoto = async () => {
      live.hidden = false; canvas.hidden = true; status.textContent = liveText;
      if (landmarker) stopPreview = livePreview(video, landmarker, choice, reference, status, resources);
      const picker = (chore === 'meal' || chore === 'selfie') ? null : timerPicker(box);
      await action(box, 'この写真を撮る', signal); check(signal);
      stopPreview();
      const seconds = picker ? picker.seconds() : 0; picker?.remove();
      if (seconds) {
        await countdown(seconds, left => { count.hidden = !left; count.textContent = left; if (left) status.textContent = left + '秒後に撮るよ'; }, signal);
      }
      if (isPhoto) {
        const crop = photoCrop(video.videoWidth, video.videoHeight);
        canvas.width = Math.floor(crop.width / 5) * 5; canvas.height = canvas.width * 6 / 5;
        ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      } else { canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0); }
      sfx.shutter();
      live.hidden = true; canvas.hidden = false;
    };
    const stopCamera = () => { stream.getTracks().forEach(t => t.stop()); live.remove(); };
    if (chore === 'meal' || chore === 'selfie') {
      for (;;) {
        await takePhoto();
        status.textContent = '撮れた写真を確認してね。';
        if (await choose(box, [{ label: 'この写真を使う', value: true }, { label: 'もう1回撮る', value: false, sub: true }], signal)) break;
      }
      stopCamera();
      if (chore === 'selfie') return { blob: await blobOf(canvas, 'image/jpeg'), kind: 'selfie' };
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      const evidence = { method: 'photo', blob: await blobOf(canvas, 'image/jpeg'), kind: 'meal' };
      status.hidden = true;
      const heard = await confirmMealVoice(box, Speech, signal);
      if (heard.matched) {
        evidence.method = 'photo_voice';
        evidence.itadakimasu = true;
        if (heard.voice) evidence.voice = heard.voice;
      }
      return evidence;
    }
    status.textContent = 'ポーズ判定を準備中…';
    landmarker = await landmarkerReady; check(signal);
    // #98: 切り抜きモデルも、撮影を待つあいだに裏で読み込んでおく（以前は1枚目の判定後に読み込み始めていた）。
    const segmentAt = performance.now();
    segmenterReady = createSegmenter().then(model => {
      timing('segmenter-load', segmentAt);
      if (signal.aborted || finished) model.close(); else resources.push(() => model.close());
      return model;
    });
    segmenterReady.catch(() => {});
    for (;;) {
      await takePhoto();
      status.textContent = 'ポーズと背景を端末内で処理しています…';
      const processAt = performance.now();
      // #98: 撮るたびに VIDEO⇔IMAGE を setOptions で切り替えると、そのたびにモデルの準備し直しが走る。
      // VIDEO のまま、撮った1枚（canvas）を新しい時刻で判定する。
      const result = landmarker.detectForVideo(canvas, videoTime());
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
        if (!segmenter) { segmenter = await segmenterReady; check(signal); }
        const kept = cutout(segmenter, canvas, ctx);
        timing('pose-and-cutout', processAt);
        if (kept < .02) {
          status.textContent = '人をうまく切り抜けませんでした。明るい場所で撮ってね';
          await choose(box, [{ label: 'もう1回撮る', value: false }], signal);
          continue;
        }
        status.textContent = '切り抜きを確認してください。背景が残る場合は撮り直してください。';
        if (!await choose(box, [{ label: 'この切り抜きを使う', value: true }, { label: 'もう1回撮る', value: false, sub: true }], signal)) continue;
        check(signal); stopCamera();
        const encodeAt = performance.now(), blob = await blobOf(canvas); timing('cutout-encode', encodeAt);
        const evidence = { method: 'pose', blob, kind: 'cutout', landmarks: landmarks.map(({ x,y,z,visibility }) => ({ x,y,z,visibility })), pose_name: choice.title, result: { score } };
        if (choice.mode === 'original-copy' && reference) { evidence.reference_post_id = reference.post_id; evidence.similarity = poseSimilarity(landmarks, reference.landmarks); }
        return evidence;
      } finally { result.close(); }
    }
  } finally { finished = true; cleanup(); signal.removeEventListener('abort', cleanup); }
}
