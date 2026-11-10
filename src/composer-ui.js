import { limitInput } from './text-limits.js';

export function captionCounter(input) {
  const count = document.createElement('span'); count.className = 'caption-count';
  count.setAttribute('aria-hidden', 'true');
  input.setAttribute('aria-label', input.required ? 'ひとこと' : 'ひとこと（かかなくてもおけ♡）');
  input.after(count); limitInput(input, 30, count);
  return count;
}

// A secondary add action makes captions visibly optional without explanatory text.
export function optionalCaption(input, count, panel = input.closest('label')) {
  if (input.required) return;
  if (!panel) {
    panel = document.createElement('div'); input.before(panel); panel.append(input, count);
  } else {
    panel.querySelector('span:not(.caption-count)')?.setAttribute('hidden', '');
  }
  panel.classList.add('optional-caption-panel');
  const button = document.createElement('button'); button.type = 'button'; button.className = 'caption-add';
  panel.before(button);
  panel.id ||= 'caption-panel-' + crypto.randomUUID(); button.setAttribute('aria-controls',panel.id);
  let expanded = false, hidden = false;
  const render = () => {
    button.hidden = hidden; panel.hidden = hidden || !expanded;
    button.setAttribute('aria-expanded',String(expanded));
    button.textContent = expanded ? '− ひとこと' : input.value ? '✎ ひとことを編集' : '＋ ひとこと';
  };
  button.onclick = () => { expanded = !expanded; render(); if (expanded) input.focus(); };
  input.addEventListener('input', render);
  new MutationObserver(()=>{button.disabled=input.disabled;}).observe(input,{attributes:true,attributeFilter:['disabled']});
  render();
  return {reset(){expanded=false;hidden=false;render();},setHidden(value){hidden=value;render();}};
}

export function photoPreview(image) {
  image.classList.add('composer-thumbnail');
  if (image instanceof HTMLCanvasElement) {
    const fit = () => {
      const frame = image.closest('.capture-frame,.now-frame');
      if (!frame) return;
      const scale = Math.min(180 / image.width, 180 / image.height);
      frame.style.setProperty('--preview-width', image.width * scale + 'px');
      frame.style.setProperty('--preview-height', image.height * scale + 'px');
    };
    new MutationObserver(fit).observe(image, { attributes:true, attributeFilter:['width','height'] }); fit();
  }
  image.tabIndex = 0; image.setAttribute('role', 'button');
  image.setAttribute('aria-label', '写真を拡大して確認');
  const open = () => {
    const dialog = document.createElement('dialog'); dialog.className = 'photo-preview-dialog';
    dialog.setAttribute('aria-label', '投稿する写真の確認');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '閉じる');
    const full = document.createElement('img'); full.alt = '投稿する写真';
    full.src = image instanceof HTMLCanvasElement ? image.toDataURL('image/jpeg') : image.src;
    if (image.classList.contains('is-mirrored')) full.style.transform = 'scaleX(-1)';
    close.onclick = () => dialog.close(); dialog.append(close, full); document.body.append(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); if (image.isConnected) image.focus(); });
    dialog.showModal(); close.focus();
  };
  image.addEventListener('click', open);
  image.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
}
