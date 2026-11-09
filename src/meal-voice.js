import { utteranceDetector, rmsOf } from './voice-activity.js';
// The resident turns the mic on once and says 「いただきます」. When the voice stops, the
// recording goes straight to the server, which checks it with Gemini (#120); a miss listens
// again by itself. Recording and speech recognition must not compete for the microphone on
// iOS, so the browser only measures loudness. verify(blob) → { heard, id }.
const LIMIT_MS = 10000, TICK_MS = 50, AUTO_RETRIES = 3;

export function recordMealVoice(box, phrase, signal, verify) {
  const panel = document.createElement('section'); panel.className = 'meal-voice';
  panel.innerHTML = `<h3 class="meal-voice-heading"></h3>
    <div class="meal-voice-heard" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><path d="M19 33l9 9 17-19"/></svg></div>
    <p role="status" aria-live="polite"></p>
    <button type="button" class="btn btn-main meal-voice-toggle">マイクをオンにする</button>
    <button type="button" class="btn btn-sub meal-voice-next"></button>
    <details class="meal-voice-privacy"><summary>音声の取り扱い</summary><p>マイクをオンにしている間だけ、最大10秒録音します。言い終わると、「いただきます」と言えているかを Google の Gemini が自動で確認します。確認できた声は、ハウスの住人が再生できます。</p></details>`;
  panel.querySelector('h3').textContent = phrase + 'を残そう';
  box.insertBefore(panel, box.querySelector(':scope > .capture-frame, :scope > canvas')); // above the photo
  const status = panel.querySelector('[role=status]'), toggle = panel.querySelector('.meal-voice-toggle'), next = panel.querySelector('.meal-voice-next');
  next.textContent = '写真だけで進む';
  const show = (state, text) => { panel.dataset.state = state; status.textContent = text; };
  const prompt = '「' + phrase + '」と言ってね';
  show('idle', 'マイクをタップして' + prompt);
  let done = false, checked = null, blob = null, stream = null, audio = null, recorder = null, ticker = null, attempt = 0, misses = 0;

  const stopListening = () => {
    clearInterval(ticker); ticker = null;
    if (recorder?.state === 'recording') { try { recorder.stop(); } catch {} }
  };
  // Mic off: also makes any late recording or check of this attempt be ignored.
  const release = () => {
    stopListening(); attempt++;
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    audio?.close().catch(() => {}); audio = null;
  };

  return new Promise((resolve, reject) => {
    const settle = error => {
      if (done) return;
      done = true; release();
      signal.removeEventListener('abort', abort);
      toggle.onclick = next.onclick = null;
      if (error) reject(error); else resolve({ matched: Boolean(checked), voice: checked ? blob : null, voiceMediaId: checked?.id || null });
    };
    const abort = () => settle(new DOMException('中止しました', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    next.onclick = () => { checked = null; settle(); };

    const fail = (message, label = 'もう一回言う') => { release(); toggle.disabled = false; toggle.textContent = label; show('error', message); };

    async function check(recorded, current) {
      show('checking', '「' + phrase + '」か確認してるよ…');
      try {
        const result = await verify(recorded);
        if (done || current !== attempt) return;
        if (result.heard) {
          checked = result; blob = recorded; release();
          toggle.disabled = true; toggle.textContent = '聞こえた！';
          show('success', '「' + phrase + '」聞こえた！'); // #130: say so, then move on
          setTimeout(() => settle(), 1500); return; // long enough to see the check (#174)
        }
        if (++misses >= AUTO_RETRIES) { fail('「' + phrase + '」が聞き取れなかったよ。もう一回やってみてね'); return; }
        listen(current, '「' + phrase + '」が聞き取れなかったよ。もう一回言ってね');
      } catch {
        if (done || current !== attempt) return;
        fail('確認できませんでした。もう一回言うか、写真だけで進んでね');
      }
    }

    // One recording: wait for a voice, and stop when it ends (or at 10 seconds).
    function listen(current, message = prompt) {
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
      const chunks = [], detect = utteranceDetector(), analyser = audio.analyser, samples = new Float32Array(analyser.fftSize);
      let elapsed = 0, voice = false;
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onerror = () => { if (!done && current === attempt) fail('録音が止まりました。もう一回試してね'); };
      rec.onstop = () => {
        if (done || current !== attempt) return;
        if (!voice) { fail('声が聞こえなかったよ。もう一回言ってね'); return; }
        const recorded = new Blob(chunks, { type: rec.mimeType || type });
        if (!recorded.size || recorded.size > 512 * 1024) { fail('声を保存できませんでした。短く言い直してね'); return; }
        void check(recorded, current);
      };
      rec.start(250);
      toggle.disabled = false; toggle.textContent = 'マイクをオフにする';
      show('listening', message);
      ticker = setInterval(() => {
        if (done || current !== attempt) { clearInterval(ticker); return; }
        analyser.getFloatTimeDomainData(samples); elapsed += TICK_MS;
        const heard = detect(rmsOf(samples), TICK_MS);
        if (heard !== 'waiting' && !voice) { voice = true; show('listening', '聞いてるよ…'); }
        if (heard === 'done' || elapsed >= LIMIT_MS) { stopListening(); toggle.disabled = true; }
      }, TICK_MS);
    }

    toggle.onclick = async () => {
      if (ticker) { release(); toggle.textContent = 'マイクをオンにする'; show('idle', 'マイクをタップして' + prompt); return; }
      const current = ++attempt; misses = 0; toggle.disabled = true;
      show('starting', 'マイクの許可が出たら「許可」を選んでね');
      let context = null;
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.AudioContext) throw new Error('このブラウザでは録音できません。別のブラウザで試してね');
        context = new AudioContext(); // made inside the tap: iPhone only lets sound be measured after a touch
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (done || current !== attempt) { acquired.getTracks().forEach(t => t.stop()); context.close().catch(() => {}); return; }
        stream = acquired;
        const analyser = context.createAnalyser(); analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        await context.resume().catch(() => {});
        const ctx = context; audio = { close: () => ctx.close(), analyser }; context = null;
        listen(current);
      } catch (error) {
        context?.close().catch(() => {});
        if (done || current !== attempt) return;
        fail(error.name === 'NotAllowedError' ? 'マイクを許可してから、もう一回試してね' : error.message || 'マイクを使えませんでした', 'マイクをオンにする');
      }
    };
  });
}

export const confirmMealVoice = (box, signal, verify) => recordMealVoice(box, 'いただきます', signal, verify);
