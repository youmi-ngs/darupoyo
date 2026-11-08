import { confirmMealVoice } from './meal-voice.js';
import { blobOf, check, countdown, openCamera, photoCrop, timing } from './camera.js';
import { laundryRhythm, dryerSound } from './audio.js';
import { createPoseLandmarker, hasFullBody, poseSimilarity, presetScore, PRESET_PASS } from './pose.js';
import { createSegmenter, cutout } from './segment.js';
import { sfx } from './sfx.js';

// #120: upload a reviewed recording and ask the server whether 「いただきます」 is in it.
async function verifyItadakimasu(blob) {
  const { houseApi } = await import('./api.js'); // lazy, so this module also loads in unit tests
  const { id } = await houseApi('/media?kind=voice', blob);
  const { heard } = await houseApi('/media/' + id + '/itadakimasu', {});
  return { heard, id };
}
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
// #117: take the photo now, or choose one from the photo library. Resolves 'camera' or a File.
function shootOrPick(root, signal, canShoot) {
  return new Promise((resolve, reject) => {
    const row = document.createElement('div'); row.className = 'capture-actions';
    const done = value => { row.remove(); signal.removeEventListener('abort', abort); resolve(value); };
    const abort = () => { row.remove(); reject(new DOMException('中止しました', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    if (canShoot) { const shoot = document.createElement('button'); shoot.type = 'button'; shoot.className = 'btn btn-main'; shoot.textContent = 'この写真を撮る'; shoot.onclick = () => done('camera'); row.append(shoot); }
    const pick = document.createElement('label'); pick.className = 'btn ' + (canShoot ? 'btn-sub' : 'btn-main') + ' capture-library'; pick.textContent = 'ライブラリからえらぶ';
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    input.onchange = () => { if (input.files[0]) done(input.files[0]); };
    pick.append(input); row.append(pick); root.append(row);
  });
}
// Draws a chosen library photo (EXIF rotation applied by the browser). Photos are cut to the 5:6 frame.
async function drawPicked(file, canvas, ctx, crop5to6) {
  if (file.size > 25 * 1024 * 1024) throw new Error('25MB以下の写真を選んでね');
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url;
    try { await image.decode(); } catch { throw new Error('この写真は開けませんでした。JPEG・PNGなどの写真を選んでね'); }
    const w = image.naturalWidth, h = image.naturalHeight;
    if (crop5to6) {
      const crop = photoCrop(w, h);
      canvas.width = Math.max(5, Math.floor(Math.min(1000, crop.width) / 5) * 5); canvas.height = canvas.width * 6 / 5;
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    } else {
      const scale = Math.min(1, 1280 / Math.max(w, h));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }
  } finally { URL.revokeObjectURL(url); }
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
    // Without a camera (no permission, none on the device) the photo library still works (#117).
    let stream = null;
    try { stream = await openCamera(video, chore === 'meal' ? 'environment' : 'user', resources, signal); }
    catch (e) { if (e.name === 'AbortError' || signal.aborted) throw e; live.hidden = true; }
    let landmarker, segmenter, segmenterReady, stopPreview = () => {};
    const canvas = document.createElement('canvas'); canvas.hidden = true; canvas.classList.toggle('is-photo-frame', isPhoto); box.append(canvas);
    // Mirror the preview. Pose scoring keeps raw pixels/landmarks; a selfie is saved as the
    // person saw it in the preview (#161), so it does not come out flipped.
    let mirrored = false;
    const setMirror = () => {
      const facing = stream?.getVideoTracks()[0]?.getSettings().facingMode;
      mirrored = facing === 'user' || (chore !== 'meal' && facing !== 'environment');
      video.classList.toggle('is-mirrored', mirrored); canvas.classList.toggle('is-mirrored', mirrored && chore !== 'selfie');
    };
    setMirror();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const takePhoto = async () => {
      live.hidden = !stream; canvas.hidden = true;
      status.textContent = stream ? liveText : 'カメラを使えないので、ライブラリから写真をえらんでね';
      if (landmarker && stream) stopPreview = livePreview(video, landmarker, choice, reference, status, resources);
      const picker = (chore === 'meal' || chore === 'selfie' || !stream) ? null : timerPicker(box);
      let how = await shootOrPick(box, signal, !!stream); check(signal);
      // A photo that cannot be opened: say why and let them choose again.
      while (how !== 'camera') {
        try { status.textContent = '写真を読み込んでいます…'; await drawPicked(how, canvas, ctx, isPhoto); check(signal); break; }
        catch (e) { if (e.name === 'AbortError') throw e; status.textContent = e.message; how = await shootOrPick(box, signal, !!stream); check(signal); }
      }
      stopPreview();
      const seconds = picker ? picker.seconds() : 0; picker?.remove();
      if (how === 'camera') {
        if (seconds) {
          await countdown(seconds, left => { count.hidden = !left; count.textContent = left; if (left) status.textContent = left + '秒後に撮るよ'; }, signal);
        }
        if (isPhoto) {
          const crop = photoCrop(video.videoWidth, video.videoHeight);
          canvas.width = Math.floor(crop.width / 5) * 5; canvas.height = canvas.width * 6 / 5;
          const keepMirror = chore === 'selfie' && mirrored; // the saved selfie matches the preview (#161)
          if (keepMirror) ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
          ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else { canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0); }
        canvas.classList.toggle('is-mirrored', mirrored && chore !== 'selfie');
        sfx.shutter();
      } else canvas.classList.remove('is-mirrored'); // a library photo is shown as it is
      live.hidden = true; canvas.hidden = false;
    };
    const stopCamera = () => { stream?.getTracks().forEach(t => t.stop()); live.remove(); };
    if (chore === 'meal' || chore === 'selfie') {
      for (;;) {
        await takePhoto();
        status.textContent = '撮れた写真を確認してね。';
        if (await choose(box, [{ label: 'この写真を使う', value: true }, { label: stream ? 'もう1回撮る' : 'えらび直す', value: false, sub: true }], signal)) break;
      }
      stopCamera();
      if (chore === 'selfie') return { blob: await blobOf(canvas, 'image/jpeg'), kind: 'selfie' };
      const evidence = { method: 'photo', blob: await blobOf(canvas, 'image/jpeg'), kind: 'meal' };
      status.hidden = true;
      const heard = await confirmMealVoice(box, signal, verifyItadakimasu);
      if (heard.matched) {
        evidence.method = 'photo_voice';
        evidence.itadakimasu = true;
        evidence.voice = heard.voice; // for playback before saving
        evidence.voice_media_id = heard.voiceMediaId; // already uploaded and checked
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
