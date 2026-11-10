// 共有範囲: a pill on every posting screen ("🏠 実家・寮 ›"). Tapping it opens a sheet to
// pick which of my houses get the post too. The house I am in is always included; the post
// starts as "this house only" every time, so nothing goes further by accident.
import { client } from './api.js';
import './audience.css';

const HOUSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" fill="currentColor"/></svg>';

export function audienceChip() {
  const here = client.house, houses = client.houses || [];
  const others = houses.filter(h => h.id !== here);
  const picked = new Set();
  const nameOf = id => houses.find(h => h.id === id)?.name || 'このハウス';
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'audience-chip';
  const label = () => others.length && picked.size === others.length ? 'すべてのハウス' : [here, ...picked].map(nameOf).join('・');
  const draw = () => {
    chip.innerHTML = HOUSE + '<span class="audience-chip-text"></span><span class="audience-chip-more" aria-hidden="true">›</span>';
    chip.querySelector('.audience-chip-text').textContent = label();
    chip.setAttribute('aria-label', '共有範囲：' + label() + '。押すと変えられるよ');
  };
  draw();

  chip.onclick = () => {
    const sheet = document.createElement('dialog'); sheet.className = 'audience-sheet'; sheet.setAttribute('aria-labelledby', 'audience-title');
    sheet.innerHTML = '<h2 id="audience-title">どこに見せる？</h2><ul class="audience-list"></ul><p class="audience-note"></p><button type="button" class="audience-done">けってい</button>';
    const list = sheet.querySelector('ul'), next = new Set(picked);
    const row = (text, checked, disabled, onChange, tag) => {
      const li = document.createElement('li'), box = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.checked = checked; input.disabled = disabled; input.onchange = () => onChange(input.checked);
      const name = document.createElement('span'); name.textContent = text;
      box.append(input, name);
      if (tag) { const t = document.createElement('small'); t.textContent = tag; box.append(t); }
      li.append(box); list.append(li); return input;
    };
    let all = null; const boxes = new Map();
    const sync = () => { if (all) all.checked = others.length > 0 && next.size === others.length; boxes.forEach((input, id) => { input.checked = next.has(id); }); };
    if (others.length) all = row('すべてのハウス', false, false, on => { next.clear(); if (on) others.forEach(h => next.add(h.id)); sync(); });
    row(nameOf(here), true, true, () => {}, 'いまのハウス');
    others.forEach(h => boxes.set(h.id, row(h.name, false, false, on => { on ? next.add(h.id) : next.delete(h.id); sync(); })));
    sync();
    sheet.querySelector('.audience-note').textContent = others.length ? 'えらんだハウスのけーじばんにも出て、そこのみんなにも見えるよ' : 'ほかのハウスにも住むと、いっしょに見せられるよ';
    const close = () => sheet.close();
    sheet.querySelector('.audience-done').onclick = () => { picked.clear(); next.forEach(id => picked.add(id)); draw(); close(); };
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
    sheet.addEventListener('close', () => { sheet.remove(); chip.focus({ preventScroll: true }); });
    document.body.append(sheet); sheet.showModal();
  };
  // The other houses to post to as well (the API's share_to).
  return { el: chip, shareTo: () => [...picked] };
}
