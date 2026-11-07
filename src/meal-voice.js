// Recording and speech recognition must not compete for the microphone on iOS, so the
// resident records and reviews 「いただきます」 here, and the server checks the recording
// with Gemini (#120). verify(blob) → { heard, id }; only a recording that passed is used.
export function recordMealVoice(box, phrase, signal, verify) {
  const panel = document.createElement('section'); panel.className = 'meal-voice';
  panel.innerHTML = `<h3 class="meal-voice-heading"></h3><p role="status" aria-live="polite"></p>
    <button type="button" class="btn btn-main meal-voice-toggle">マイクをオンにする</button>
    <audio controls hidden aria-label="録音した声を確認"></audio>
    <button type="button" class="btn btn-main meal-voice-use" hidden>この音声を使う</button>
    <button type="button" class="btn btn-sub meal-voice-next"></button>
    <details class="meal-voice-privacy"><summary>音声の取り扱い</summary><p>最大10秒録音します。「この音声を使う」を押すと、「いただきます」と言えているかを Google の Gemini で確認します。記録した声は、ハウスの住人が再生できます。</p></details>`;
  panel.querySelector('h3').textContent = phrase + 'を残そう';
  box.insertBefore(panel, box.querySelector('canvas'));
  const status = panel.querySelector('[role=status]'), toggle = panel.querySelector('.meal-voice-toggle');
  const use = panel.querySelector('.meal-voice-use'), next = panel.querySelector('.meal-voice-next'), audio = panel.querySelector('audio');
  next.textContent = '写真だけで進む';
  let done = false, checked = null, stream, recorder, blob, url, timer, stopTimer, attempt = 0;
  const release = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
  const clearPreview = () => { audio.pause(); audio.removeAttribute('src'); audio.hidden = use.hidden = true; if (url) URL.revokeObjectURL(url); url = null; blob = null; };
  const show = (state, text) => { panel.dataset.state = state; status.textContent = text; };
  show('idle', 'マイクをタップして「' + phrase + '」と言ってね');
  return new Promise((resolve, reject) => {
    const settle = error => {
      if (done) return;
      done = true; attempt++; clearTimeout(timer); clearTimeout(stopTimer);
      if (recorder?.state === 'recording') { try { recorder.stop(); } catch {} }
      release(); audio.pause(); if (url) URL.revokeObjectURL(url);
      signal.removeEventListener('abort', abort);
      toggle.onclick = use.onclick = next.onclick = null;
      if (error) reject(error); else resolve({ matched: Boolean(checked), voice: checked ? blob : null, voiceMediaId: checked?.id || null });
    };
    const abort = () => settle(new DOMException('中止しました', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    next.onclick = () => { checked = null; settle(); };
    use.onclick = async () => {
      if (!blob) return;
      const current = attempt; use.disabled = toggle.disabled = true; show('checking', '「' + phrase + '」が聞こえるか確認しています…');
      try {
        const result = await verify(blob);
        if (done || current !== attempt) return;
        // #130: say that it was heard, then move on.
        if (result.heard) { checked = result; show('success', '「' + phrase + '」聞こえた！'); setTimeout(() => settle(), 900); return; }
        show('error', '「' + phrase + '」が聞き取れなかったよ。もう一度録音してね');
      } catch (error) {
        if (done || current !== attempt) return;
        show('error', '確認できませんでした。もう一度試すか、写真だけで進んでね');
      } finally { if (!done && !checked) { use.disabled = toggle.disabled = false; } }
    };
    const fail = message => {
      clearTimeout(timer); clearTimeout(stopTimer); release();
      toggle.disabled = false; toggle.textContent = 'もう一度録音する';
      show('error', message);
    };
    const stop = () => {
      if (recorder?.state !== 'recording') return;
      clearTimeout(timer); toggle.disabled = true; show('processing', '録音を準備しています…');
      stopTimer = setTimeout(() => { attempt++; fail('録音を保存できませんでした。もう一度試してね'); }, 2000);
      try { recorder.stop(); } catch { attempt++; fail('録音を保存できませんでした。もう一度試してね'); }
    };
    toggle.onclick = async () => {
      if (recorder?.state === 'recording') { stop(); return; }
      const current = ++attempt; clearPreview(); toggle.disabled = true;
      show('starting', 'マイクの許可が出たら「許可」を選んでね');
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('このブラウザでは録音できません。別のブラウザで試してね');
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (done || current !== attempt) { acquired.getTracks().forEach(t => t.stop()); return; }
        stream = acquired;
        const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
        recorder = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
        const chunks = []; const currentRecorder = recorder;
        recorder.ondataavailable = event => { if (!done && current === attempt && event.data.size) chunks.push(event.data); };
        recorder.onerror = () => { if (!done && current === attempt) { attempt++; fail('録音が止まりました。もう一度試してね'); } };
        recorder.onstop = () => {
          if (done || current !== attempt) return;
          clearTimeout(timer); clearTimeout(stopTimer); release();
          const recorded = new Blob(chunks, { type: currentRecorder.mimeType || type });
          if (!recorded.size || recorded.size > 512 * 1024) { fail('声を保存できませんでした。短く録音し直してね'); return; }
          blob = recorded; url = URL.createObjectURL(blob); audio.src = url; audio.hidden = use.hidden = false;
          toggle.disabled = false; toggle.textContent = '録音し直す';
          show('review', '録音できたよ。聞き直してから保存してね');
        };
        recorder.start(250); toggle.disabled = false; toggle.textContent = '録音を止める';
        show('recording', '「' + phrase + '」と言ってね（最大10秒）');
        timer = setTimeout(stop, 10000);
      } catch (error) {
        if (done || current !== attempt) return;
        fail(error.name === 'NotAllowedError' ? 'マイクを許可してから、もう一度試してね' : error.message || 'マイクを使えませんでした');
      }
    };
  });
}

export const confirmMealVoice = (box, signal, verify) => recordMealVoice(box, 'いただきます', signal, verify);
