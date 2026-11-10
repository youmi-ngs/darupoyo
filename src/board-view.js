// けーじばん: every chore record, selfie and だるぽよ record of the house, newest
// first, pinned as cards. The magnet is the poster's icon; a card without a photo
// shows the poster's gal doing that chore. The entrance shows the newest six.
import { client, houseApi, refresh } from './api.js';
import { ownerActions } from './post-actions.js';
import { galCharacter } from './gal-figure.js';
import { momentPraise } from './moment-praise.js';
import { lockSwipeAxis } from './swipe-axis.js';

const LABELS = { laundry: '洗濯', meal: 'ごはん', dryer: 'ドライヤー', garbage: 'ゴミ捨て', trash: 'ゴミ捨て' };
const PROP = { laundry: 'laundry', meal: 'meal', dryer: 'dryer', garbage: 'trash', trash: 'trash' };
const MAX_PAGES = 20;

// ctx = { nameOf, iconOf(uid) → element, themeOf(uid), galOf(uid, fallback), openPost(posts, index), toast,
//         comments(record, base) → comment section }
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

  async function all(path, targetId) {
    const items = []; let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await houseApi(path + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
      items.push(...result.items); cursor = result.next_cursor;
      if (!cursor || (targetId && items.some(item => item.id === targetId))) break;
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
      ...posts.map(p => ({ type: 'post', id: p.id, at: p.created_at, who: p.user_id, image: p.image, chore: p.chore, gal: p.gal, text: p.caption || p.praise?.text || '', post: p })),
      ...extra.moments.map(m => ({ type: 'moment', id: m.id, at: m.created_at, who: m.user_id, media: m.media_id, text: m.caption || m.praise?.text || ctx.nameOf(m.user_id) + 'のなう', caption: m.caption, praise: m.praise, record: m })),
      ...extra.darupoyo.map(r => ({ type: 'darupoyo', id: r.id, at: r.created_at, who: r.user_id, media: r.media_id, chore: r.chore, text: r.caption || (LABELS[r.chore] || '') + '、だるぽよ', praise: r.praise, record: r })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function picture(card) {
    const box = document.createElement('span'); box.className = 'pin-photo';
    const img = document.createElement('img'); img.alt = ctx.nameOf(card.who) + 'の' + (card.type === 'moment' ? 'なうの写真' : (LABELS[card.chore] || '') + 'の記録');
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
    if (card.type === 'darupoyo' && !card.record.caption) text.hidden = true;
    el.append(magnet, picture(card));
    if (!small) {
      const author = document.createElement('span'); author.className = 'pin-author';
      const authorLabel = document.createElement('small'); authorLabel.textContent = '投稿者';
      const authorName = document.createElement('strong'); authorName.textContent = ctx.nameOf(card.who);
      author.append(authorLabel, authorName);
      const meta = document.createElement('span'); meta.className = 'pin-meta';
      const category = document.createElement('span'); category.className = 'pin-category';
      category.textContent = card.type === 'moment' ? ctx.nameOf(card.who) + 'のなう' : LABELS[card.chore] || '';
      meta.append(category);
      if (card.type !== 'moment') {
        const state = document.createElement('span'); state.className = 'pin-state';
        state.textContent = card.type === 'darupoyo' ? 'だるぽよ' : 'やったよ'; meta.append(state);
      }
      el.append(author, meta);
      if (!text.hidden) el.append(text);
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
    // うちらのなう and だるぽよ cards open here; swipe (or ←→) moves through them in board order.
    const list = cards().filter(c => c.type !== 'post'), start = Math.max(0, list.findIndex(c => c.id === card.id));
    viewer.replaceChildren();
    const close = document.createElement('button'); close.type = 'button'; close.className = 'sheet-close pm-close'; close.setAttribute('aria-label', '閉じる'); close.textContent = '×'; close.onclick = () => viewer.close();
    const count = document.createElement('span'); count.className = 'pm-count pin-viewer-count'; count.hidden = list.length < 2;
    const track = document.createElement('div'); track.className = 'pin-viewer-track';
    track.tabIndex = 0; track.setAttribute('role', 'region'); track.setAttribute('aria-label', 'けーじばんの写真・左右にスワイプで移動');
    lockSwipeAxis(track);
    list.forEach(item => track.append(slide(item)));
    viewer.append(close, count, track);
    const at = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const mark = () => { const k = at(); count.textContent = (k + 1) + ' / ' + list.length; track.children[k]?.querySelector('.pin-photo')?.load?.(); };
    track.onscroll = () => { clearTimeout(track._t); track._t = setTimeout(mark, 40); };
    track.onkeydown = e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); track.scrollTo({ left: (at() + (e.key === 'ArrowRight' ? 1 : -1)) * track.clientWidth, behavior: 'smooth' });
    };
    viewer.showModal();
    requestAnimationFrame(() => { track.style.scrollBehavior = 'auto'; track.scrollLeft = start * track.clientWidth; track.style.scrollBehavior = ''; mark(); });
  }
  function slide(card) {
    const box = document.createElement('div'); box.className = 'pin-viewer-slide';
    const title = document.createElement('h2'); title.className = 'pm-title'; title.textContent = ctx.nameOf(card.who) + (card.type === 'moment' ? 'のなう' : 'の' + (LABELS[card.chore] || '') + '、だるぽよ');
    const time = document.createElement('p'); time.className = 'pm-meta';
    time.textContent = new Intl.DateTimeFormat('ja-JP', { timeZone: dashboard?.timezone || 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(card.at));
    const text = document.createElement('p'); text.className = 'pin-viewer-text'; text.textContent = card.text;
    box.append(picture(card), title, time, text);
    let praise = null;
    if (card.type === 'moment') { // the caption, then the gal's line (#158)
      text.textContent = card.caption || ''; text.hidden = !card.caption;
    }
    // うちらのなう and だるぽよ both carry the gal's line.
    praise = momentPraise(card.praise, ctx.themeOf(card.who)); if (praise) box.append(praise);
    // Housemates can comment on うちらのなう and だるぽよ too, like on chore records.
    // Your own うちらのなう / だるぽよ: edit the words (the gal answers again) or delete it.
    if (card.record && card.who === client.uid) box.append(ownerActions({
      record: card.record, base: card.type === 'moment' ? '/moments' : '/darupoyo', toast: ctx.toast,
      onEdited: updated => {
        if (card.type === 'moment') { text.textContent = updated.caption || ''; text.hidden = !updated.caption; }
        else text.textContent = updated.caption || (LABELS[card.chore] || '') + '、だるぽよ';
        const fresh = momentPraise(updated.praise, ctx.themeOf(card.who)); // the gal answered the new words
        if (praise && fresh) praise.replaceWith(fresh); else if (fresh) text.after(fresh);
        praise = fresh || praise;
        render();
      },
      onDeleted: () => { viewer.close(); void loadExtra(); void refresh().catch(() => {}); },
    }));
    if (card.record && ctx.comments) box.append(ctx.comments(card.record, card.type === 'moment' ? '/moments' : '/darupoyo'));
    return box;
  }
  function render() {
    const list = cards();
    grid.replaceChildren(...list.map((c, k) => cardEl(c, k)));
    status.textContent = list.length ? '' : 'まだ何も貼ってないよ。家事をしたら、ここに貼られるよ';
    mini?.replaceChildren(...list.slice(0, 6).map((c, k) => cardEl(c, k, true)));
    for (let k = list.length; k < 6 && mini; k++) { const empty = document.createElement('span'); empty.className = 'pin-card is-empty'; mini.append(empty); }
  }

  let exitAnimation = null, closeVersion = 0;
  view.querySelector('.board-back').addEventListener('click', () => close());
  function open({ load = true } = {}) {
    closeVersion++; exitAnimation?.cancel(); exitAnimation = null;
    view.inert = false; document.getElementById('house-view').inert = false;
    document.body.classList.add('no-scroll');
    ['house-view', 'room-view'].forEach(id => { document.getElementById(id).hidden = true; });
    view.hidden = false; view.scrollTop = 0; view.querySelector('.board-back').focus();
    if (load) void loadExtra();
  }
  async function close() {
    if (view.hidden || exitAnimation) return;
    const version = ++closeVersion, house = document.getElementById('house-view');
    view.inert = house.inert = true; ctx.onClosing?.();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const style = getComputedStyle(view);
      exitAnimation = view.animate([
        {opacity:style.opacity,transform:style.transform,offset:0,easing:'ease-out'},
        {opacity:1,transform:'translateY(3px) rotate(.6deg)',offset:.25,easing:'ease-in'},
        {opacity:0,transform:'translateY(-52px) rotate(-1deg)',offset:1}
      ], {duration:240,fill:'forwards'});
      await exitAnimation.finished.catch(() => {});
    }
    if (version !== closeVersion) return;
    view.hidden = true; exitAnimation?.cancel(); exitAnimation = null;
    view.inert = house.inert = false; ctx.onClose?.();
    document.getElementById('open-board').focus({preventScroll:true});
  }
  window.addEventListener('darupoyo:recorded', () => void loadExtra());
  window.addEventListener('darupoyo:moment', () => void loadExtra());
  return {
    open, close,
    async openNotification(id, kind) {
      open({ load: false });
      const house = client.house, version = closeVersion;
      const find = () => cards().find(c => c.id === id && c.type === kind);
      let card = find();
      if (!card && ['post', 'moment', 'darupoyo'].includes(kind)) {
        status.textContent = '通知の記録を開いているよ…';
        status.setAttribute('role', 'status');
        const key = kind === 'post' ? 'posts' : kind === 'moment' ? 'moments' : 'darupoyo';
        // Fetch only the relevant record list, stopping at the target page.
        // Neither unrelated lists nor historical photo downloads block the detail.
        const records = await all('/' + key, id);
        if (house !== client.house || version !== closeVersion || view.hidden) return;
        if (kind === 'post') posts = records.map(ctx.convertPost); else extra[key] = records;
        render(); card = find();
      }
      if (house !== client.house || version !== closeVersion || view.hidden) return;
      if (card) openCard(card); else ctx.toast("この投稿は見つからないか、削除されているよ");
    },
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
