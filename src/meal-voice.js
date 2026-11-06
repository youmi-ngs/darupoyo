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
    <details class="meal-voice-privacy"><summary>音声の取り扱い</summary><p>音声はブラウザの音声認識サービスに送信される場合があります。</p></details>`;
  box.insertBefore(panel, box.querySelector('canvas'));
  const title = panel.querySelector('strong'), hint = panel.querySelector('.meal-voice-status p');
  const voice = panel.querySelector('.meal-voice-toggle'), next = panel.querySelector('.meal-voice-next');
  let active, timer, done = false, matched = false;
  function show(state, heading, detail) {
    panel.dataset.state = state;
    title.textContent = heading;
    hint.textContent = detail;
    hint.hidden = !detail;
    voice.setAttribute('aria-label', matched ? '聞き取り完了' : active ? '音声認識をやめる' : state === 'idle' ? 'マイクをオンにする' : 'もう一度試す');
    voice.disabled = matched;
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
    show(state, heading, detail);
    if (matched) next.focus();
  }
  show('idle', 'いただきます、しよう', 'マイクをタップ');
  return new Promise((resolve, reject) => {
    const settle = (error) => {
      if (done) return;
      done = true;
      stop();
      signal.removeEventListener('abort', abort);
      voice.onclick = next.onclick = null;
      if (error) reject(error); else resolve(matched);
    };
    const abort = () => settle(new DOMException('中止しました', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    next.onclick = () => settle();
    voice.onclick = () => {
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
      } catch {
        finish('error', 'マイクが使えないみたい', 'ブラウザのマイク設定を確認してね');
      }
    };
  });
}
