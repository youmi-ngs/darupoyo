import { setupMoments } from './moments.js';
import { startAmbience } from './ambience.js';
import { client, start, houseApi, refresh, inviteCode, logout, switchHouse } from './api.js';
import { capture } from './media.js';
import { pushState, pushOn, enablePush, disablePush, syncPushGal, listenInApp } from './push.js';
import { sfx, galVoice, soundOn, setSound } from './sfx.js';
import { TASKS, ORDER, REWARD, figSvg, MEAL_SVG, GALS, GAL_IDS, ITEM_SVG, ROOM_THEMES } from './data.js';
(() => {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let ME = '', RESIDENTS = [], dashboard = null;
  const nameOf = uid => dashboard?.house.members[uid]?.display_name || '住人';
  const toApi = id => id === 'trash' ? 'garbage' : id;
  const fromApi = id => id === 'garbage' ? 'trash' : id;
  let savingGoals = Promise.resolve(), pendingGoals = 0;
  function saveGoals() {
    const chores = state.board.map(b => toApi(b.id)); pendingGoals++;
    savingGoals = savingGoals.then(() => houseApi('/goals', { chores }, 'PUT')).catch(e => toast(e.message)).finally(async () => { pendingGoals--; if (!pendingGoals) await refresh().catch(e => toast(e.message)); });
  }
  const state = { board: [], posts: [], originals: {}, doneToday: {}, history: [], newRoom: null };
  const WD = ['日','月','火','水','木','金','土'];
  let dayOffset = 0;
  const dayLabel = off => { const d = new Date((dashboard?.state.day || new Date().toISOString().slice(0,10)) + 'T12:00:00+09:00'); d.setUTCDate(d.getUTCDate()+off); return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+'（'+WD[d.getUTCDay()]+'）'; };
  const $ = (id) => document.getElementById(id);
  const sheet = $('sheet'), sheetBody = $('sheet-body');
  const cleared = () => new Set(state.posts.map((p) => p.who));
  const isFirstToday = (id) => !(state.doneToday[id] || []).length;
  const kindText = { pose: 'のポーズ写真（切り抜き）', photo: 'の写真', sound: 'の検出記録', rhythm: 'のリズム記録' };

  function shotEl(p) {
    const d = document.createElement('div');
    d.className = 'shot shot-' + p.kind;
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', nameOf(p.who) + '・' + TASKS[p.task].label + kindText[p.kind]);
    d.innerHTML = p.kind === 'pose' ? '<span class="mini-sun"></span>' + figSvg(p.pose)
      : p.kind === 'photo' ? '<span class="mini-sun"></span>' + MEAL_SVG
      : '<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
    if (p.image) { const img = document.createElement('img'); img.src = p.image; img.alt = TASKS[p.task].label + 'の記録'; d.replaceChildren(img); }
    if (p.voice_media_id) { const v = document.createElement('span'); v.className = 'voice-badge'; v.setAttribute('aria-hidden', 'true'); v.textContent = '♪'; d.append(v); }
    return d;
  }

  const dayName = (off) => off === dayOffset ? '今日' : dayLabel(off);
  function openLog(who) {
    $('log-title').textContent = (nameOf(who)) + 'のアルバム';
    const list = $('log-list'); list.replaceChildren();
    const days = [{ off: dayOffset, posts: state.posts }, ...state.history];
    const all = [];
    const SLOT = ['laundry', 'meal', 'trash'];
    days.forEach((d) => d.posts.filter((p) => p.who === who && p.kind !== 'sound').sort((a, b) => SLOT.indexOf(a.task) - SLOT.indexOf(b.task)).forEach((p) => all.push({ p, day: dayName(d.off), off: d.off })));
    days.forEach((d) => {
      const mine = all.filter((x) => x.off === d.off);
      const sec = document.createElement('section'); sec.className = 'log-day' + (mine.length ? '' : ' is-empty');
      const h = document.createElement('h3'); h.textContent = (d.off === dayOffset ? '今日 ' : '') + dayLabel(d.off);
      const n = document.createElement('span'); n.className = 'log-n'; n.textContent = mine.length ? mine.length + '' : '−'; h.append(n);
      sec.append(h);
      const g = document.createElement('div'); g.className = 'log-grid';
      mine.forEach((x, k) => { const f = document.createElement('button'); f.type = 'button'; f.className = 'fp'; f.style.setProperty('--r', ((k % 3) - 1) * 3 + 'deg'); f.append(shotEl(x.p)); f.setAttribute('aria-label', dayLabel(d.off) + ' ' + x.p.time + 'の' + TASKS[x.p.task].label); f.addEventListener('click', () => openPhotos(all, all.indexOf(x))); g.append(f); });
      for (let q = mine.length; q < 6; q++) { const e = document.createElement('span'); e.className = 'log-empty'; g.append(e); }
      g.classList.add(mine.length > 6 ? 'n-many' : 'n-more');
      sec.append(g);
      list.append(sec);
    });
    const dots = $('log-dots'); dots.replaceChildren();
    days.forEach(() => dots.append(document.createElement('i')));
    const mark = () => { const k = Math.round(list.scrollLeft / list.clientWidth); [...dots.children].forEach((d, q) => d.classList.toggle('on', q === k)); };
    list.onscroll = () => { clearTimeout(list._t); list._t = setTimeout(mark, 50); };
    $('log-total').textContent = all.length + '枚';
    $('log-modal').showModal();
    requestAnimationFrame(() => { list.scrollLeft = 0; mark(); });
  }
  $('log-close').addEventListener('click', () => $('log-modal').close());
  $('log-modal').addEventListener('click', (e) => { if (e.target === $('log-modal')) $('log-modal').close(); });

  function openPhotos(items, start) {
    const track = $('pm-track'); track.replaceChildren();
    items.forEach(({ p, day }) => {
      const sl = document.createElement('div'); sl.className = 'pm-slide';
      sl.innerHTML = '<div class="pm-photo"></div><h2 class="pm-title"></h2><p class="pm-meta"></p><div class="verdict"><span class="gal-slot"></span><p class="bubble"><span class="gal-text"></span></p></div><p class="pm-get"><span class="tl-get"></span> をゲット</p>';
      sl.querySelector('.pm-photo').append(shotEl(p));
      sl.querySelector('.pm-title').textContent = nameOf(p.who) + 'の' + TASKS[p.task].label;
      sl.querySelector('.pm-meta').textContent = (day || '今日') + ' ' + p.time + '　' + ({ pose: 'ポーズ', photo: '写真', sound: '音', rhythm: 'リズム' })[p.kind] + 'でクリア';
      const pg = galOf(p);
      sl.querySelector('.gal-slot').outerHTML = galIcon(pg);
      sl.querySelector('.gal-text').textContent = postLine(p);
      sl.querySelector('.tl-get').textContent = REWARD[p.task].item;
      if (p.voice_media_id) sl.querySelector('.pm-meta').after(voiceButton(() => voiceOf(p.voice_media_id)));
      const reactions = document.createElement('div'); reactions.className = 'reaction-row';
      ['heart','clap','sparkles'].forEach((emoji,i) => { const b=document.createElement('button'); b.textContent=['♥','👏','✨'][i]+' '+Object.values(p.reactions||{}).filter(v=>v===emoji).length; b.onclick=async()=>{ try { await houseApi('/posts/'+p.id+'/reaction',{emoji},'PUT'); b.textContent=['♥','👏','✨'][i]+' ✓'; await refresh(); } catch(e) { toast(e.message); } }; reactions.append(b); }); sl.append(reactions);
      track.append(sl);
    });
    const dots = $('pm-dots'); dots.replaceChildren(); dots.hidden = items.length < 2;
    if (items.length <= 12) items.forEach(() => dots.append(document.createElement('i')));
    const cnt = $('pm-count'); cnt.hidden = items.length < 2;
    const mark = () => { const k = Math.round(track.scrollLeft / track.clientWidth); [...dots.children].forEach((d, q) => d.classList.toggle('on', q === k)); cnt.textContent = (k + 1) + ' / ' + items.length; };
    track.onscroll = () => { clearTimeout(track._t); track._t = setTimeout(mark, 40); };
    $('photo-modal').showModal();
    requestAnimationFrame(() => { track.style.scrollBehavior = 'auto'; track.scrollLeft = start * track.clientWidth; track.style.scrollBehavior = ''; mark(); });
  }
  function openPhoto(p, day) { openPhotos([{ p, day }], 0); }
  $('pm-close').addEventListener('click', () => $('photo-modal').close());
  $('photo-modal').addEventListener('close', () => playing?.pause());
  $('photo-modal').addEventListener('click', (e) => { if (e.target === $('photo-modal')) $('photo-modal').close(); });

  // ---------- gal AIs ----------
  let galPref = 'random';
  try { galPref = localStorage.getItem('cyl-gal') || 'random'; } catch (e) {}
  const pickGal = () => galPref !== 'random' && GALS[galPref] ? galPref : GAL_IDS[Math.floor(Math.random() * GAL_IDS.length)];
  const galOf = (p) => p.gal || GAL_IDS[[...(p.time + nameOf(p.who) + p.task)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % GAL_IDS.length];
  const lineKey = (id, kind, mode, fig) => {
    if (mode === 'original-new') return 'original_new';
    if (mode === 'original-copy') return 'original_copy';
    if (id === 'laundry') return kind === 'sound' ? 'laundry_sound' : (fig === 8 || fig == null ? 'laundry_pose' : 'original_new');
    if (id === 'trash') return fig === 6 ? 'trash_santa' : fig === 7 ? 'trash_thief' : 'original_new';
    return id;
  };
  const postLine = (p) => p.galLine || GALS[galOf(p)].lines[lineKey(p.task, p.kind, null, p.pose)];
  const galIcon = (g) => '<span class="gal-face" style="background:' + GALS[g].bg + '">' + GALS[g].svg + '</span>';
  function renderGalPicker() {
    const box = $('gal-picker'); if (!box) return; box.replaceChildren();
    const mk = (id) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gal-card' + (galPref === id ? ' is-on' : ''); b.setAttribute('aria-pressed', galPref === id ? 'true' : 'false');
      if (id === 'random') { b.innerHTML = '<span class="gal-face gal-random">' + GAL_IDS.map((g) => '<i>' + GALS[g].svg + '</i>').join('') + '</span><b>ノリで</b><small>毎回ちがうギャルがほめる</small>'; }
      else { b.innerHTML = galIcon(id) + '<small></small><em></em>'; b.setAttribute('aria-label', GALS[id].name); b.querySelector('small').textContent = GALS[id].tag; b.querySelector('em').textContent = '「' + GALS[id].title + '」'; }
      b.addEventListener('click', () => { galPref = id; try { localStorage.setItem('cyl-gal', id); } catch (e) {} renderGalPicker(); syncPushGal(id); if (GALS[id]) galVoice(id, GALS[id].title); });
      return b;
    };
    GAL_IDS.forEach((g) => box.append(mk(g)));
    box.append(mk('random'));
    const cur = $('gal-current');
    if (cur) cur.innerHTML = galPref === 'random' ? '<span class="gal-face gal-random">' + GAL_IDS.map((g) => '<i>' + GALS[g].svg + '</i>').join('') + '</span><small>ノリで</small>' : galIcon(galPref);
    if (cur) cur.setAttribute('aria-label', galPref === 'random' ? 'ノリで' : GALS[galPref].name);
  }

  // ---------- house ----------
  function renderRooms() {
    const lit = cleared();
    const chipsBox = $('door-chips'); chipsBox.replaceChildren();
    RESIDENTS.forEach((r) => {
      const slot = document.querySelector('.door-slot[data-who="' + r.who + '"]');
      const mine = state.posts.filter((p) => p.who === r.who);
      const on = lit.has(r.who);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'door w-' + r.color + (on ? ' is-lit' : '') + (state.newRoom === r.who ? ' is-new' : '');
      b.style.setProperty('--tint', ROOM_THEMES[roomTheme(r.who)].accent);
      b.setAttribute('aria-label', nameOf(r.who) + 'の部屋：' + (mine.length ? '今日' + mine.length + '個クリア' : 'まだ') + '。タップで中に入る');
      b.innerHTML = '<span class="door-window" aria-hidden="true"></span><span class="door-plate"></span><span class="door-pic"></span><span class="door-knob" aria-hidden="true"></span>';
      b.querySelector('.door-plate').textContent = nameOf(r.who);
      const pic = b.querySelector('.door-pic');
      if (mine.length) {
        const f = document.createElement('span'); f.className = 'frame'; f.append(shotEl(mine[0])); pic.append(f);
        if (mine.length > 1) { const m = document.createElement('span'); m.className = 'door-more'; m.textContent = '+' + (mine.length - 1); pic.append(m); }
      } else { const e = document.createElement('span'); e.className = 'door-empty'; pic.append(e); }
      pic.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:100%;gap:2px';
      b.addEventListener('click', () => showRoom(r.who));
      slot.replaceChildren(b);
      const col = document.createElement('div');
      [...new Set(mine.map((p) => p.task))].forEach((t) => { const c = document.createElement('span'); c.className = 'chore m-' + TASKS[t].color; c.textContent = TASKS[t].label; col.append(c); });
      chipsBox.append(col);
    });
    // map
    document.querySelectorAll('[data-chore-map]').forEach((c) => c.classList.toggle('is-done', (state.doneToday[c.dataset.choreMap] || []).length > 0));
    document.querySelectorAll('[data-who-map]').forEach((c) => c.classList.toggle('is-lit', lit.has(c.dataset.whoMap)));
    state.newRoom = null;
    // chore spots in the plan
    document.querySelectorAll('[data-chore]').forEach((el) => {
      const id = el.dataset.chore, doers = state.doneToday[id] || [];
      el.classList.toggle('is-done', doers.length > 0);
      el.classList.toggle('is-mine', id !== 'meal' && doers.includes(ME));
      el.classList.toggle('is-sparkle', doers.includes(ME));
      if (!el.querySelector(':scope > .sparkles')) { const sp = document.createElement('span'); sp.className = 'sparkles'; sp.setAttribute('aria-hidden', 'true'); for (let q = 0; q < 6; q++) { const st = document.createElement('i'); st.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="' + (q % 2 ? '#FFF4A8' : '#FFFFFF') + '" stroke="#3B2560" stroke-width="1.4" stroke-linejoin="round"/></svg>'; sp.append(st); } el.append(sp); }
      el.setAttribute('aria-label', TASKS[id].label + 'をはじめる' + (doers.length ? '（今日やった人：' + doers.map(nameOf).join('、') + '）' : ''));
      const dots = el.querySelector('.who-dots'); dots.replaceChildren();
      doers.forEach((w) => { const r = RESIDENTS.find((x) => x.who === w); const d = document.createElement('span'); d.className = 'who-dot m-' + r.color; d.textContent = nameOf(w).slice(0,1); d.setAttribute('aria-hidden', 'true'); dots.append(d); });
    });
  }
  document.querySelectorAll('[data-chore]').forEach((el) => el.addEventListener('click', () => {
    const id = el.dataset.chore;
    if (id !== 'meal' && (state.doneToday[id] || []).includes(ME)) { toast('今日の' + TASKS[id].label + 'はクリア済み'); return; }
    // 冷蔵庫の「今日やること」は自分で貼ったものだけ。ここでは勝手に貼らない（#23）。
    openSheet(id);
  }));

  function renderKitchen() {
    const mb = $('mini-board'); mb.replaceChildren();
    state.board.forEach((b) => { const i = document.createElement('i'); i.className = 'mini-mag m-' + TASKS[b.id].color; mb.append(i); });
    const fp = $('fridge-photos'); fp.replaceChildren();
    $('fp-count').textContent = state.posts.length ? state.posts.length + '枚' : '';
    if (!state.posts.length) { const e = document.createElement('p'); e.className = 'board-empty'; e.textContent = 'まだ1枚もない。だれが最初に貼る？'; fp.append(e); }
    const fps = [...state.posts].sort((a, b) => toMin(b.time) - toMin(a.time)); fps.forEach((p, k) => {
      const r = RESIDENTS.find((x) => x.who === p.who);
      const f = document.createElement('button'); f.type = 'button'; f.className = 'fp'; f.style.setProperty('--r', ((k % 3) - 1) * 4 + 'deg');
      f.innerHTML = '<span class="fp-mag m-' + r.color + '" aria-hidden="true"></span>';
      f.append(shotEl(p));
      const c = document.createElement('span'); c.className = 'fp-cap'; c.textContent = nameOf(p.who) + '\n' + p.time; f.append(c);
      const t = document.createElement('span'); t.className = 'fp-task'; t.textContent = TASKS[p.task].label; f.append(t);
      f.setAttribute('aria-label', p.time + ' ' + nameOf(p.who) + 'の' + TASKS[p.task].label);
      f.addEventListener('click', () => openPhotos(fps.map((x) => ({ p: x, day: '今日' })), k));
      fp.append(f);
    });
    const mp = $('mini-photos'); mp.replaceChildren();
    state.posts.slice(0, 3).forEach(() => mp.append(document.createElement('i')));
    const n = Object.values(dashboard?.lights || {}).filter(Boolean).length;
    const total = RESIDENTS.length;
    $('count').textContent = n + ' / ' + total + '人';
    $('count-note').textContent = total && n === total ? '全員クリア！優勝！' : 'それぞれのペースでいこ〜';
    $('gauge-fill').style.width = (dashboard?.happiness || 0) + '%';
    $('gauge-text').textContent = (dashboard?.happiness || 0) + '%';
    $('gauge').setAttribute('aria-valuemax','100');
    $('gauge').setAttribute('aria-valuenow', String(dashboard?.happiness || 0));
    const sync = $('sync');
    const mine = state.posts.find((p) => p.who === ME);
    const twin = mine?.sync_with?.length;
    if (twin) {
      const wasHidden = sync.hidden; sync.hidden = false;
      $('sync-detail').textContent = TASKS[mine.task].label + '×2';
      if (wasHidden) { sync.classList.remove('is-new'); void sync.offsetWidth; sync.classList.add('is-new'); }
    } else sync.hidden = true;
  }

  let poseIsNew = false;
  function renderPose() {
    const card = $('pose-card'), o = state.originals.trash || state.originals.laundry;
    const task = state.originals.trash ? 'trash' : 'laundry';
    $('pose-shot').innerHTML = o ? figSvg(o.fig) : '<span class="pose-empty">？</span>';
    if (o?.image) { const img = document.createElement('img'); img.src = o.image; img.alt = '今日のお手本'; img.style.cssText = 'width:100%;height:100%;object-fit:contain'; $('pose-shot').replaceChildren(img); }
    $('pose-name').textContent = o ? TASKS[task].label + 'のお手本' : 'まだないよ';
    $('pose-by').textContent = o ? '作った人：' + nameOf(o.by) : '一番乗りの人が作れる';
    card.classList.remove('is-new');
    if (poseIsNew) { void card.offsetWidth; card.classList.add('is-new'); poseIsNew = false; }
  }

  // ---------- fridge ----------
  const boardEl = $('board'), boardMagnets = $('board-magnets'), boardSub = $('board-sub'), trayEl = $('tray');
  function magnetEl(id) {
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'magnet m-' + TASKS[id].color; el.dataset.id = id; el.textContent = TASKS[id].label;
    return el;
  }
  function renderBoard(snapId) {
    boardMagnets.replaceChildren();
    if (!state.board.length) { const p = document.createElement('span'); p.className = 'board-empty'; p.textContent = '今日やる家事をここに貼る'; boardMagnets.append(p); }
    state.board.forEach((item) => {
      const wrap = document.createElement('span'); wrap.className = 'board-item';
      const m = magnetEl(item.id);
      m.setAttribute('aria-label', TASKS[item.id].label + (item.done ? '（クリア済み）' : '（タップして始める）'));
      if (item.done) {
        m.classList.add('is-done');
        const mark = document.createElement('span'); mark.className = 'done-mark'; mark.textContent = 'クリア'; m.append(mark);
        m.addEventListener('click', () => item.id === 'meal' ? openSheet('meal') : toast('今日の' + TASKS[item.id].label + 'はクリア済み'));
      } else m.addEventListener('click', () => openSheet(item.id));
      if (item.id === snapId) m.classList.add('snap');
      wrap.append(m);
      if (!item.done) {
        const x = document.createElement('button'); x.type = 'button'; x.className = 'unstick'; x.textContent = '×';
        x.setAttribute('aria-label', TASKS[item.id].label + 'をボードから外す');
        x.addEventListener('click', () => { sfx.unpop(); state.board = state.board.filter((b) => b.id !== item.id); saveGoals(); renderAll(); });
        wrap.append(x);
      }
      boardMagnets.append(wrap);
    });
    const open = state.board.filter((b) => !b.done).length;
    boardSub.textContent = !state.board.length ? 'やる家事を貼ってね。1個でいいよ〜' : open === 0 ? '今日のぶん終わり。えらすぎ。' : 'タップでスタート。終わるとクリアがつくよ';
  }
  function renderTray() {
    trayEl.replaceChildren();
    ORDER.filter((id) => !state.board.some((b) => b.id === id)).forEach((id) => {
      const m = magnetEl(id); m.setAttribute('aria-label', TASKS[id].label + 'をボードに貼る'); bindDrag(m, id); trayEl.append(m);
    });
  }
  function stick(id) { if (state.board.some((b) => b.id === id)) return; sfx.pop(); state.board.push({ id, done: false }); saveGoals(); renderAll(id); }
  function bindDrag(el, id) {
    let start = null, ghost = null, dragged = false;
    el.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; start = { x: e.clientX, y: e.clientY }; dragged = false; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
        dragged = true; ghost = el.cloneNode(true); ghost.classList.add('ghost'); ghost.removeAttribute('aria-label'); document.body.append(ghost);
      }
      if (ghost) { ghost.style.left = (e.clientX - ghost.offsetWidth / 2) + 'px'; ghost.style.top = (e.clientY - ghost.offsetHeight / 2) + 'px'; boardEl.classList.toggle('is-target', overBoard(e)); }
    });
    const end = (e) => { if (!start) return; const hit = ghost && overBoard(e); if (ghost) ghost.remove(); ghost = null; start = null; boardEl.classList.remove('is-target'); if (hit) stick(id); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => { if (dragged) { e.preventDefault(); dragged = false; return; } stick(id); });
  }
  function overBoard(e) { const r = boardEl.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }

  let newestPost = null;
  function renderTimeline() {
    const ol = $('timeline'); ol.replaceChildren();
    const items = [...state.posts].sort((a, b) => toMin(b.time) - toMin(a.time));
    if (!items.length) { const li = document.createElement('li'); li.className = 'tl-empty'; li.textContent = 'まだ静か。だれが一番乗りかな'; ol.append(li); return; }
    items.forEach((p) => {
      const r = RESIDENTS.find((x) => x.who === p.who);
      const li = document.createElement('li'); li.className = 'tl-item' + (p === newestPost ? ' is-new' : '');
      li.innerHTML = '<span class="tl-time"></span><span class="who-dot" aria-hidden="true"></span><span class="tl-text"><b></b> <span class="tl-verb"></span><span class="tl-get"></span>をゲット</span>';
      li.querySelector('.tl-time').textContent = p.time;
      const d = li.querySelector('.who-dot'); d.classList.add('m-' + r.color); d.textContent = nameOf(p.who).slice(0,1);
      li.querySelector('b').textContent = nameOf(p.who);
      li.querySelector('.tl-verb').textContent = REWARD[p.task].verb + '、';
      li.querySelector('.tl-get').textContent = REWARD[p.task].item;
      ol.append(li);
    });
    newestPost = null;
  }

  function renderAll(snapId) { renderRooms(); renderKitchen(); renderPose(); renderBoard(snapId); renderTray(); renderTimeline(); if (!$('room-view').hidden) showRoom(currentRoom, true); }

  // ---------- views ----------
  let currentRoom = '';
  function showFridge() { document.body.classList.add('no-scroll'); $('house-view').hidden = true; $('room-view').hidden = true; $('fridge-view').hidden = false; window.scrollTo(0, 0); $('back').focus(); }
  function showHouse() { document.body.classList.add('no-scroll'); $('fridge-view').hidden = true; $('room-view').hidden = true; $('house-view').hidden = false; window.scrollTo(0, 0); if (window.__goScene) window.__goScene(); }
  const ROOM_COLORS = {};
  let savedThemes = {};
  try { savedThemes = JSON.parse(localStorage.getItem('cyl-room-theme') || '{}') || {}; } catch (e) { savedThemes = {}; }
  const roomTheme = who => dashboard?.house.members[who]?.theme || ROOM_COLORS[who] || 'pink';
  function renderPaint() {
    const pop = $('paint-pop'); pop.replaceChildren();
    Object.entries(ROOM_THEMES).forEach(([k, t]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'paint-chip' + (roomTheme(ME) === k ? ' is-on' : '');
      b.style.background = 'linear-gradient(135deg, ' + t.wall[1] + ' 0 50%, ' + t.accent + ' 50%)';
      b.setAttribute('aria-label', k); b.setAttribute('aria-pressed', roomTheme(ME) === k ? 'true' : 'false');
      b.addEventListener('click', () => { houseApi('/profile', { theme: k }, 'PUT').then(refresh).catch(e => toast(e.message)); });
      pop.append(b);
    });
  }
  function closePaint() { $('room-view').classList.remove('is-decorating'); $('paint-pop').hidden = true; $('room-paint').setAttribute('aria-expanded', 'false'); }
  $('room-paint').addEventListener('click', () => { const p = $('paint-pop'); p.hidden = !p.hidden; $('room-view').classList.toggle('is-decorating', !p.hidden); $('room-paint').setAttribute('aria-expanded', p.hidden ? 'false' : 'true'); });
  function showRoom(who, refresh) {
    currentRoom = who;
    const mine = state.posts.filter((p) => p.who === who);
    const lit = mine.length > 0;
    const theme = ROOM_THEMES[roomTheme(who)];
    const col = ROOM_COLORS[who], hex = theme.accent;
    const S2 = 'stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
    const box = $('room-detail');
    box.innerHTML =
      '<div class="myroom w-' + col + (lit ? ' is-lit' : '') + '">' +
        '<div class="mr-plate"><b></b><span></span></div>' +
        '<svg class="mr-lamp" viewBox="0 0 60 180" aria-hidden="true"><g ' + S2 + '><path d="M30 0v130"/><path d="M12 152q0-22 18-22t18 22z" fill="' + hex + '"/><ellipse class="mr-bulb" cx="30" cy="156" rx="8" ry="5" fill="#FFFFFF"/></g></svg>' +
        '<svg class="mr-window" viewBox="0 0 110 100" aria-hidden="true"><g ' + S2 + '><rect x="8" y="10" width="94" height="72" rx="6" fill="' + (lit ? '#CFE9FF' : '#5E4E80') + '"/>' + (lit ? '<circle cx="78" cy="34" r="11" fill="#FFF4A8"/>' : '<path d="M76 26a10 10 0 1 0 8 16a8 8 0 1 1-8-16z" fill="#FFF4A8"/>') + '<path d="M55 10v72M8 46h94" stroke-width="2"/><path d="M2 6h106"/><path d="M4 6q8 36 0 82h12q-6-42 0-82z" fill="' + hex + '"/><path d="M106 6q-8 36 0 82H94q6-42 0-82z" fill="' + hex + '"/></g></svg>' +
        '<p class="mr-cap mr-cap-wall">壁に飾ったプリ</p>' +
        '<div class="mr-frames"></div>' +
        '<div class="mr-shelf"><p class="mr-cap">今日ゲットしたもの</p><div class="mr-items"></div></div>' +
        '<button class="mr-album" type="button" aria-label="アルバム（これまでの記録）"><svg viewBox="0 0 60 52" aria-hidden="true"><g ' + S2 + '><rect x="6" y="6" width="16" height="44" rx="2" fill="#FFFFFF"/><rect x="18" y="4" width="18" height="46" rx="2" fill="' + hex + '"/><path d="M22 12h10M22 18h6" stroke-width="2"/><rect x="32" y="10" width="22" height="40" rx="3" fill="#FFF4A8" transform="rotate(8 43 30)"/><path d="M38 22l4 3l6-6" stroke-width="2" transform="rotate(8 43 30)"/></g></svg></button>' +
        '<span class="mr-rug" aria-hidden="true"></span>' +
        '<svg class="mr-bed" viewBox="0 0 170 100" aria-hidden="true"><g ' + S2 + '><rect x="4" y="10" width="20" height="86" rx="6" fill="#F2D9C0"/><rect x="146" y="40" width="20" height="56" rx="6" fill="#F2D9C0"/><rect x="20" y="52" width="130" height="30" rx="6" fill="#FFFFFF"/><rect x="28" y="38" width="38" height="18" rx="8" fill="#FFFFFF"/><path d="M60 46q40-6 90 6v30H60z" fill="' + hex + '"/><path d="M78 56q30-4 66 4" stroke-width="2" fill="none"/><path d="M24 82v14M146 82v14"/></g></svg>' +
        '<svg class="mr-desk" viewBox="0 0 120 110" aria-hidden="true"><g ' + S2 + '><path d="M8 50h104" stroke-width="5"/><path d="M16 50v58M104 50v58"/><rect x="70" y="56" width="30" height="24" rx="3" fill="#F2D9C0"/><circle cx="85" cy="68" r="2" fill="#3B2560"/><path d="M30 50l6-26M36 24l14 6" fill="none"/><path d="M44 26l14 6l-4 8l-14-6z" fill="#FFF4A8"/><rect x="62" y="30" width="34" height="20" rx="3" fill="#E9DDFF"/><path d="M68 36h22M68 42h14" stroke-width="2"/><path d="M30 70h26l-4 38M34 70l-4 38" fill="none"/><rect x="28" y="62" width="30" height="10" rx="4" fill="' + hex + '"/></g></svg>' +
        '<div class="mr-dark"><p></p></div>' +
      '</div>';
    $('room-view').style.background = 'repeating-linear-gradient(90deg, ' + theme.wall[0] + ' 0 18px, ' + theme.wall[1] + ' 18px 36px)';
    box.querySelector('.myroom').style.setProperty('--mr-rug', theme.rug);
    $('room-paint').hidden = who !== ME;
    if (who !== ME) closePaint();
    renderPaint();
    box.querySelector('.mr-plate b').textContent = (nameOf(who) + (who === ME ? '（自分）' : '')) + 'の部屋';
    box.querySelector('.mr-plate span').textContent = lit ? '電気ついてる・今日' + mine.length + '個クリア' : 'まだ真っ暗';
    box.querySelector('.mr-dark p').textContent = 'まだ真っ暗…家事を1つでもやると電気がつくよ';
    box.querySelector('.mr-album').addEventListener('click', () => openLog(who));
    if (window.__tapMark) window.__tapMark(box.querySelector('.mr-album'));
    const fr = box.querySelector('.mr-frames');
    if (!mine.length) { for (let k = 0; k < 3; k++) { const e = document.createElement('span'); e.className = 'mr-frame-empty'; fr.append(e); } }
    mine.slice(0, 6).forEach((p, k) => { const f = document.createElement('button'); f.type = 'button'; f.className = 'mr-frame'; f.style.setProperty('--r', (k % 2 ? 3 : -3) + 'deg'); f.append(shotEl(p)); const c = document.createElement('span'); c.textContent = p.time + ' ' + TASKS[p.task].label; f.append(c); f.setAttribute('aria-label', p.time + 'の' + TASKS[p.task].label); f.addEventListener('click', () => openPhotos(mine.slice(0, 6).map((x) => ({ p: x, day: '今日' })), k)); fr.append(f); });
    const it = box.querySelector('.mr-items');
    const got = [...new Set(mine.map((p) => p.task))];
    if (!got.length) { const e = document.createElement('span'); e.className = 'shelf-empty'; e.textContent = 'まだからっぽ'; it.append(e); }
    got.forEach((t) => { const i2 = document.createElement('span'); i2.className = 'mr-item'; i2.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><g ' + S2 + '>' + ITEM_SVG[t] + '</g></svg><small></small>'; i2.querySelector('small').textContent = REWARD[t].item; it.append(i2); });
    if (!refresh) {
      document.body.classList.add('no-scroll'); $('house-view').hidden = true; $('fridge-view').hidden = true; $('room-view').hidden = false;
      $('room-view').style.animation = 'none'; void $('room-view').offsetWidth; $('room-view').style.animation = '';
      window.scrollTo(0, 0); $('room-back').focus();
    }
  }
  $('room-back').addEventListener('click', () => { closePaint(); window.__toHall = true; showHouse(); });
  $('open-fridge').addEventListener('click', showFridge);
  $('back').addEventListener('click', () => { showHouse(); $('open-fridge').focus(); });
  $('nav-home').addEventListener('click', () => { if (!$('house-view').hidden && window.__goLdk) { window.__goLdk(); return; } window.__toScene = 1; showHouse(); });
  $('nav-room').addEventListener('click', () => showRoom(ME));

  function openRoom(who) {
    const mine = state.posts.filter((p) => p.who === who);
    sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title"></h2><div class="room-log"></div>';
    sheetBody.querySelector('.sheet-title').textContent = (who === ME ? '自分' : nameOf(who)) + 'の部屋';
    const log = sheetBody.querySelector('.room-log');
    if (!mine.length) {
      const p = document.createElement('p'); p.className = 'sheet-text';
      p.textContent = who === ME ? 'まだ今日の記録はないよ。キッチンの冷蔵庫でマグネットを貼ってみよ。' : 'まだ電気ついてない。ゆるく待と。';
      log.append(p);
    }
    mine.forEach((p) => {
      const row = document.createElement('div'); row.className = 'log-item';
      row.append(shotEl(p));
      const t = document.createElement('p'); const s = document.createElement('strong');
      s.textContent = p.time + '　' + TASKS[p.task].label; t.append(s, document.createTextNode(p.comment)); row.append(t);
      log.append(row);
    });
    if (!sheet.open) sheet.showModal();
    $('sheet-close').focus();
  }

  // ---------- check sheet ----------
  function choicesFor(id) {
    if (id === 'laundry') return [{ kind: 'rhythm', mode: 'camera', title: 'バサバサでリズム', hint: 'カメラに映って、音符に合わせて洗濯物をバサッ・8拍中6回でクリア' }];
    const t = TASKS[id], list = [];
    (t.presets || []).forEach((p) => list.push({ kind: 'pose', mode: 'preset', preset: p.id, title: p.name + 'のポーズ', hint: p.hint, fig: p.fig, praise: p.praise }));
    if (t.presets) {
      const o = state.originals[id];
      if (isFirstToday(id)) list.push({ kind: 'pose', mode: 'original-new', title: 'オリジナルのポーズ', hint: '今日最初だから作れる！みんなのお手本になる' });
      else if (o && o.by !== ME) list.push({ kind: 'pose', mode: 'original-copy', title: nameOf(o.by) + 'のオリジナル', hint: 'お手本のポーズをまねする', fig: o.fig });
    }
    if (t.sound) list.push({ kind: 'sound', mode: 'sound', title: t.sound.title, hint: t.sound.hint, listen: t.sound.listen, praise: t.sound.praise });
    if (t.photo) list.push({ kind: 'photo', mode: 'photo', title: t.photo.title, hint: t.photo.hint, look: t.photo.look, praise: t.photo.praise });
    return list;
  }
  function openSheet(id) {
    const t = TASKS[id], list = choicesFor(id);
    const lead = id === 'laundry' ? '自分をカメラに映して、流れてくる音符に合わせて洗濯物をバサッ！タイミングが合うと体からキラキラが出るよ。'
      : t.presets ? (isFirstToday(id) ? '今日の' + t.label + 'は一番乗り！決まったポーズか、オリジナルのポーズを撮ってね。' : 'ポーズを1つ選んで撮ってね。人だけ切り抜くから、部屋は写らないよ。')
      : t.sound ? '音だけ聞くから、カメラはいらないよ。' : 'ごはんだけ写せばOK。';
    sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title"></h2><p class="sheet-text"></p><div class="choice"' + (list.length === 1 ? ' style="grid-template-columns:1fr"' : '') + '></div><p class="demo-note">カメラ・マイクは選んだ操作でのみ使います。保存前に確認できます。</p>';
    sheetBody.querySelector('.sheet-title').textContent = t.label + '、いく？';
    sheetBody.querySelector('.sheet-text').textContent = lead;
    const choice = sheetBody.querySelector('.choice');
    list.forEach((c) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sub';
      if (c.fig !== undefined) b.innerHTML = '<span class="choice-fig">' + figSvg(c.fig) + '</span>';
      b.append(document.createTextNode(c.title));
      const s = document.createElement('small'); s.textContent = c.hint; b.append(s);
      b.addEventListener('click', () => judge(id, c));
      choice.append(b);
    });
    if (!sheet.open) sheet.showModal();
    choice.querySelector('button').focus();
  }
  let captureController;
  // When the camera or mic cannot be used, ask for access in plain words.
  function deviceMessage(e, id) {
    const device = id === 'dryer' ? 'マイク' : 'カメラ';
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return device + 'の利用を許可してください';
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return device + 'が見つかりません';
    if (e.name === 'NotReadableError') return device + 'をほかのアプリが使っているみたい';
    if (!navigator.mediaDevices) return 'このページでは' + device + 'を使えません（https か localhost で開いてね）';
    return e.message;
  }
  async function judge(id, c) {
    captureController?.abort(); captureController = new AbortController();
    const signal = captureController.signal;
    try {
      const evidence = await capture(sheetBody, id, c, state.originals[id], signal);
      if (signal.aborted) return;
      const gal = pickGal();
      const { blob, kind, result, voice, ...fields } = evidence;
      const body = { ...fields, chore: toApi(id), gal, request_id: crypto.randomUUID() };
      sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">記録する？</h2><div class="result-card" role="group" aria-label="結果"><span class="result-label"></span><b class="result-main"></b><span class="result-sub"></span></div><p class="sheet-text">できたことをお部屋に残そう。</p><button class="btn btn-main" id="post">部屋に飾る</button><button class="btn btn-sub" id="redo">やり直す</button>';
      const shown = resultOf(c, fields, result || {});
      sheetBody.querySelector('.result-label').textContent = shown.label;
      sheetBody.querySelector('.result-main').textContent = shown.main;
      sheetBody.querySelector('.result-sub').textContent = shown.sub || '';
      sheetBody.querySelector('.result-sub').hidden = !shown.sub;
      if (voice) { const url = URL.createObjectURL(voice); sheetBody.querySelector('.result-card').append(voiceButton(() => url)); signal.addEventListener('abort', () => URL.revokeObjectURL(url), { once: true }); }
      if (blob) { const img = document.createElement('img'); const url = URL.createObjectURL(blob); img.src = url; img.style.cssText = 'width:100%;max-height:30vh;object-fit:contain'; sheetBody.querySelector('p').after(img); signal.addEventListener('abort', () => URL.revokeObjectURL(url), { once: true }); }
      $('redo').onclick = () => { captureController.abort(); openSheet(id); };
      $('post').onclick = async () => {
        const button = $('post'); button.disabled = true; $('redo').disabled = true; $('sheet-close').disabled = true;
        try {
          if (blob && !body.media_id) body.media_id = (await houseApi('/media?kind=' + kind, blob)).id;
          // 声が送れなくても、ごはんの記録はできるようにする。
          if (voice && !body.voice_media_id) body.voice_media_id = await houseApi('/media?kind=voice', voice).then(r => r.id, () => undefined);
          const result = await houseApi('/completions', body);
          await refresh();
          sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">記録できた！</h2><div class="verdict">' + galIcon(gal) + '<p class="bubble"><span class="gal-text"></span></p></div><button class="btn btn-main" id="finish">お部屋へ</button>';
          sheetBody.querySelector('.gal-text').textContent = result.post.praise.text;
          sfx.clear(); setTimeout(() => galVoice(gal, result.post.praise.text), 550);
          $('finish').onclick = () => { sheet.close(); showHouse(); toast('部屋に飾った。電気ついたね'); };
        } catch (e) { toast(e.message); button.disabled = false; if ($('redo')) $('redo').disabled = false; }
        finally { $('sheet-close').disabled = false; }
      };
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.name === 'NoHitError') { showNoHit(id, c, e); return; }
      openSheet(id); toast(deviceMessage(e, id));
    }
  }
  // 録音した「いただきます」を再生するボタン（#9）。src() は再生する音の URL を返す。
  const voiceUrls = new Map();
  const voiceOf = (id) => { if (!voiceUrls.has(id)) voiceUrls.set(id, houseApi('/media/' + id).then(URL.createObjectURL).catch((e) => { voiceUrls.delete(id); throw e; })); return voiceUrls.get(id); };
  let playing = null;
  function voiceButton(src) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'voice-play';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>いただきます を聞く</span>';
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        playing?.pause();
        const audio = new Audio(await src()); playing = audio;
        b.classList.add('is-playing'); audio.onended = audio.onpause = () => b.classList.remove('is-playing');
        await audio.play();
      } catch (err) { b.classList.remove('is-playing'); toast('声を再生できなかった…'); }
    });
    return b;
  }
  // 「記録する？」に出す結果（#33）。家事ごとに、何がどれだけできたかを1行で。
  function resultOf(c, fields, result) {
    if (fields.method === 'rhythm') return { label: 'リズム', main: fields.hits + ' / ' + fields.total_beats + ' ヒット', sub: '良 ' + (result.good || 0) + '・可 ' + (fields.hits - (result.good || 0)) };
    if (fields.method === 'sound') return { label: 'ドライヤーの音', main: Math.floor(fields.duration_seconds) + '秒 聞こえた', sub: '10秒でクリア' };
    if (fields.method === 'photo_voice') return { label: 'ごはん', main: 'いただきます 言えた！', sub: '写真といっしょに残すよ' };
    if (fields.method === 'photo') return { label: 'ごはん', main: '写真で記録', sub: 'ちゃんと食べてえらい' };
    if (fields.similarity !== undefined) return { label: 'まねっこ度', main: fields.similarity + '%', sub: 'お手本：' + c.title.replace(/のオリジナル$/, '') };
    if (c.mode === 'original-new') return { label: 'オリジナルのポーズ', main: '今日の一番乗り！', sub: 'みんなのお手本になるよ' };
    return { label: c.title, main: (result.score ?? '') + '%', sub: 'ポーズの決まり度' };
  }
  // Rhythm ended without enough hits: a gal cheers you on and offers another go (nothing is recorded).
  function showNoHit(id, c, e) {
    const gal = pickGal();
    sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">おしい〜！</h2><p class="sheet-text"></p><div class="verdict">' + galIcon(gal) + '<p class="bubble"><span class="gal-text"></span></p></div><button class="btn btn-main" id="retry">もう一回</button><button class="btn btn-sub" id="other-way">ほかのやり方</button>';
    sheetBody.querySelector('.sheet-text').textContent = (e.hits || 0) + ' / ' + e.totalBeats + ' ヒット' + (e.pass ? '（' + e.pass + '回でクリア）' : '');
    sheetBody.querySelector('.gal-text').textContent = e.message + '。もう一回いこ！';
    sfx.miss(); setTimeout(() => galVoice(gal, 'おしい！もう一回いこ！'), 600);
    $('retry').onclick = () => judge(id, c);
    $('other-way').onclick = () => openSheet(id);
    $('retry').focus();
  }
  sheet.addEventListener('cancel', e => { if ($('sheet-close').disabled) e.preventDefault(); });
  sheet.addEventListener('close', () => captureController?.abort());
  $('sheet-close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet && !$('sheet-close').disabled) sheet.close(); });

  // The camera button starts the chore of the place you are standing in.
  const SCENE_CHORE = { entry: 'trash', ldk: 'meal', wash: 'dryer', balcony: 'laundry' };
  $('shoot').addEventListener('click', () => {
    const here = SCENE_CHORE[scenes[sceneIdx]?.dataset.scene];
    if (here && TASKS[here] && $('fridge-view').hidden && $('room-view').hidden) { openSheet(here); return; }
    const next = state.board.find((b) => !b.done);
    if (next) openSheet(next.id);
    else { showFridge(); boardSub.textContent = 'まずマグネットを1個貼ってね'; toast('冷蔵庫にマグネットを貼ると始められるよ'); }
  });
  $('next-day').textContent = '友だちを招待する';
  $('next-day').addEventListener('click', async () => {
    try {
      const code = await inviteCode(); $('menu').close();
      sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">招待コード貼っとくね（7日間有効）</h2><p class="sheet-text">一緒に住むマブに今すぐ送って！！💖6人までいける～✌</p><input class="invite-code" aria-label="招待コード" readonly><button class="btn invite-copy" type="button">コピー</button>';
      const input = sheetBody.querySelector('.invite-code'); input.value = code; input.onclick = () => input.select();
      sheetBody.querySelector('.invite-copy').onclick = () => navigator.clipboard.writeText(code).then(() => toast('コピーしたよ'), () => { input.select(); toast('長押しでコピーしてね'); });
      sheet.showModal();
    }
    catch (e) { toast(e.message); }
  });

  let toastTimer = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400); }

  const TAP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10h.4V8.8a1.5 1.5 0 0 1 3 0V10.4a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.8a5 5 0 0 1-4.1-2.1l-2.8-3.9a1.5 1.5 0 0 1 2.3-1.9L9 15z" fill="#FFFFFF" stroke="#3B2560" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 5.5l-1.6-1M10.5 1.8V.2M16 5.5l1.6-1" stroke="#3B2560" stroke-width="1.6" stroke-linecap="round"/></svg>';
  window.__tapMark = (el) => { if (el.querySelector(':scope > .tap-mark')) return; const m = document.createElement('span'); m.className = 'tap-mark'; m.setAttribute('aria-hidden', 'true'); m.innerHTML = TAP_SVG; el.append(m); };
  document.querySelectorAll('.sv-hit, #open-fridge').forEach(window.__tapMark);

  function receive(data) {
    dashboard = data; ME = client.uid;
    RESIDENTS = data.house.member_ids.map((who,i) => ({ who, color: ['pink','cyan','lilac','lime','pink','cyan'][i] }));
    const doors = document.querySelector('.doors'); doors.replaceChildren();
    RESIDENTS.forEach(r => { ROOM_COLORS[r.who] = r.color; const slot = document.createElement('div'); slot.className = 'door-slot'; slot.dataset.who = r.who; doors.append(slot); });
    doors.style.gridTemplateColumns = 'repeat('+RESIDENTS.length+',minmax(0,1fr))';
    $('door-chips').style.gridTemplateColumns = doors.style.gridTemplateColumns;
    document.querySelectorAll('[data-who-map]').forEach((el,i) => { const r = RESIDENTS[i]; el.hidden = !r; if (r) { el.dataset.whoMap = r.who; el.textContent = nameOf(r.who) + 'のへや'; } });
    $('map-plan').classList.toggle('many-rooms', RESIDENTS.length > 4);
    const convert = p => ({ ...p, who:p.user_id, task:fromApi(p.chore), kind:p.method.startsWith('photo')?'photo':p.method, pose:0, time: new Intl.DateTimeFormat('ja-JP', { timeZone:data.timezone, hour:'2-digit', minute:'2-digit' }).format(new Date(p.created_at)), comment:p.praise.text, galLine:p.praise.text });
    state.posts = data.posts.filter(p=>p.day===data.state.day).map(convert);
    state.history = [...new Set(data.posts.map(p=>p.day))].filter(day=>day!==data.state.day).map(day=>({ off:Math.round((Date.parse(day)-Date.parse(data.state.day))/86400000), posts:data.posts.filter(p=>p.day===day).map(convert) }));
    state.doneToday = {};
    Object.entries(data.state.completed).forEach(([uid,chores])=>chores.forEach(t=>{ (state.doneToday[fromApi(t)] ||= []).push(uid); }));
    if (!pendingGoals) state.board = (data.state.goals[ME] || []).map(t=>({ id:fromApi(t), done:(data.state.completed[ME]||[]).includes(t) }));
    state.originals = Object.fromEntries(Object.entries(data.state.poses).map(([t,p])=>[fromApi(t),{ ...p, fig:0, by:p.user_id }]));
    if (!data.house.member_ids.includes(currentRoom)) currentRoom = ME;
    document.querySelector('.account-row b').textContent = nameOf(ME);
    document.querySelector('.account-row small').textContent = data.house.name + '・' + RESIDENTS.length + '人';
    document.querySelector('.account-icon').textContent = nameOf(ME).slice(0,1);
    renderAccountForm();
    renderAll();
  }
  // 招待で入居したときに、誰と住むのかを見せる
  window.addEventListener('darupoyo:joined', () => {
    const others = RESIDENTS.filter(r => r.who !== ME).map(r => nameOf(r.who));
    if (!others.length) return;
    const names = others.length > 3 ? others.slice(0, 3).join('、') + 'たち' : others.join('、');
    sheetBody.innerHTML = '<div class="move-in"><h2 class="sheet-title" id="sheet-title"></h2><p class="sheet-text"></p><button class="btn btn-main" type="button" id="move-in-ok">おじゃまします！</button></div>';
    sheetBody.querySelector('.sheet-title').textContent = names + 'と一緒に住む！';
    sheetBody.querySelector('.sheet-text').textContent = '今日から「' + dashboard.house.name + '」の住人だよ。自分の部屋もできたよ。';
    $('move-in-ok').onclick = () => sheet.close();
    sheet.showModal(); $('move-in-ok').focus();
  });
  // ---------- rename yourself / the house ----------
  const accountEdit = $('account-edit'), accountForm = $('account-form');
  function renderAccountForm() {
    accountEdit.hidden = false;
    if (accountForm.hidden) { accountForm.display_name.value = nameOf(ME); accountForm.house_name.value = dashboard.house.name; }
  }
  function toggleAccountForm(open) {
    accountForm.hidden = !open; accountEdit.setAttribute('aria-expanded', String(open));
    document.querySelector('.account-row').hidden = open;
    if (open) { renderAccountForm(); accountForm.display_name.focus(); } else if (accountForm.contains(document.activeElement)) accountEdit.focus();
  }
  accountEdit.addEventListener('click', () => toggleAccountForm(accountForm.hidden));
  accountForm.querySelector('.account-cancel').addEventListener('click', () => toggleAccountForm(false));
  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = accountForm.display_name.value.trim(), house = accountForm.house_name.value.trim();
    if (!name || !house) { toast('名前を入力してね'); return; }
    const save = accountForm.querySelector('[type=submit]'); save.disabled = true;
    try {
      if (name !== nameOf(ME)) await houseApi('/profile', { display_name: name }, 'PUT');
      if (house !== dashboard.house.name) await houseApi('', { name: house }, 'PUT');
      toggleAccountForm(false); await refresh(); toast('変更したよ');
    } catch (err) { toast(err.message); } finally { save.disabled = false; }
  });
  $('settings').addEventListener('close', () => toggleAccountForm(false));
  const logoutButton = document.querySelector('#settings button[disabled]'); logoutButton.disabled = false; logoutButton.textContent = 'ログアウト'; logoutButton.onclick = () => disablePush().finally(() => logout().catch(e=>toast(e.message)));
  $('switch-house').addEventListener('click', switchHouse);
  start(receive, e => toast(e.message)).catch(e => { const notice = document.createElement('p'); notice.className = 'connection-status'; notice.textContent = e.message + '。Backend起動後に再読み込みしてください。'; document.body.append(notice); });

  document.body.classList.add('no-scroll');

  // ---------- walk between rooms ----------
  startAmbience();
  setupMoments();
  const plan = $('plan'), scenes = [...plan.querySelectorAll('.scene')], tabs = [...document.querySelectorAll('.scene-tab')];
  let sceneIdx = 1;
  function goScene(i, instant) {
    sceneIdx = Math.max(0, Math.min(scenes.length - 1, i));
    plan.scrollTo({ left: sceneIdx * plan.clientWidth, behavior: instant ? 'auto' : 'smooth' });
    markScene();
  }
  function markScene() {
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === sceneIdx ? 'true' : 'false'); t.classList.toggle('has-done', !!scenes[k].querySelector('.sv-hit.is-done, .door.is-lit')); });
    $('walk-left').disabled = sceneIdx === 0;
    $('walk-right').disabled = sceneIdx === scenes.length - 1;
  }
  let st;
  plan.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { const i = Math.round(plan.scrollLeft / plan.clientWidth); if (i !== sceneIdx) { sceneIdx = i; markScene(); } }, 60); });
  $('walk-left').addEventListener('click', () => goScene(sceneIdx - 1));
  $('walk-right').addEventListener('click', () => goScene(sceneIdx + 1));
  tabs.forEach((t) => t.addEventListener('click', () => goScene(Number(t.dataset.go))));
  document.addEventListener('keydown', (e) => { if ($('house-view').hidden || document.querySelector('dialog[open]')) return; if (e.key === 'ArrowLeft') goScene(sceneIdx - 1); if (e.key === 'ArrowRight') goScene(sceneIdx + 1); });
  window.addEventListener('resize', () => goScene(sceneIdx, true));
  new MutationObserver(markScene).observe(plan, { subtree: true, attributes: true, attributeFilter: ['class'] });
  const menu = $('menu');
  $('open-menu').addEventListener('click', () => { document.querySelectorAll('.map-cell').forEach((c) => c.classList.toggle('is-here', Number(c.dataset.go) === sceneIdx)); menu.showModal(); });
  $('menu-close').addEventListener('click', () => menu.close());
  const settings = $('settings');
  $('open-settings').addEventListener('click', () => { menu.close(); renderGalPicker(); renderPush(); renderSound(); settings.showModal(); });
  // ---------- phone notifications (#58) ----------
  const PUSH_NOTES = { install: 'iPhone はホーム画面に追加すると通知をうけとれるよ（共有 → ホーム画面に追加）', blocked: 'スマホの設定で、だるぽよの通知を許可してね' };
  async function renderPush() {
    const state = await pushState().catch(() => 'unsupported');
    const card = $('push-card'), button = $('push-toggle'), note = $('push-note');
    card.hidden = state === 'unsupported';
    const on = state === 'ready' && pushOn();
    button.disabled = state !== 'ready'; button.textContent = on ? 'オン' : 'オフ'; button.setAttribute('aria-pressed', String(on));
    note.hidden = !PUSH_NOTES[state]; note.textContent = PUSH_NOTES[state] || '';
  }
  $('push-toggle').addEventListener('click', async () => {
    const button = $('push-toggle'); button.disabled = true;
    try {
      if (pushOn()) { await disablePush(); toast('通知をオフにしたよ'); }
      else { await enablePush(galPref); toast('通知をオンにしたよ'); }
    } catch (e) { toast(e.message); }
    await renderPush();
  });
  listenInApp((body) => { sfx.ding(); toast(body); });
  // ---------- sound effects (#8 #17) ----------
  function renderSound() { const on = soundOn(), b = $('sound-toggle'); b.textContent = on ? 'オン' : 'オフ'; b.setAttribute('aria-pressed', String(on)); }
  $('sound-toggle').addEventListener('click', () => { setSound(!soundOn()); renderSound(); sfx.pop(); });
  $('settings-close').addEventListener('click', () => settings.close());
  $('open-howto').addEventListener('click', () => { menu.close(); $('howto-page').showModal(); });
  $('howto-close').addEventListener('click', () => $('howto-page').close());
  $('howto-start').addEventListener('click', () => $('howto-page').close());
  // 初めて家に入ったときだけ、あそびかたを自動で開く
  window.addEventListener('darupoyo:entered', () => {
    const KEY = 'darupoyo-howto-seen';
    try { if (localStorage.getItem(KEY)) return; localStorage.setItem(KEY, '1'); } catch (e) { return; }
    $('howto-page').showModal();
  });
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });
  document.querySelectorAll('.map-cell').forEach((c) => c.addEventListener('click', () => { menu.close(); if (c.dataset.whoMap) { goScene(4, true); showRoom(c.dataset.whoMap); } else goScene(Number(c.dataset.go)); }));
  window.__goScene = () => requestAnimationFrame(() => { if (window.__toHall) { sceneIdx = 4; window.__toHall = false; } if (window.__toScene != null) { sceneIdx = window.__toScene; window.__toScene = null; } goScene(sceneIdx, true); });
  window.__goLdk = () => goScene(1);
  requestAnimationFrame(() => goScene(1, true));
})();
