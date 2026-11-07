import { action, check, onAbort, openMic } from './camera.js';
import { createSegmenter } from './segment.js';
import { BEAT_MS, TOTAL_BEATS, PASS_HITS, OK_MS, noteTime, judgeHit, detectMotion, isSlap, bodyEdge } from './rhythm.js';
import { playSparkle, sparkle, sparkleOutline } from './sparkle.js';

// 洗濯：前のカメラに自分を映して、音符に合わせて洗濯物をバサッと動かす。
// タイミングが合うと体の輪郭からキラキラ。8拍のうち PASS_HITS 回でクリア。映像は端末の中だけで使う。
export async function laundryRhythm(box, status, choice, signal, resources) {
  status.textContent = 'カメラに全身か上半身を映してね。音符が丸に重なったら洗濯物をバサッ！映像は端末の中だけで使い、保存も送信もしません。';
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } } });
  resources.push(() => stream.getTracks().forEach((t) => t.stop())); check(signal);
  const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
  const stage = document.createElement('div'); stage.className = 'rhythm-camera'; stage.append(video); box.append(stage);
  await video.play(); check(signal);
  // 体の形を見分けるAI（人の切り抜きと同じ）。読み込めなくても、動いた場所からキラキラを出す。
  const segmenter = await createSegmenter().catch(() => null); check(signal);
  if (segmenter) resources.push(() => segmenter.close());
  const lane = document.createElement('div'); lane.className = 'rhythm-lane'; lane.setAttribute('aria-hidden', 'true');
  lane.innerHTML = '<span class="rhythm-target"></span><span class="rhythm-grade"></span>';
  const notes = Array.from({ length: TOTAL_BEATS }, () => { const n = document.createElement('i'); n.className = 'rhythm-note'; lane.append(n); return n; });
  box.append(lane);
  const TARGET = 16, GAP = 24; // 判定の円の位置と音符の間隔（レーン幅に対する%）
  let start = performance.now();
  const placeNotes = (now) => notes.forEach((n, k) => { n.style.left = (TARGET + (noteTime(k) - (now - start)) / BEAT_MS * GAP) + '%'; });
  placeNotes(start);
  await action(box, 'リズムをはじめる', signal); check(signal);
  const context = new AudioContext(); resources.push(() => { void context.close(); }); void context.resume();
  const counter = document.createElement('p'); counter.className = 'btn capture-beat'; counter.setAttribute('aria-hidden', 'true'); counter.textContent = '♪'; box.append(counter);
  const grade = lane.querySelector('.rhythm-grade');
  const W = 64, H = 48, frame = document.createElement('canvas'); frame.width = W; frame.height = H;
  const fctx = frame.getContext('2d', { willReadFrequently: true });
  const body = document.createElement('canvas'); body.width = 96; body.height = 128;
  const bctx = body.getContext('2d', { willReadFrequently: true });
  const outline = () => {
    if (!segmenter || video.readyState < 2) return [];
    bctx.drawImage(video, 0, 0, body.width, body.height);
    const result = segmenter.segment(body);
    try {
      const mask = result.confidenceMasks?.[0]; if (!mask) return [];
      const person = Float32Array.from(mask.getAsFloat32Array(), (b) => 1 - b);
      // カメラ映像は鏡像で表示しているので、左右を反転する。
      return bodyEdge(person, mask.width, mask.height).map((p) => ({ x: 1 - p.x, y: p.y }));
    } catch { return []; } finally { result.close(); }
  };
  const hit = new Set();
  let good = 0;
  let lastSlap = -Infinity, gradeTimer;
  const slap = (x, y) => {
    const now = performance.now();
    if (now - lastSlap < 300) return;
    lastSlap = now;
    const result = judgeHit(now - start, hit);
    if (!result) return;
    hit.add(result.beat); notes[result.beat].classList.add('is-hit'); if (result.grade === 'good') good++;
    playSparkle(context);
    const points = outline();
    if (points.length) sparkleOutline(stage, points); else sparkle(stage, 1 - x, y);
    status.textContent = hit.size + ' / ' + TOTAL_BEATS + ' ヒット（' + PASS_HITS + '回でクリア）';
    grade.textContent = result.grade === 'good' ? '良' : '可'; grade.className = 'rhythm-grade is-' + result.grade;
    clearTimeout(gradeTimer); gradeTimer = setTimeout(() => { grade.textContent = ''; grade.className = 'rhythm-grade'; }, 500);
  };
  // 開発中だけ：テストが「バサッ」を起こせるようにする（本番ビルドには入らない）。
  if (import.meta.env.DEV) box.addEventListener('test-slap', () => slap(.5, .5));
  let before = null, priorRatio = 0;
  const motionTimer = setInterval(() => {
    if (video.readyState < 2) return;
    fctx.drawImage(video, 0, 0, W, H);
    const now = fctx.getImageData(0, 0, W, H).data;
    if (before) { const m = detectMotion(before, now, W, H); if (isSlap(m.ratio, priorRatio)) slap(m.x, m.y); priorRatio = m.ratio; }
    before = now;
  }, 66);
  resources.push(() => clearInterval(motionTimer));
  start = performance.now();
  let raf;
  const animate = () => { placeNotes(performance.now()); notes.forEach((n, k) => { if (!hit.has(k) && performance.now() - start > noteTime(k) + 320) n.classList.add('is-miss'); }); raf = requestAnimationFrame(animate); };
  raf = requestAnimationFrame(animate); resources.push(() => cancelAnimationFrame(raf));
  resources.push(() => clearTimeout(gradeTimer));
  let beat = -1;
  await new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('中止しました', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    const tick = setInterval(() => {
      beat++;
      // 最後の音符の判定時間が終わるまで待つ。
      if (beat === TOTAL_BEATS) { setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, OK_MS); clearInterval(tick); return; }
      counter.textContent = (beat + 1) + ' ♪'; counter.classList.add('on');
      setTimeout(() => counter.classList.remove('on'), 220);
    }, BEAT_MS); resources.push(() => clearInterval(tick));
  });
  if (hit.size < PASS_HITS) {
    // 足りないときは、記録せずにギャルが「おしい」と声をかける画面へ。
    const e = new Error('音符が丸に重なったらバサッと動かしてね');
    e.name = 'NoHitError'; e.hits = hit.size; e.totalBeats = TOTAL_BEATS; e.pass = PASS_HITS; throw e;
  }
  // result は画面に出すだけで、APIには送らない。
  return { method: 'rhythm', hits: hit.size, total_beats: TOTAL_BEATS, duration_seconds: (performance.now() - start) / 1000, result: { good } };
}

