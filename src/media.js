import { confirmMealVoice } from './meal-voice.js';

export function poseSimilarity(a, b) {
  const normalize = points => {
    const center = { x: (points[23].x + points[24].x) / 2, y: (points[23].y + points[24].y) / 2 };
    const scale = Math.hypot((points[11].x + points[12].x) / 2 - center.x, (points[11].y + points[12].y) / 2 - center.y) || .1;
    return points.map(p => ({ x: (p.x - center.x) / scale, y: (p.y - center.y) / scale }));
  };
  const x = normalize(a), y = normalize(b), ids = [11,12,13,14,15,16,23,24,25,26,27,28];
  return Math.round(100 * Math.max(0, 1 - ids.reduce((sum, i) => sum + Math.hypot(x[i].x-y[i].x, x[i].y-y[i].y),0) / ids.length / 2));
}
const blobOf = (canvas, type = 'image/png') => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('写真を作れませんでした')), type, .88));
const check = signal => { if (signal.aborted) throw new DOMException('中止しました', 'AbortError'); };
function action(root, text, signal) {
  return new Promise((resolve, reject) => {
    const button = document.createElement('button'); button.className = 'btn btn-main'; button.textContent = text; root.append(button);
    const abort = () => { button.remove(); reject(new DOMException('中止しました', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    button.onclick = () => { button.remove(); signal.removeEventListener('abort', abort); resolve(); };
  });
}
export async function capture(root, chore, choice, reference, signal) {
  root.innerHTML = '<div class="capture"><h2 class="sheet-title" id="sheet-title"></h2><p class="capture-status" role="status" aria-live="polite"></p></div>';
  const box = root.firstChild, status = box.querySelector('p'); box.querySelector('h2').textContent = choice.title;
  const resources = [];
  const cleanup = () => { resources.splice(0).reverse().forEach(stop => { try { stop(); } catch {} }); };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    check(signal);
    if (chore === 'laundry') {
      const mic = choice.mode === 'mic';
      status.textContent = mic ? '丸が光ったら洗濯物をバサッとはたいて8拍。音量の立ち上がりを拾います（洗濯音の種類を判別するものではありません）。音声は送信しません。' : 'タップモード：洗濯物をはたくリズムで、丸が光ったらタップ。8拍遊ぼう（音や動きの自動判定ではありません）。';
      let analyser, samples;
      if (mic) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false }, video:false }); resources.push(()=>stream.getTracks().forEach(t=>t.stop())); check(signal);
        const context = new AudioContext(); resources.push(()=>{ void context.close(); }); await context.resume();
        analyser = context.createAnalyser(); analyser.fftSize = 1024; context.createMediaStreamSource(stream).connect(analyser); samples = new Float32Array(analyser.fftSize);
      }
      await action(box, 'リズムをはじめる', signal); check(signal);
      const tap = document.createElement('button'); tap.className = 'btn capture-beat'; tap.textContent = '♪'; box.append(tap);
      let beat = -1, hit = new Set(), lastBeat = 0;
      const onHit = () => { if (beat >= 0 && beat < 8 && performance.now() - lastBeat < 400) { hit.add(beat); status.textContent = hit.size + ' / 8 ヒット'; } };
      if (!mic) tap.onclick = onHit;
      else {
        tap.disabled = true; let prior = 0, lastHit = 0;
        const sampleTimer = setInterval(()=>{ analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length); if (rms > .04 && rms > prior*1.5 && performance.now()-lastHit > 400) { onHit(); lastHit = performance.now(); } prior = rms; },40);
        resources.push(()=>clearInterval(sampleTimer));
      }
      const start = performance.now();
      await new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException('中止しました', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        const tick = setInterval(() => {
          beat++; lastBeat = performance.now();
          if (beat === 8) { clearInterval(tick); signal.removeEventListener('abort', abort); resolve(); return; }
          tap.textContent = (beat + 1) + ' ♪'; tap.classList.add('on');
          setTimeout(() => tap.classList.remove('on'), 220);
        }, 800); resources.push(() => clearInterval(tick));
      });
      if (!hit.size) throw new Error('まだヒットがありません。丸が光ったらタップしてみてね');
      return { method: 'rhythm', hits: hit.size, total_beats: 8, duration_seconds: (performance.now()-start)/1000 };
    }
    if (chore === 'dryer') {
      status.textContent = '音の判定モデルを準備中。音声は端末で処理し、アップロードしません。';
      const [{ FilesetResolver }, { AudioClassifier }] = await Promise.all([import('@mediapipe/tasks-vision'), import('@mediapipe/tasks-audio')]);
      const classifier = await AudioClassifier.createFromOptions(await FilesetResolver.forAudioTasks('/models/audio'), { baseOptions: { modelAssetPath: '/models/yamnet.tflite' }, runningMode: 'AUDIO_CLIPS', maxResults: 5 });
      resources.push(() => classifier.close()); check(signal);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false });
      resources.push(() => stream.getTracks().forEach(t => t.stop())); check(signal);
      const context = new AudioContext({ sampleRate: 16000 }); resources.push(() => { void context.close(); }); await context.resume();
      await context.audioWorklet.addModule('/pcm-worklet.js'); check(signal);
      const source = context.createMediaStreamSource(stream), worklet = new AudioWorkletNode(context, 'pcm');
      const mute = context.createGain(); mute.gain.value = 0; source.connect(worklet).connect(mute).connect(context.destination);
      resources.push(() => { source.disconnect(); worklet.disconnect(); });
      const progress = document.createElement('progress'); progress.max = 10; progress.value = 0; box.append(progress);
      status.textContent = 'ドライヤーの音を聞いています。検出した時間が10秒でクリア。';
      let detected = 0;
      await new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException('中止しました', 'AbortError')); signal.addEventListener('abort', abort, { once: true });
        resources.push(() => signal.removeEventListener('abort', abort));
        const timeout = setTimeout(() => reject(new Error('音を十分に検出できませんでした。マイクの位置を変えて試してください')), 120000); resources.push(() => clearTimeout(timeout));
        worklet.port.onmessage = ({ data }) => {
          try {
            const result = classifier.classify(data, context.sampleRate);
            const categories = result.flatMap(r => r.classifications.flatMap(c => c.categories));
            if (categories.some(c => /hair dryer/i.test(c.categoryName) && c.score >= .2)) detected += data.length / context.sampleRate;
            progress.value = detected; status.textContent = 'ドライヤーの音：' + Math.min(10, detected).toFixed(1) + ' / 10 秒';
            if (detected >= 10) resolve();
          } catch (e) { reject(e); }
        };
      });
      return { method: 'sound', duration_seconds: detected };
    }
    const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; box.append(video);
    status.textContent = chore === 'meal' ? 'ごはんを撮影してください。写真だけで記録できます。' : '全身を枠に入れて撮影。背景は端末内で切り抜いてから送ります。';
    if (reference?.image && choice.mode === 'original-copy') { const img = document.createElement('img'); img.src = reference.image; img.alt = '今日のお手本'; img.style.maxHeight = '150px'; box.append(img); }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: chore === 'meal' ? 'environment' : 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
    resources.push(() => stream.getTracks().forEach(t => t.stop())); check(signal); video.srcObject = stream; await video.play();
    await action(box, 'この写真を撮る', signal); check(signal);
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0);
    stream.getTracks().forEach(t => t.stop()); video.remove(); box.append(canvas);
    if (chore === 'meal') {
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
    status.textContent = 'ポーズと背景を端末内で処理しています…';
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const landmarker = await PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/models/vision'), { baseOptions: { modelAssetPath: '/models/pose.task' }, runningMode: 'IMAGE', outputSegmentationMasks: true });
    resources.push(() => landmarker.close()); check(signal);
    const result = landmarker.detect(canvas); resources.push(() => result.close());
    const landmarks = result.landmarks[0], mask = result.segmentationMasks?.[0];
    if (!landmarks || !mask || [11,12,23,24,27,28].some(i => landmarks[i].visibility < .5)) throw new Error('全身を見つけられませんでした。明るい場所で少し離れて撮ってね');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), values = mask.getAsFloat32Array();
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const confidence = values[Math.floor(y * mask.height / canvas.height) * mask.width + Math.floor(x * mask.width / canvas.width)];
      const offset = (y * canvas.width + x) * 4;
      if (confidence < .8) { pixels.data[offset] = pixels.data[offset+1] = pixels.data[offset+2] = pixels.data[offset+3] = 0; }
    }
    ctx.putImageData(pixels, 0, 0); status.textContent = '切り抜きを確認してください。背景が残る場合は撮り直してください。';
    await action(box, 'この切り抜きを使う', signal); check(signal);
    const evidence = { method: 'pose', blob: await blobOf(canvas), kind: 'cutout', landmarks: landmarks.map(({ x,y,z,visibility }) => ({ x,y,z,visibility })), pose_name: choice.title };
    if (choice.mode === 'original-copy' && reference) { evidence.reference_post_id = reference.post_id; evidence.similarity = poseSimilarity(landmarks, reference.landmarks); }
    return evidence;
  } finally { cleanup(); signal.removeEventListener('abort', cleanup); }
}
