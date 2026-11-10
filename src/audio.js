import { action, check, countdown, onAbort, openMic, timing } from './camera.js';
import { BEAT_MS, TOTAL_BEATS, PASS_HITS, OK_MS, COUNTDOWN_SECONDS, GRADE_LABEL, UPPER_FALLBACK, noteTime, judgeHit, detectMotion, isSlap, motionEdge, hasUpperBody, upperBodyBottom } from './rhythm.js';
import { createPoseLandmarker } from './pose.js';
import { playSparkle, sparkle, sparkleOutline } from './sparkle.js';
import { sfx } from './sfx.js';

const UPPER_HINT = '顔・肩・腕が映るようにしてね（上半身だけでOK）';
// #124: once the upper body was found, a retry ("もう一回") starts right away with the same
// area instead of checking again (the second check could fail and leave the button dead).
let knownUpperRows = null;
// If the check cannot confirm the upper body in time, the game can still be started.
const UPPER_TIMEOUT_MS = 8000;
// 開始前だけ Pose で上半身が映っているかを見る（#106）。3回続けて見えたら ready を呼んで、モデルをすぐ閉じる。
// ゲーム中は軽いフレーム差分だけを使うので、推論で判定が遅れることはない。
function watchUpperBody(video, status, ready, resources) {
  let stopped = false, frame, landmarker, seen = 0, last = 0;
  const stop = () => { if (stopped) return; stopped = true; cancelAnimationFrame(frame); try { landmarker?.close(); } catch {} landmarker = null; };
  resources.push(stop);
  status.textContent = UPPER_HINT + '。準備中…';
  const t0 = performance.now();
  createPoseLandmarker({ runningMode: 'VIDEO' }).then(model => {
    timing('laundry-pose-load', t0);
    if (stopped) { model.close(); return; }
    landmarker = model; status.textContent = UPPER_HINT;
    const loop = now => {
      if (stopped) return;
      frame = requestAnimationFrame(loop);
      if (now - last < 150 || video.readyState < 2) return;
      last = now;
      const result = landmarker.detectForVideo(video, now), landmarks = result.landmarks[0];
      const ok = hasUpperBody(landmarks), bottom = ok ? upperBodyBottom(landmarks) : UPPER_FALLBACK;
      result.close();
      seen = ok ? seen + 1 : 0;
      if (seen >= 3) { stop(); ready(bottom); }
    };
    frame = requestAnimationFrame(loop);
  }).catch(e => {
    if (stopped) return;
    // モデルを読めない端末でも遊べるように、上半身の範囲は固定値で始められるようにする。
    console.warn('上半身チェックを使えません', e);
    ready(UPPER_FALLBACK, 'このまま「リズムをはじめる」でOK。顔・肩・腕が映るようにしてね');
  });
  return stop;
}

