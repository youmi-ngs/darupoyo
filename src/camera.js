// Shared helpers for capture flows: abort handling, buttons, camera and snapshots.
export const aborted = () => new DOMException('中止しました', 'AbortError');
export const check = signal => { if (signal.aborted) throw aborted(); };

export const blobOf = (canvas, type = 'image/png') => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('写真を作れませんでした')), type, .88));

// Adds a main button and resolves when it is tapped.
export function action(root, text, signal) {
  return new Promise((resolve, reject) => {
    const button = document.createElement('button'); button.className = 'btn btn-main'; button.textContent = text; root.append(button);
    const abort = () => { button.remove(); reject(aborted()); };
    signal.addEventListener('abort', abort, { once: true });
    button.onclick = () => { button.remove(); signal.removeEventListener('abort', abort); resolve(); };
  });
}

// Shows seconds counting down (seconds … 1, then 0) once per second; rejects when aborted.
export function countdown(seconds, show, signal) {
  return new Promise((resolve, reject) => {
    let left = seconds; show(left);
    const abort = () => { clearInterval(timer); reject(aborted()); };
    const timer = setInterval(() => {
      left--; show(left);
      if (left <= 0) { clearInterval(timer); signal.removeEventListener('abort', abort); resolve(); }
    }, 1000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

// Records how long a step took as a Performance entry (DevTools > Performance, or
// performance.getEntriesByType('measure')). Used to find slow steps for #98; it changes no behavior.
export function timing(name, startedAt) {
  try { performance.measure('darupoyo:' + name, { start: startedAt, end: performance.now() }); } catch {}
}

// Rejects when the signal aborts; the returned cleanup removes the listener.
export function onAbort(signal, reject) {
  const abort = () => reject(aborted());
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}

export async function openCamera(video, facingMode, resources, signal) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
  if (signal.aborted) { stream.getTracks().forEach(t => t.stop()); check(signal); }
  resources.push(() => stream.getTracks().forEach(t => t.stop())); check(signal);
  video.srcObject = stream; await video.play();
  return stream;
}

export function snapshot(video) {
  const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0);
  return { canvas, ctx };
}

export async function openMic(resources, signal) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  if (signal.aborted) { stream.getTracks().forEach(t => t.stop()); check(signal); }
  resources.push(() => stream.getTracks().forEach(t => t.stop())); check(signal);
  return stream;
}


// Match the album's 5:6 photo frame without stretching the image.
export function photoCrop(width, height) {
  const cropWidth = Math.min(width, height * 5 / 6);
  const cropHeight = cropWidth * 6 / 5;
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight };
}
