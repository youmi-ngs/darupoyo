// #175: a finished send ends with a little celebration, not just a new screen.
const BITS = '<i></i>'.repeat(12);

// A check with confetti, for a done screen without a photo.
export const celebrationHTML = () => `<div class="record-celebration" aria-hidden="true"><span class="record-confetti">${BITS}</span><img class="refined-success-art" src="/refined/3759b.svg" alt=""></div>`;

// Confetti and a check badge over a photo. The box must be positioned.
export function burst(box) {
  const layer = document.createElement('span');
  layer.className = 'done-burst'; layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `<span class="record-confetti">${BITS}</span><span class="done-badge"><svg viewBox="0 0 64 64"><path d="M18 33l10 10 18-21"/></svg></span>`;
  box.append(layer);
  setTimeout(() => layer.querySelector('.record-confetti')?.remove(), 1600);
  return layer;
}

// The two ways out of a done screen (#176): the board, or back to the entrance.
export const doneActionsHTML = (board = 'け〜じばんをちぇけらする') =>
  `<div class="done-actions"><button type="button" class="btn btn-main" data-done="board">${board}</button><button type="button" class="btn btn-sub" data-done="entry">げんかんにもどる</button></div>`;
