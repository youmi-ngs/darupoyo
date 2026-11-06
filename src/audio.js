// Laundry rhythm and dryer sound checks. Audio is processed on the device and never uploaded.
import { action, check, onAbort, openMic } from './camera.js';

export async function laundryRhythm(box, status, choice, signal, resources) {
  const mic = choice.mode === 'mic';
  status.textContent = mic ? '丸が光ったら洗濯物をバサッとはたいて8拍。音量の立ち上がりを拾います（洗濯音の種類を判別するものではありません）。音声は送信しません。' : 'タップモード：洗濯物をはたくリズムで、丸が光ったらタップ。8拍遊ぼう（音や動きの自動判定ではありません）。';
  let analyser, samples;
  if (mic) {
    const stream = await openMic(resources, signal);
    const context = new AudioContext(); resources.push(() => { void context.close(); }); await context.resume();
    analyser = context.createAnalyser(); analyser.fftSize = 1024; context.createMediaStreamSource(stream).connect(analyser); samples = new Float32Array(analyser.fftSize);
  }
  await action(box, 'リズムをはじめる', signal); check(signal);
  const tap = document.createElement('button'); tap.className = 'btn capture-beat'; tap.textContent = '♪'; box.append(tap);
  let beat = -1, lastBeat = 0;
  const hit = new Set();
  const onHit = () => { if (beat >= 0 && beat < 8 && performance.now() - lastBeat < 400) { hit.add(beat); status.textContent = hit.size + ' / 8 ヒット'; } };
  if (!mic) tap.onclick = onHit;
  else {
    tap.disabled = true; let prior = 0, lastHit = 0;
    const sampleTimer = setInterval(() => { analyser.getFloatTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length); if (rms > .04 && rms > prior * 1.5 && performance.now() - lastHit > 400) { onHit(); lastHit = performance.now(); } prior = rms; }, 40);
    resources.push(() => clearInterval(sampleTimer));
  }
  const start = performance.now();
  await new Promise((resolve, reject) => {
    const off = onAbort(signal, reject);
    const tick = setInterval(() => {
      beat++; lastBeat = performance.now();
      if (beat === 8) { clearInterval(tick); off(); resolve(); return; }
      tap.textContent = (beat + 1) + ' ♪'; tap.classList.add('on');
      setTimeout(() => tap.classList.remove('on'), 220);
    }, 800); resources.push(() => clearInterval(tick));
  });
  if (!hit.size) throw new Error('まだヒットがありません。丸が光ったらタップしてみてね');
  return { method: 'rhythm', hits: hit.size, total_beats: 8, duration_seconds: (performance.now() - start) / 1000 };
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
