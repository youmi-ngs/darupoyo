// 「いただきます」を聞いている間、声も録音しておく（#9）。言えたときだけ残して、アルバムで再生できる。
// 録音と音声認識を同時に使えない端末もあるので、2回うまくいかなかったら録音なしで聞く。
function startRecording() {
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) return null;
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported?.(t));
  let recorder, stream;
  const chunks = [];
  const ready = navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
    stream = s;
    recorder = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.start();
  }).catch(() => {});
  // keep=true なら録音した音を返す。どちらでもマイクは必ず止める。
  return async keep => {
    await ready;
    const done = recorder && recorder.state !== 'inactive' ? new Promise(r => { recorder.onstop = r; recorder.stop(); }) : Promise.resolve();
    await done;
    stream?.getTracks().forEach(t => t.stop());
    return keep && chunks.length ? new Blob(chunks, { type: recorder?.mimeType || type || 'audio/webm' }) : null;
  };
}

// Keep microphone state visible until the user chooses to continue.
export function confirmMealVoice(box, Speech, signal) {
  const panel = document.createElement('section');
  panel.className = 'meal-voice';
  panel.innerHTML = `<button type="button" class="meal-voice-toggle" aria-describedby="meal-voice-title">
      <svg class="voice-mic" viewBox="0 0 32 32" aria-hidden="true"><rect x="12" y="3" width="8" height="16" rx="4"/><path d="M7 14v2a9 9 0 0 0 18 0v-2M16 25v5M11 30h10"/></svg>
      <span class="voice-stop" aria-hidden="true"></span>
      <svg class="voice-check" viewBox="0 0 32 32" aria-hidden="true"><path d="m7 16 6 6L26 9"/></svg>
    </button>
    <div class="meal-voice-status" role="status" aria-live="polite" aria-atomic="true">
      <strong id="meal-voice-title"></strong><p></p>
    </div>
    <button type="button" class="meal-voice-next">写真だけで進む</button>
    <details class="meal-voice-privacy"><summary>音声の取り扱い</summary><p>音声はブラウザの音声認識サービスに送信される場合があります。「いただきます」が聞こえたときだけ、その声をハウスのアルバムに残して、住人が再生できます。</p></details>`;
  box.insertBefore(panel, box.querySelector('canvas'));
  const title = panel.querySelector('strong'), hint = panel.querySelector('.meal-voice-status p');
  const toggle = panel.querySelector('.meal-voice-toggle'), next = panel.querySelector('.meal-voice-next');
  let active, timer, done = false, matched = false, stopRecording = null, voice = Promise.resolve(null), misses = 0;
  function show(state, heading, detail) {
    panel.dataset.state = state;
    title.textContent = heading;
    hint.textContent = detail;
    hint.hidden = !detail;
    toggle.setAttribute('aria-label', matched ? '聞き取り完了' : active ? '音声認識をやめる' : state === 'idle' ? 'マイクをオンにする' : 'もう一度試す');
    toggle.disabled = matched;
    next.className = matched ? 'meal-voice-next btn btn-main' : 'meal-voice-next';
    next.textContent = matched ? '次へ' : '写真だけで進む';
  }
  function stop() {
    clearTimeout(timer);
    const previous = active;
    active = null;
    if (previous) {
      previous.onaudiostart = previous.onspeechstart = previous.onaudioend = previous.onspeechend = previous.onresult = previous.onnomatch = previous.onerror = previous.onend = null;
      try { previous.abort(); } catch { /* Already stopped. */ }
    }
  }
  function finish(state, heading, detail) {
    stop();
    if (stopRecording) { const end = stopRecording; stopRecording = null; voice = end(matched); if (!matched) misses++; }
    show(state, heading, detail);
    if (matched) next.focus();
  }
  show('idle', 'いただきます、しよう', 'マイクをタップ');
  return new Promise((resolve, reject) => {
    const settle = (error) => {
      if (done) return;
      done = true;
      stop();
      if (stopRecording) { voice = stopRecording(false); stopRecording = null; }
      signal.removeEventListener('abort', abort);
      toggle.onclick = next.onclick = null;
      if (error) { voice.then(() => reject(error)); return; }
      resolve(voice.then(blob => ({ matched, voice: matched ? blob : null })));
    };
    const abort = () => settle(new DOMException('中止しました', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    next.onclick = () => settle();
    toggle.onclick = () => {
      if (active) {
        finish('idle', 'いただきます、しよう', 'マイクをタップ');
        return;
      }
      try {
        const speech = new Speech();
        active = speech;
        speech.lang = 'ja-JP';
        speech.continuous = false;
        speech.interimResults = false;
        show('starting', '準備中…', 'マイクの許可が出たら「許可」');
        const current = fn => (...args) => { if (!done && active === speech) fn(...args); };
        speech.onaudiostart = current(() => show('listening', '「いただきます」と言ってね', '聞いてるよ'));
        speech.onspeechstart = current(() => show('listening', 'うん、聞いてるよ', ''));
        const processing = current(() => show('processing', '確認中…', 'もう話さなくてOK'));
        speech.onspeechend = processing;
        speech.onaudioend = processing;
        const retry = () => finish('error', 'もう一回、言ってみて', 'マイクをタップで再開');
        speech.onresult = current(event => {
          matched = Array.from(event.results).some(result => result[0].transcript.replace(/\s/g, '').includes('いただきます'));
          if (matched) finish('success', '聞こえた！', '');
          else retry();
        });
        speech.onnomatch = current(retry);
        speech.onend = current(retry);
        speech.onerror = current(event => {
          const detail = event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'ブラウザでマイクを許可してね'
            : event.error === 'no-speech' ? 'マイクをタップで再開'
            : '接続やマイクを確認してね';
          finish('error', 'マイクがおやすみ中', detail);
        });
        timer = setTimeout(current(() => finish('error', 'もう一回、言ってみて', 'マイクをタップで再開')), 15000);
        speech.start();
        if (misses < 2) stopRecording = startRecording();
      } catch {
        finish('error', 'マイクが使えないみたい', 'ブラウザのマイク設定を確認してね');
      }
    };
  });
}
