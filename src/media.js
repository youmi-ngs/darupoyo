// Runs one chore check inside the sheet and returns the evidence for the completion API.
import { action, blobOf, check, onAbort, openCamera, snapshot } from './camera.js';
import { laundryRhythm, dryerSound } from './audio.js';
import { createPoseLandmarker, hasFullBody, poseSimilarity, presetScore, PRESET_PASS } from './pose.js';
import { createSegmenter, cutout } from './segment.js';
export { poseSimilarity };

async function mealVoice(box, status, evidence, signal, resources) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return evidence;
  status.textContent = '写真だけでもOK。「いただきます」を使う場合はブラウザの音声認識サービスに音声が送られる場合があります。';
  await new Promise((resolve, reject) => {
    const voice = document.createElement('button'); voice.className = 'btn btn-sub'; voice.textContent = '「いただきます」を言う'; box.append(voice);
    const skip = document.createElement('button'); skip.className = 'btn btn-main'; skip.textContent = '写真だけで進む'; box.append(skip); skip.onclick = resolve;
    resources.push(onAbort(signal, reject));
    voice.onclick = () => {
      voice.disabled = true; const speech = new Speech(); speech.lang = 'ja-JP'; speech.continuous = false; resources.push(() => speech.abort());
      speech.onresult = e => { if (Array.from(e.results).some(r => r[0].transcript.replace(/\s/g, '').includes('いただきます'))) { evidence.method = 'photo_voice'; evidence.itadakimasu = true; resolve(); } else status.textContent = '聞き取れませんでした。もう一度か、写真だけで進めます。'; };
      speech.onerror = () => { status.textContent = '音声認識を利用できません。写真だけでも記録できます。'; voice.disabled = false; };
      speech.onend = () => { voice.disabled = false; }; speech.start();
    };
  });
  return evidence;
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

async function poseCutout(box, status, canvas, ctx, landmarker, choice, reference, signal, resources) {
  status.textContent = 'ポーズと背景を端末内で処理しています…';
  const [segmenter] = await Promise.all([createSegmenter(), landmarker.setOptions({ runningMode: 'IMAGE' })]);
  resources.push(() => segmenter.close()); check(signal);
  const result = landmarker.detect(canvas);
  try {
    const landmarks = result.landmarks[0];
    if (!hasFullBody(landmarks)) throw new Error('全身を見つけられませんでした。明るい場所で少し離れて撮ってね');
    const score = choice.preset ? presetScore(choice.preset, landmarks) : null;
    if (score !== null && score < PRESET_PASS) throw new Error(choice.title + 'に見えなかったかも（' + score + '%）。もう一度撮ってね');
    if (cutout(segmenter, canvas, ctx) < .02) throw new Error('人をうまく切り抜けませんでした。明るい場所で撮ってね');
    status.textContent = '切り抜きを確認してください。背景が残る場合は撮り直してください。';
    await action(box, 'この切り抜きを使う', signal); check(signal);
    const evidence = { method: 'pose', blob: await blobOf(canvas), kind: 'cutout', landmarks: landmarks.map(({ x, y, z, visibility }) => ({ x, y, z, visibility })), pose_name: choice.title };
    if (choice.mode === 'original-copy' && reference) { evidence.reference_post_id = reference.post_id; evidence.similarity = poseSimilarity(landmarks, reference.landmarks); }
    return evidence;
  } finally { result.close(); }
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
    const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; box.append(video);
    status.textContent = chore === 'meal' ? 'ごはんを撮影してください。写真だけで記録できます。' : '全身を枠に入れて撮影。背景は端末内で切り抜いてから送ります。';
    if (reference?.image && choice.mode === 'original-copy') { const img = document.createElement('img'); img.src = reference.image; img.alt = '今日のお手本'; img.style.maxHeight = '150px'; box.append(img); }
    const stream = await openCamera(video, chore === 'meal' ? 'environment' : 'user', resources, signal);
    let landmarker, stopPreview = () => {};
    if (chore !== 'meal') {
      landmarker = await createPoseLandmarker({ runningMode: 'VIDEO' });
      resources.push(() => landmarker.close()); check(signal);
      stopPreview = livePreview(video, landmarker, choice, reference, status, resources);
    }
    await action(box, 'この写真を撮る', signal); check(signal);
    stopPreview();
    const { canvas, ctx } = snapshot(video);
    stream.getTracks().forEach(t => t.stop()); video.remove(); box.append(canvas);
    if (chore === 'meal') return await mealVoice(box, status, { method: 'photo', blob: await blobOf(canvas, 'image/jpeg'), kind: 'meal' }, signal, resources);
    return await poseCutout(box, status, canvas, ctx, landmarker, choice, reference, signal, resources);
  } finally { cleanup(); signal.removeEventListener('abort', cleanup); }
}
