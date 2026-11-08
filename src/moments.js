// うちらのなう (Figma 207:914): the みんなの今 button opens a camera card. Take a selfie (or pick
// one), add a word, and みせちゃう shares it with the house. The card then shows what was sent
// and the gal's word on it (Figma 207:958), with a way to けーじばん.
import { setBusy } from './busy.js';
import { client, houseApi } from './api.js';
import { blobOf, openCamera } from './camera.js';
import { sfx } from './sfx.js';
import { momentPraise } from './moment-praise.js';

const WIDTH = 600, HEIGHT = 755; // the 302×380 frame of the design

export function setupMoments() {
  const dialog = document.createElement('dialog');
  dialog.className = 'now-dialog';
  dialog.setAttribute('aria-labelledby', 'now-title');
  dialog.innerHTML = `
    <div class="now-head"><h2 id="now-title">うちらのなう</h2><button type="button" class="now-close" aria-label="閉じる"><img src="/settings/3ad13.svg" alt=""></button></div>
    <p class="now-lead">今のうちら撮ろ〜</p>
    <div class="now-frame">
      <video muted playsinline autoplay hidden></video>
      <canvas hidden aria-label="撮った写真"></canvas>
      <p class="now-frame-note" hidden></p>
      <button type="button" class="now-retake" aria-label="撮り直す" hidden><img src="/moments/retake.svg" alt=""></button>
      <div class="now-controls">
        <label class="now-library" aria-label="ライブラリからえらぶ"><img src="/moments/library.svg" alt=""><input type="file" accept="image/*" hidden></label>
        <button type="button" class="now-shutter" aria-label="撮る"><img src="/moments/shutter.svg" alt=""></button>
        <button type="button" class="now-flip" aria-label="外カメラに切り替える" hidden><img src="/moments/flip.svg" alt=""></button>
      </div>
    </div>
    <label class="now-field"><span>ひとこと（30文字まで）</span><input maxlength="30" placeholder="おは！きょうもがんばろ〜" autocomplete="off"></label>
    <p class="now-caption" hidden></p>
    <div class="now-praise" hidden></div>
    <button type="button" class="now-share" disabled>みせちゃう</button>
    <button type="button" class="now-board" hidden>け〜じばんをちぇけらする</button>
    <p class="now-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const video = $('video'), canvas = $('canvas'), note = $('.now-frame-note'), retake = $('.now-retake');
  const controls = $('.now-controls'), shutter = $('.now-shutter'), flip = $('.now-flip'), library = $('.now-library input');
  const caption = $('.now-field input'), share = $('.now-share'), status = $('.now-status');
  const lead = $('.now-lead'), field = $('.now-field'), sentCaption = $('.now-caption'), praiseBox = $('.now-praise'), toBoard = $('.now-board');
  // Before sending: camera, word and みせちゃう. After: the photo, the word, the gal's line and けーじばん.
  const setSent = sent => {
    lead.textContent = sent ? 'そ〜しんできたよん' : '今のうちら撮ろ〜';
    field.hidden = share.hidden = sent; toBoard.hidden = !sent;
    if (sent) retake.hidden = true;
    if (!sent) { sentCaption.hidden = praiseBox.hidden = true; praiseBox.replaceChildren(); }
  };
  const ctx = canvas.getContext('2d');
  let stream = null, controller = null, taken = false, mediaId = null, requestId = null, busy = false, house = null;

  const stopCamera = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; };
  const facing = () => stream?.getVideoTracks()[0]?.getSettings().facingMode;
  // The front camera is shown, and saved, like a mirror (#161).
  const mirrored = () => facing() !== 'environment';
  const showLive = () => {
    taken = false; mediaId = null; canvas.hidden = retake.hidden = true; controls.hidden = false;
    video.hidden = !stream; video.classList.toggle('is-mirrored', !!stream && mirrored());
    share.disabled = true;
  };
  async function startCamera(mode = 'user') {
    stopCamera(); shutter.disabled = true; // until the camera shows a picture
    try {
      stream = await openCamera(video, mode, [], controller.signal);
      note.hidden = true; shutter.hidden = false; shutter.disabled = false;
    } catch (e) {
      if (e.name === 'AbortError') return;
      stream = null; shutter.hidden = true; note.hidden = false;
      note.textContent = 'カメラを使えないので、左下からライブラリの写真をえらんでね';
    }
    showLive();
  }
  // A taken or picked photo fills the frame (cut to its shape).
  function draw(source, width, height, mirror) {
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const scale = Math.max(WIDTH / width, HEIGHT / height), w = WIDTH / scale, h = HEIGHT / scale;
    if (mirror) ctx.setTransform(-1, 0, 0, 1, WIDTH, 0);
    ctx.drawImage(source, (width - w) / 2, (height - h) / 2, w, h, 0, 0, WIDTH, HEIGHT);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    taken = true; mediaId = null; video.hidden = true; canvas.hidden = false; retake.hidden = false; controls.hidden = true; note.hidden = true;
    share.disabled = false; status.textContent = '';
  }

  async function open() {
    document.querySelector('#menu')?.close();
    controller?.abort(); controller = new AbortController();
    house = client.house; requestId = crypto.randomUUID(); caption.value = ''; status.textContent = ''; setSent(false);
    setBusy(share, false); share.disabled = true; caption.disabled = retake.disabled = false; busy = false;
    dialog.showModal();
    await startCamera('user');
    const cameras = (await navigator.mediaDevices?.enumerateDevices?.().catch(() => []) || []).filter(d => d.kind === 'videoinput');
    flip.hidden = !stream || cameras.length < 2;
  }
  dialog.addEventListener('close', () => { controller?.abort(); stopCamera(); });
  $('.now-close').onclick = () => dialog.close();
  toBoard.onclick = () => { dialog.close(); document.getElementById('open-board')?.click(); };

  shutter.onclick = () => {
    if (!stream || !video.videoWidth) return;
    draw(video, video.videoWidth, video.videoHeight, mirrored()); sfx.shutter();
  };
  retake.onclick = () => { if (!busy) showLive(); };
  flip.onclick = async () => {
    const next = facing() === 'environment' ? 'user' : 'environment';
    flip.disabled = true;
    await startCamera(next);
    flip.setAttribute('aria-label', facing() === 'environment' ? '内カメラに切り替える' : '外カメラに切り替える');
    flip.disabled = false;
  };
  library.onchange = async () => {
    const file = library.files[0]; library.value = ''; if (!file) return;
    if (file.size > 25 * 1024 * 1024) { status.textContent = '25MB以下の写真をえらんでね'; return; }
    const url = URL.createObjectURL(file), image = new Image();
    try { image.src = url; await image.decode(); draw(image, image.naturalWidth, image.naturalHeight, false); }
    catch { status.textContent = 'この写真は開けませんでした。JPEG・PNGなどの写真をえらんでね'; }
    finally { URL.revokeObjectURL(url); }
  };

  share.onclick = async () => {
    if (!taken || busy || client.house !== house) return;
    busy = true; setBusy(share, true, 'みせてるよ…'); caption.disabled = retake.disabled = true; status.textContent = '';
    try {
      mediaId ||= (await houseApi('/media?kind=selfie', await blobOf(canvas, 'image/jpeg'))).id;
      const moment = await houseApi('/moments', { request_id: requestId, media_id: mediaId, caption: caption.value.trim() });
      window.dispatchEvent(new CustomEvent('darupoyo:moment')); // けーじばん picks up the new selfie
      stopCamera(); setSent(true);
      sentCaption.textContent = moment.caption || ''; sentCaption.hidden = !moment.caption;
      const praise = momentPraise(moment.praise); praiseBox.hidden = !praise; if (praise) praiseBox.append(praise);
      toBoard.focus();
    } catch (e) {
      status.textContent = e.message;
      setBusy(share, false); share.disabled = false; caption.disabled = retake.disabled = false;
    } finally { busy = false; }
  };

  document.querySelectorAll('#open-moments, [data-open-moments]').forEach(button => { button.onclick = () => void open(); });
}
