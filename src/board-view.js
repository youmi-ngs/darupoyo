// けーじばん: every chore record, selfie and だるぽよ record of the house, newest
// first, pinned as cards. The magnet is the poster's icon; a card without a photo
// shows the poster's gal doing that chore. The entrance shows the newest six.
import { client, houseApi } from './api.js';
import { galCharacter } from './gal-figure.js';
import { momentPraise } from './moment-praise.js';

const LABELS = { laundry: '洗濯', meal: 'ごはん', dryer: 'ドライヤー', garbage: 'ゴミ捨て', trash: 'ゴミ捨て' };
const PROP = { laundry: 'laundry', meal: 'meal', dryer: 'dryer', garbage: 'trash', trash: 'trash' };
const MAX_PAGES = 20;

// ctx = { nameOf, iconOf(uid) → element, themeOf(uid), galOf(uid, fallback), openPost(posts, index), toast }
export function setupBoardView(ctx) {
  const view = document.getElementById('board-view'), grid = view.querySelector('.pin-grid'), status = view.querySelector('.pin-status');
  const mini = document.getElementById('entry-board-grid');
  const viewer = document.createElement('dialog'); viewer.className = 'pin-viewer'; viewer.setAttribute('aria-label', 'けーじばんの写真');
  document.body.append(viewer);
  viewer.addEventListener('click', e => { if (e.target === viewer) viewer.close(); });
  let dashboard = null, posts = [], extra = { moments: [], darupoyo: [] }, signature = '', loading = 0;
  const urls = new Map();
  const media = id => {
    if (!urls.has(id)) urls.set(id, houseApi('/media/' + id).then(URL.createObjectURL).catch(e => { urls.delete(id); throw e; }));
    return urls.get(id);
  };
  const lazy = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { lazy.unobserve(e.target); e.target.load?.(); } }));

  async function all(path) {
    const items = []; let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await houseApi(path + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
      items.push(...result.items); cursor = result.next_cursor;
      if (!cursor) break;
    }
    return items;
  }
  async function loadExtra() {
    const version = ++loading, house = client.house;
    // #144: say that the selfies and だるぽよ records are still on their way.
    const waiting = document.createElement('p'); waiting.className = 'loading-row pin-loading'; waiting.textContent = 'みんなの記録を読み込み中…';
    view.querySelector('.pin-loading')?.remove(); grid.before(waiting);
    try {
      const [moments, darupoyo] = await Promise.all([all('/moments'), all('/darupoyo').catch(() => [])]);
      if (version !== loading || house !== client.house) return;
      extra = { moments, darupoyo }; render();
    } catch (e) { if (version === loading) status.textContent = e.message; }
    finally { if (version === loading) waiting.remove(); }
  }

  // One list for both boards, newest first.
  function cards() {
    return [
      ...posts.map(p => ({ type: 'post', id: p.id, at: p.created_at, who: p.user_id, image: p.image, chore: p.chore, gal: p.gal, text: p.praise?.text || '', post: p })),
      ...extra.moments.map(m => ({ type: 'moment', id: m.id, at: m.created_at, who: m.user_id, media: m.media_id, text: m.caption || m.praise?.text || '今のじぶん📷', caption: m.caption, praise: m.praise })),
      ...extra.darupoyo.map(r => ({ type: 'darupoyo', id: r.id, at: r.created_at, who: r.user_id, media: r.media_id, chore: r.chore, text: r.caption || (LABELS[r.chore] || '') + '、だるぽよ' })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function picture(card) {
    const box = document.createElement('span'); box.className = 'pin-photo';
    const img = document.createElement('img'); img.alt = ctx.nameOf(card.who) + 'の' + (card.type === 'moment' ? '自撮り' : (LABELS[card.chore] || '') + 'の記録');
    if (card.image) { img.src = card.image; box.append(img); return box; }
    if (card.media) {
      box.classList.add('is-loading'); box.append(img);
      box.load = () => media(card.media).then(url => { img.src = url; box.classList.remove('is-loading'); }, () => { box.classList.remove('is-loading'); });
      lazy.observe(box); return box;
    }
    // No photo: the poster's gal doing it, in the poster's color.
    box.classList.add('is-drawing');
    box.innerHTML = galCharacter(ctx.galOf(card.who, card.gal), ctx.themeOf(card.who), card.type === 'darupoyo' ? 'darupoyo' : PROP[card.chore]);
    box.setAttribute('role', 'img'); box.setAttribute('aria-label', img.alt);
    return box;
  }
  function cardEl(card, k, small) {
    const el = document.createElement(small ? 'span' : 'button'); el.className = 'pin-card pin-' + card.type;
    if (!small) el.type = 'button';
    el.style.setProperty('--r', ((k * 7) % 5 - 2) * 1.2 + 'deg');
    const magnet = ctx.iconOf(card.who); magnet.classList.add('pin-magnet');
    const text = document.createElement('span'); text.className = 'pin-text'; text.textContent = card.text;
    el.append(magnet, picture(card));
    if (!small) {
      el.append(text);
      el.setAttribute('aria-label', ctx.nameOf(card.who) + '：' + card.text);
      el.addEventListener('click', () => openCard(card));
    }
    return el;
  }
  function openCard(card) {
    if (card.type === 'post') {
      const list = cards().filter(c => c.type === 'post');
      ctx.openPost(list.map(c => c.post), list.findIndex(c => c.id === card.id));
      return;
    }
    viewer.replaceChildren();
    const close = document.createElement('button'); close.type = 'button'; close.className = 'sheet-close pm-close'; close.setAttribute('aria-label', '閉じる'); close.textContent = '×'; close.onclick = () => viewer.close();
    const title = document.createElement('h2'); title.className = 'pm-title'; title.textContent = ctx.nameOf(card.who) + (card.type === 'moment' ? 'の今' : 'の' + (LABELS[card.chore] || '') + '、だるぽよ');
    const time = document.createElement('p'); time.className = 'pm-meta';
    time.textContent = new Intl.DateTimeFormat('ja-JP', { timeZone: dashboard?.timezone || 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(card.at));
    const text = document.createElement('p'); text.className = 'pin-viewer-text'; text.textContent = card.text;
    const pic = picture(card); pic.load?.();
    viewer.append(close, pic, title, time, text);
    if (card.type === 'moment') { // the caption, then the gal's line (#158)
      text.textContent = card.caption || ''; text.hidden = !card.caption;
      const praise = momentPraise(card.praise); if (praise) viewer.append(praise);
    }
    viewer.showModal();
  }
  function render() {
    const list = cards();
    grid.replaceChildren(...list.map((c, k) => cardEl(c, k)));
    status.textContent = list.length ? '' : 'まだ何も貼ってないよ。家事をしたら、ここに貼られるよ';
    mini?.replaceChildren(...list.slice(0, 6).map((c, k) => cardEl(c, k, true)));
    for (let k = list.length; k < 6 && mini; k++) { const empty = document.createElement('span'); empty.className = 'pin-card is-empty'; mini.append(empty); }
  }

  view.querySelector('.board-back').addEventListener('click', () => close());
  function open() {
    document.body.classList.add('no-scroll');
    ['house-view', 'room-view'].forEach(id => { document.getElementById(id).hidden = true; });
    view.hidden = false; view.scrollTop = 0; view.querySelector('.board-back').focus();
    void loadExtra();
  }
  function close() { view.hidden = true; ctx.onClose?.(); }
  window.addEventListener('darupoyo:recorded', () => void loadExtra());
  window.addEventListener('darupoyo:moment', () => void loadExtra());
  return {
    open, close,
    update(data, allPosts) {
      const switched = dashboard && dashboard.house.id !== data.house.id;
      dashboard = data; posts = allPosts;
      if (switched) { extra = { moments: [], darupoyo: [] }; urls.forEach(p => p.then(URL.revokeObjectURL, () => {})); urls.clear(); }
      const next = JSON.stringify([data.house.id, data.state.darupoyo_updated_at, Object.keys(data.house.members)]);
      render();
      if (next !== signature) { signature = next; void loadExtra(); }
    },
  };
}
