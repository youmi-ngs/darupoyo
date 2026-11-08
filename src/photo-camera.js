import { blobOf, openCamera, snapshot, aborted } from './camera.js';

// A real camera preview: file-input capture is only a hint and can open a library.
export function takePhoto(signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(aborted()); return; }
    const controller = new AbortController(), resources = [];
    const dialog = document.createElement('dialog');
    dialog.className = 'refined-modal photo-camera';
    dialog.setAttribute('aria-label', '写真を撮る');
    dialog.innerHTML = '<header class="refined-header"><h2>写真を撮る</h2><button type="button" class="refined-close" aria-label="撮影をやめる"><img src="/refined/edfe8.svg" alt=""></button></header><video autoplay muted playsinline aria-label="カメラのプレビュー"></video><p role="status">カメラを準備中…</p><button type="button" class="refined-button" data-shutter disabled>撮影する</button>';
    const video = dialog.querySelector('video'), shutter = dialog.querySelector('[data-shutter]'), status = dialog.querySelector('[role=status]');
    let finished = false;
    const finish = (error, photo) => {
      if (finished) return;
      finished = true; controller.abort(); resources.forEach(stop => stop());
      video.srcObject = null; signal.removeEventListener('abort', cancel);
      dialog.close(); dialog.remove();
      error ? reject(error) : resolve(photo);
    };
    const cancel = () => finish(aborted());
    signal.addEventListener('abort', cancel, { once: true });
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    dialog.addEventListener('close', cancel);
    dialog.querySelector('.refined-close').onclick = cancel;
    shutter.onclick = async () => {
      if (shutter.disabled || finished) return;
      shutter.disabled = true;
      try { finish(null, await blobOf(snapshot(video).canvas, 'image/jpeg')); }
      catch (error) { finish(error); }
    };
    document.body.append(dialog); dialog.showModal();
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('この環境ではカメラを使えません。ライブラリから写真を選んでね');
        await openCamera(video, 'environment', resources, controller.signal);
        if (finished) return;
        status.textContent = '写したいものを映して、撮影してね';
        shutter.disabled = false;
      } catch (error) {
        if (finished) return;
        const message = error.name === 'NotAllowedError' || error.name === 'SecurityError'
          ? 'カメラの利用を許可してください。ライブラリから写真を選ぶこともできます'
          : error.name === 'NotFoundError' ? 'カメラが見つかりません。ライブラリから写真を選んでね' : error.message;
        finish(new Error(message));
      }
    })();
  });
}
