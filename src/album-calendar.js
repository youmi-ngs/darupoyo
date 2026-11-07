// Album calendar (#91): pick a day to jump to that day's page of the album.
const WD = ['日', '月', '火', '水', '木', '金', '土'];
let dialog;

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog'); dialog.className = 'album-calendar'; dialog.setAttribute('aria-labelledby', 'cal-title');
  dialog.innerHTML = '<div class="cal-head"><button type="button" class="cal-nav" data-step="-1" aria-label="前の月">‹</button><h2 id="cal-title"></h2><button type="button" class="cal-nav" data-step="1" aria-label="次の月">›</button></div>'
    + '<div class="cal-grid" role="grid"></div><p class="cal-note">写真のある日をタップすると、その日のアルバムにとぶよ</p><button type="button" class="btn cal-close">閉じる</button>';
  dialog.querySelector('.cal-close').onclick = () => dialog.close();
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return dialog;
}

// days: [{ day: 'YYYY-MM-DD', count }] — the album's pages. onPick(day) jumps there.
export function openCalendar({ today, selected, days, onPick }) {
  const d = ensureDialog(), byDay = new Map(days.map(x => [x.day, x.count]));
  let [y, m] = (selected || today).split('-').map(Number);
  const draw = () => {
    d.querySelector('#cal-title').textContent = y + '年' + m + '月';
    const grid = d.querySelector('.cal-grid'); grid.replaceChildren();
    WD.forEach(w => { const h = document.createElement('span'); h.className = 'cal-wd'; h.textContent = w; grid.append(h); });
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let i = 0; i < first; i++) grid.append(document.createElement('span'));
    for (let n = 1; n <= last; n++) {
      const day = y + '-' + String(m).padStart(2, '0') + '-' + String(n).padStart(2, '0');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cal-day'; b.textContent = n; b.dataset.day = day;
      const count = byDay.get(day);
      b.disabled = !count;
      if (count) { b.classList.add('has-photos'); b.setAttribute('aria-label', m + '月' + n + '日 ' + count + '枚'); }
      if (day === today) b.classList.add('is-today');
      if (day === selected) b.setAttribute('aria-current', 'date');
      b.onclick = () => { d.close(); onPick(day); };
      grid.append(b);
    }
  };
  d.querySelectorAll('.cal-nav').forEach(b => { b.onclick = () => { m += Number(b.dataset.step); if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } draw(); }; });
  draw();
  d.showModal();
}