export async function dryerSound(box, status, signal, resources) {
  status.textContent = '音の判定モデルを準備中。音声は端末で処理し、アップロードしません。';
  const [{ FilesetResolver }, { AudioClassifier }] = await Promise.all([import('@mediapipe/tasks-vision'), import('@mediapipe/tasks-audio')]);
  const classifier = await AudioClassifier.createFromOptions(await FilesetResolver.forAudioTasks('/models/audio'), { baseOptions: { modelAssetPath: '/models/yamnet.tflite' }, runningMode: 'AUDIO_CLIPS', maxResults: 5 });
  resources.push(() => classifier.close()); check(signal);
  const stream = await openMic(resources, signal);
  const context = new AudioContext({ sampleRate: 16000 }); resources.push(() => { void context.close(); }); await context.resume();
  await context.audioWorklet.addModule('/pcm-worklet.js'); check(signal);
  const source = context.createMediaStreamSource(stream), worklet = new AudioWorkletNode(context, 'pcm');
  const mute = context.createGain(); mute.gain.value = 0; source.connect(worklet).connect(mute).connect(context.destination);
  resources.push(() => { source.disconnect(); worklet.disconnect(); });
  const progress = document.createElement('progress'); progress.max = 10; progress.value = 0; box.append(progress);
  status.textContent = 'ドライヤーの音を聞いています。検出した時間が10秒でクリア。';
  let detected = 0;
  await new Promise((resolve, reject) => {
    resources.push(onAbort(signal, reject));
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
