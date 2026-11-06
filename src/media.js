import { BEAT_MS, TOTAL_BEATS, noteTime, judgeHit, detectMotion, isSlap } from './rhythm.js';
import { playSparkle, sparkle } from './sparkle.js';

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
      status.textContent = mic ? '洗濯物をはたく動きと音を、カメラとマイクで拾います。音符が丸に重なったらバサッ！映像と音声は端末の中だけで使い、保存も送信もしません。' : 'タップモード：音符が丸に重なったらタップ。8拍遊ぼう（音や動きの自動判定ではありません）。';
      let analyser, samples, context, video;
      if (mic) {
        const audio = { echoCancellation:false, noiseSuppression:false };
        let stream, hasCamera = true;
        // 許可の確認を1回で済ませる。カメラだけ使えないときはマイクだけで遊ぶ。
        try { stream = await navigator.mediaDevices.getUserMedia({ audio, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } } }); }
        catch { hasCamera = false; stream = await navigator.mediaDevices.getUserMedia({ audio, video:false }); }
        resources.push(()=>stream.getTracks().forEach(t=>t.stop())); check(signal);
        context = new AudioContext(); resources.push(()=>{ void context.close(); }); await context.resume();
        analyser = context.createAnalyser(); analyser.fftSize = 1024; context.createMediaStreamSource(stream).connect(analyser); samples = new Float32Array(analyser.fftSize);
        if (hasCamera) {
          video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
          const stage = document.createElement('div'); stage.className = 'rhythm-camera'; stage.append(video); box.append(stage); await video.play(); check(signal);
        } else status.textContent = 'カメラが使えないので、マイクの音だけで遊びます。音符が丸に重なったらバサッ！';
      }
      const lane = document.createElement('div'); lane.className = 'rhythm-lane'; lane.setAttribute('aria-hidden', 'true');
      lane.innerHTML = '<span class="rhythm-target"></span><span class="rhythm-grade"></span>';
      const notes = Array.from({ length: TOTAL_BEATS }, () => { const n = document.createElement('i'); n.className = 'rhythm-note'; lane.append(n); return n; });
      box.append(lane);
      const TARGET = 16, GAP = 24; // 判定の円の位置と音符の間隔（レーン幅に対する%）
      let start = null;
      const placeNotes = now => notes.forEach((n, k) => { n.style.left = (TARGET + (noteTime(k) - (now - start)) / BEAT_MS * GAP) + '%'; });
      start = performance.now(); placeNotes(start);
      await action(box, 'リズムをはじめる', signal); check(signal);
      context ||= new AudioContext(); if (!mic) resources.push(()=>{ void context.close(); }); void context.resume();
      const tap = document.createElement('button'); tap.className = 'btn capture-beat'; tap.textContent = '♪'; box.append(tap);
      const grade = lane.querySelector('.rhythm-grade');
      const hit = new Set();
      let lastSlap = -Infinity, gradeTimer;
      const slap = (x, y) => {
        const now = performance.now();
        if (now - lastSlap < 300) return;
        lastSlap = now;
        playSparkle(context);
        if (video) sparkle(box.querySelector('.rhythm-camera'), 1 - x, y); // カメラ映像は鏡像で表示している
        else sparkle(lane, TARGET / 100, .5);
        const result = judgeHit(now - start, hit);
        if (!result) return;
        hit.add(result.beat); notes[result.beat].classList.add('is-hit');
        status.textContent = hit.size + ' / ' + TOTAL_BEATS + ' ヒット';
        grade.textContent = result.grade === 'good' ? '良' : '可'; grade.className = 'rhythm-grade is-' + result.grade;
        clearTimeout(gradeTimer); gradeTimer = setTimeout(() => { grade.textContent = ''; grade.className = 'rhythm-grade'; }, 500);
      };
      if (!mic) tap.onclick = () => slap(.5, .5);
      else {
        tap.disabled = true; let prior = 0;
        const sampleTimer = setInterval(()=>{ analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum,n)=>sum+n*n,0)/samples.length); if (rms > .04 && rms > prior*1.5 && performance.now()-lastSlap > 450) slap(.5, .5); prior = rms; },40);
        resources.push(()=>clearInterval(sampleTimer));
        if (video) {
          const W = 64, H = 48, frame = document.createElement('canvas'); frame.width = W; frame.height = H;
          const fctx = frame.getContext('2d', { willReadFrequently: true });
          let before = null, priorRatio = 0;
          const motionTimer = setInterval(()=>{
            if (video.readyState < 2) return;
            fctx.drawImage(video, 0, 0, W, H);
            const now = fctx.getImageData(0, 0, W, H).data;
            if (before) { const m = detectMotion(before, now, W, H); if (isSlap(m.ratio, priorRatio)) slap(m.x, m.y); priorRatio = m.ratio; }
            before = now;
          }, 66);
          resources.push(()=>clearInterval(motionTimer));
        }
      }
      start = performance.now();
      let raf;
      const animate = () => { placeNotes(performance.now()); notes.forEach((n, k) => { if (!hit.has(k) && performance.now() - start > noteTime(k) + 320) n.classList.add('is-miss'); }); raf = requestAnimationFrame(animate); };
      raf = requestAnimationFrame(animate); resources.push(()=>cancelAnimationFrame(raf));
      resources.push(()=>clearTimeout(gradeTimer));
      let beat = -1;
      await new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException('中止しました', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        const tick = setInterval(() => {
          beat++;
          if (beat === TOTAL_BEATS) { clearInterval(tick); signal.removeEventListener('abort', abort); resolve(); return; }
          tap.textContent = (beat + 1) + ' ♪'; tap.classList.add('on');
          setTimeout(() => tap.classList.remove('on'), 220);
        }, BEAT_MS); resources.push(() => clearInterval(tick));
      });
      if (!hit.size) throw new Error(mic ? 'まだヒットがありません。音符が丸に重なったらバサッとはたいてみてね' : 'まだヒットがありません。音符が丸に重なったらタップしてみてね');
      return { method: 'rhythm', hits: hit.size, total_beats: TOTAL_BEATS, duration_seconds: (performance.now()-start)/1000 };
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
      status.textContent = '写真だけでもOK。「いただきます」を使う場合はブラウザの音声認識サービスに音声が送られる場合があります。';
      await new Promise((resolve, reject) => {
        const voice = document.createElement('button'); voice.className = 'btn btn-sub'; voice.textContent = '「いただきます」を言う'; box.append(voice);
        const skip = document.createElement('button'); skip.className = 'btn btn-main'; skip.textContent = '写真だけで進む'; box.append(skip); skip.onclick = resolve;
        const abort = () => reject(new DOMException('中止しました', 'AbortError')); signal.addEventListener('abort', abort, { once:true }); resources.push(()=>signal.removeEventListener('abort',abort));
        voice.onclick = () => {
          voice.disabled = true; const speech = new Speech(); speech.lang = 'ja-JP'; speech.continuous = false; resources.push(() => speech.abort());
          speech.onresult = e => { if (Array.from(e.results).some(r=>r[0].transcript.replace(/\s/g,'').includes('いただきます'))) { evidence.method = 'photo_voice'; evidence.itadakimasu = true; resolve(); } else status.textContent = '聞き取れませんでした。もう一度か、写真だけで進めます。'; };
          speech.onerror = () => { status.textContent = '音声認識を利用できません。写真だけでも記録できます。'; voice.disabled = false; };
          speech.onend = () => { voice.disabled = false; }; speech.start();
        };
      });
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