// 洗濯：前のカメラに自分を映して、音符に合わせて洗濯物をバサッと動かす。
// タイミングが合うと動いた部分の輪郭からキラキラ。8拍のうち PASS_HITS 回でクリア。映像は端末の中だけで使う。
export async function laundryRhythm(box, status, choice, signal, resources) {
  status.textContent = 'カメラに上半身を映してね。音符が丸に重なったら洗濯物をバサッ！映像は端末の中だけで使い、保存も送信もしません。';
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } } });
  const video = document.createElement('video');
  resources.push(() => { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; }); check(signal); video.autoplay = true; video.muted = true; video.playsInline = true; video.srcObject = stream;
  const stage = document.createElement('div'); stage.className = 'rhythm-camera'; stage.append(video); box.append(stage);
  await video.play(); check(signal);
  const lane = document.createElement('div'); lane.className = 'rhythm-lane'; lane.setAttribute('aria-hidden', 'true');
  lane.innerHTML = '<span class="rhythm-target"></span><span class="rhythm-grade"></span>';
  const notes = Array.from({ length: TOTAL_BEATS }, () => { const n = document.createElement('i'); n.className = 'rhythm-note'; lane.append(n); return n; });
  box.append(lane);
  const TARGET = 16, GAP = 24; // 判定の円の位置と音符の間隔（レーン幅に対する%）
  let start = performance.now();
  let laneWidth = lane.clientWidth;
  const resize = new ResizeObserver(([entry]) => { laneWidth = entry.contentRect.width; });
  resize.observe(lane); resources.push(() => resize.disconnect());
  const placeNotes = (now) => notes.forEach((n, k) => {
    const x = (TARGET + (noteTime(k) - (now - start)) / BEAT_MS * GAP) * laneWidth / 100;
    n.style.transform = `translate(${x}px, -50%) translateX(-50%)`;
  });
  placeNotes(start);
  // 上半身が映るまで「リズムをはじめる」は押せない。一度OKになったら、そのまま押せる。
  const started = action(box, 'リズムをはじめる', signal), startButton = box.lastElementChild;
  startButton.disabled = true;
  let rows = UPPER_FALLBACK;
  const markReady = (bottom, message = '上半身OK！洗濯物を持って「リズムをはじめる」') => {
    if (!startButton.disabled) return;
    rows = bottom; knownUpperRows = bottom; startButton.disabled = false; status.textContent = message;
  };
  // 開発中だけ：テストの偽カメラには人が映らないので、上半身OKをイベントで起こせるようにする。
  if (import.meta.env.DEV) box.addEventListener('test-upper-body', () => markReady(UPPER_FALLBACK));
  let stopCheck = () => {};
  if (knownUpperRows !== null) markReady(knownUpperRows, 'もう一回いこ！洗濯物を持って「リズムをはじめる」');
  else {
    stopCheck = watchUpperBody(video, status, markReady, resources);
    const giveUp = setTimeout(() => markReady(UPPER_FALLBACK, '上半身がうまく見えなくても大丈夫。顔・肩・腕が映るようにして「リズムをはじめる」'), UPPER_TIMEOUT_MS);
    resources.push(() => clearTimeout(giveUp));
  }
  await started; check(signal); stopCheck();
  const context = new AudioContext(); resources.push(() => { void context.close(); }); void context.resume();
  // 3・2・1 の猶予（#107）。洗濯物を構える時間。カウント中の動きはヒットに数えない。
  const count = document.createElement('span'); count.className = 'capture-count'; count.setAttribute('aria-hidden', 'true'); stage.append(count);
  await countdown(COUNTDOWN_SECONDS, left => {
    count.hidden = !left; count.textContent = left || '';
    status.textContent = left ? left + ' …洗濯物をかまえて！' : 'スタート！';
    if (left) sfx.pop();
  }, signal);
  count.remove(); check(signal);
  const counter = document.createElement('p'); counter.className = 'btn capture-beat'; counter.setAttribute('aria-hidden', 'true'); counter.textContent = '♪'; box.append(counter);
  const grade = lane.querySelector('.rhythm-grade');
  const W = 64, H = 48, frame = document.createElement('canvas'); frame.width = W; frame.height = H;
  const fctx = frame.getContext('2d', { willReadFrequently: true });
  const hit = new Set();
  let good = 0;
  let lastSlap = -Infinity, gradeTimer;
  const slap = (x, y, points = []) => {
    const now = performance.now();
    if (now - lastSlap < 300) return;
    lastSlap = now;
    const result = judgeHit(now - start, hit);
    if (!result) return;
    hit.add(result.beat); notes[result.beat].classList.add('is-hit'); if (result.grade === 'good') good++;
    playSparkle(context);
    if (points.length) sparkleOutline(stage, points); else sparkle(stage, 1 - x, y);
    status.textContent = hit.size + ' / ' + TOTAL_BEATS + ' ヒット（' + PASS_HITS + '回でクリア）';
    grade.textContent = GRADE_LABEL[result.grade]; grade.className = 'rhythm-grade is-' + result.grade;
    clearTimeout(gradeTimer); gradeTimer = setTimeout(() => { grade.textContent = ''; grade.className = 'rhythm-grade'; }, 500);
  };
  // 開発中だけ：テストが「バサッ」を起こせるようにする（本番ビルドには入らない）。
  if (import.meta.env.DEV) box.addEventListener('test-slap', () => slap(.5, .5));
  let before = null, priorRatio = 0;
  const motionTimer = setInterval(() => {
    if (video.readyState < 2) return;
    fctx.drawImage(video, 0, 0, W, H);
    const now = fctx.getImageData(0, 0, W, H).data;
    // 上半身の範囲（rows）だけを見る。腰から下の動きでは反応しない（#106）。
    if (before) { const m = detectMotion(before, now, W, H, 40, rows * H); if (isSlap(m.ratio, priorRatio)) slap(m.x, m.y, motionEdge(before, now, W, H, 40, rows * H)); priorRatio = m.ratio; }
    before = now;
  }, 66);
  resources.push(() => clearInterval(motionTimer));
  start = performance.now();
  let raf;
  const animate = () => { const now = performance.now(); placeNotes(now); notes.forEach((n, k) => { if (!hit.has(k) && now - start > noteTime(k) + OK_MS) n.classList.add('is-miss'); }); raf = requestAnimationFrame(animate); };
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
  status.textContent = 'じゅんびちゅ〜…音はスマホの中だけで聞くから安心してね♡';
  const { FilesetResolver, AudioClassifier } = await import('@mediapipe/tasks-audio');
  const classifier = await AudioClassifier.createFromOptions(await FilesetResolver.forAudioTasks('/models/audio'), { baseOptions: { modelAssetPath: '/models/yamnet.tflite' }, runningMode: 'AUDIO_CLIPS', maxResults: -1 });
  resources.push(() => classifier.close()); check(signal);
  const stream = await openMic(resources, signal);
  const context = new AudioContext({ sampleRate: 16000 }); resources.push(() => { void context.close(); }); await context.resume();
  await context.audioWorklet.addModule('/pcm-worklet.js'); check(signal);
  const source = context.createMediaStreamSource(stream), worklet = new AudioWorkletNode(context, 'pcm');
  const mute = context.createGain(); mute.gain.value = 0; source.connect(worklet).connect(mute).connect(context.destination);
  resources.push(() => { source.disconnect(); worklet.disconnect(); });
  const progress = document.createElement('progress'); progress.max = 10; progress.value = 0; box.append(progress);
  const levelLabel = document.createElement('label'); levelLabel.className = 'mic-level'; levelLabel.textContent = 'マイクに届いている音';
  const level = document.createElement('meter'); level.min = 0; level.max = 1; level.value = 0; level.setAttribute('aria-label', 'マイクの音量');
  const hearing = document.createElement('small'); hearing.textContent = 'ドライヤーをつけてみてね';
  levelLabel.append(level, hearing); box.append(levelLabel);
  status.textContent = 'ドライヤーぶお〜んってして！10びょ〜でクリアだよん';
  let detected = 0;
  await new Promise((resolve, reject) => {
    resources.push(onAbort(signal, reject));
    const timeout = setTimeout(() => reject(new Error('ドライヤーの音、あんま聞こえなかった〜。スマホ近づけてもっかいやってみて！')), 120000); resources.push(() => clearTimeout(timeout));
    worklet.onprocessorerror = () => reject(new Error('マイクの読み取りが止まったよ。閉じて、もう一度試してね'));
    resources.push(() => { worklet.port.onmessage = null; worklet.onprocessorerror = null; });
    worklet.port.onmessage = ({ data }) => {
      try {
        const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
        level.value = Math.min(1, rms * 8);
        hearing.textContent = rms > .005 ? '音は届いているよ。ドライヤーの音を確認中…' : '音が小さいみたい。スマホを少し近づけてね';
        const result = classifier.classify(data, context.sampleRate);
        const categories = result.flatMap(r => r.classifications.flatMap(c => c.categories));
        if (categories.some(c => /hair dryer/i.test(c.categoryName) && c.score >= .2)) { detected += data.length / context.sampleRate; hearing.textContent = 'ドライヤーの音、聞こえてるよ！'; }
        progress.value = detected; status.textContent = 'ぶお〜ん…' + Math.min(10, detected).toFixed(1) + ' / 10びょ〜';
        if (detected >= 10) resolve();
      } catch (e) { reject(e); }
    };
  });
  return { method: 'sound', duration_seconds: detected };
}
