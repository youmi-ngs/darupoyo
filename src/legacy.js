import './input-mode.js';
import { setBusy } from './busy.js';
import { setupSettingsUI, updateSettingsHouse } from './settings-ui.js';
import { setupDarupoyoRecords } from './darupoyo-records.js';
import { setupFurniturePlay } from './furniture-play.js';
import { setupMoments } from './moments.js';
import { setupCritters } from './critters.js';
import { startAmbience } from './ambience.js';
import { client, start, houseApi, refresh, inviteCode, logout, switchHouse, deleteAccount } from './api.js';
import { capture } from './media.js';
import { renderActivities, roomGal, nextReturn } from './resident-activities.js';
import { pushState, pushOn, enablePush, disablePush, syncPushGal, listenInApp } from './push.js';
import { setAppIcon } from './app-icon.js';
import { sfx, galVoice, soundOn, setSound } from './sfx.js';
import { setupBoardView } from './board-view.js';
import { THEMES, residentThemes } from './themes.js';
import { galCharacter, galIcon as dressedGalIcon, outfitOf } from './gal-figure.js';
import { residentDot, commentsBlock, setupSocialSettings } from './social.js';
import { otherHouseRecords, forgetHistory } from './history.js';
import { openCalendar } from './album-calendar.js';
import { TASKS, REWARD, figSvg, MEAL_SVG, GALS, GAL_IDS, ITEM_SVG } from './data.js';
(() => {
  setupSettingsUI();
  let ME = '', RESIDENTS = [], dashboard = null, THEME_OF = {};
  // Each resident's theme color: room, hung clothes and their gal's outfit.
  const themeOf = uid => THEME_OF[uid] || 'pink';
  const nameOf = uid => dashboard?.house.members[uid]?.display_name || '住人';
  const toApi = id => id === 'trash' ? 'garbage' : id;
  const fromApi = id => id === 'garbage' ? 'trash' : id;
  const convertPost = p => ({ ...p, who:p.user_id, task:fromApi(p.chore), kind:p.method.startsWith('photo')?'photo':p.method, pose:0, time: new Intl.DateTimeFormat('ja-JP', { timeZone:dashboard?.timezone || 'Asia/Tokyo', hour:'2-digit', minute:'2-digit' }).format(new Date(p.created_at)), comment:p.praise?.text, galLine:p.praise?.text });
  // A resident's round mark with their profile photo (#96), or their initial.
  const dotOf = uid => residentDot(dashboard?.house.members[uid], nameOf(uid), outfitOf(themeOf(uid)));
  // A resident's icon: profile photo, or else their gal's face in their color.
  const memberGal = (uid, fallback) => { const g = dashboard?.house.members[uid]?.gal; return GALS[g] ? g : GALS[fallback] ? fallback : 'reiwa'; };
  function iconOf(uid) {
    const member = dashboard?.house.members[uid], el = document.createElement('span'); el.className = 'who-icon'; el.setAttribute('aria-hidden', 'true');
    if (member?.avatar) { const img = document.createElement('img'); img.src = member.avatar; img.alt = ''; el.append(img); }
    else el.innerHTML = dressedGalIcon(memberGal(uid), themeOf(uid));
    el.style.setProperty('--outfit', outfitOf(themeOf(uid)));
    return el;
  }
  const state = { posts: [], originals: {}, doneToday: {}, history: [], newRoom: null };
  const WD = ['日','月','火','水','木','金','土'];
  let dayOffset = 0;
  const dayLabel = off => { const d = new Date((dashboard?.state.day || new Date().toISOString().slice(0,10)) + 'T12:00:00+09:00'); d.setUTCDate(d.getUTCDate()+off); return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+'（'+WD[d.getUTCDay()]+'）'; };
  const $ = (id) => document.getElementById(id);
  const sheet = $('sheet'), sheetBody = $('sheet-body');
  const darupoyoRecords = setupDarupoyoRecords();
  const furniturePlay = setupFurniturePlay();
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
  const dayIso = off => { const d = new Date((dashboard?.state.day || new Date().toISOString().slice(0,10)) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+off); return d.toISOString().slice(0,10); };
  const offOf = day => Math.round((Date.parse(day) - Date.parse(dashboard.state.day)) / 86400000);
  let logWho = null, logDays = [], logCounts = [];
  // Album pages: this house, plus the resident's records from other houses when allowed (#99).
  function albumDays(foreign) {
    const days = [{ off: dayOffset, posts: state.posts }, ...state.history].map(d => ({ off: d.off, posts: [...d.posts] }));
    foreign.forEach(p => { const off = offOf(p.day); let d = days.find(x => x.off === off); if (!d) days.push(d = { off, posts: [] }); d.posts.push(p); });
    return days.sort((a, b) => b.off - a.off);
  }
  function openLog(who) {
    logWho = who;
    drawLog(who, []);
    $('log-modal').showModal();
    requestAnimationFrame(() => { $('log-list').scrollLeft = 0; });
    const allowed = who === ME || !!dashboard.house.members[who]?.share_history;
    otherHouseRecords(client.house, who, allowed).then(raw => {
      if (logWho !== who || !$('log-modal').open || !raw.length) return;
      const list = $('log-list'), page = Math.round(list.scrollLeft / list.clientWidth);
      drawLog(who, raw.map(convertPost));
      requestAnimationFrame(() => { list.style.scrollBehavior = 'auto'; list.scrollLeft = page * list.clientWidth; list.style.scrollBehavior = ''; });
    });
  }
  function drawLog(who, foreign) {
    $('log-title').textContent = (nameOf(who)) + 'のアルバム';
    const list = $('log-list'); list.replaceChildren();
    const days = albumDays(foreign);
    const all = [];
    const SLOT = ['laundry', 'meal', 'trash'];
    days.forEach((d) => d.posts.filter((p) => p.who === who && p.kind !== 'sound').sort((a, b) => SLOT.indexOf(a.task) - SLOT.indexOf(b.task)).forEach((p) => all.push({ p, day: dayName(d.off), off: d.off })));
    logDays = days; logCounts = days.map(d => all.filter(x => x.off === d.off).length);
    days.forEach((d) => {
      const mine = all.filter((x) => x.off === d.off);
      const sec = document.createElement('section'); sec.className = 'log-day' + (mine.length ? '' : ' is-empty'); sec.dataset.day = dayIso(d.off);
      const h = document.createElement('h3'); h.textContent = (d.off === dayOffset ? '今日 ' : '') + dayLabel(d.off);
      const n = document.createElement('span'); n.className = 'log-n'; n.textContent = mine.length ? mine.length + '' : '−'; h.append(n);
      sec.append(h);
      const g = document.createElement('div'); g.className = 'log-grid';
      mine.forEach((x, k) => { const f = document.createElement('button'); f.type = 'button'; f.className = 'fp' + (x.p.foreign ? ' is-foreign' : ''); f.style.setProperty('--r', ((k % 3) - 1) * 3 + 'deg'); f.append(shotEl(x.p)); if (x.p.foreign) { const tag = document.createElement('span'); tag.className = 'foreign-tag'; tag.textContent = '別ハウス'; f.append(tag); } f.setAttribute('aria-label', dayLabel(d.off) + ' ' + x.p.time + 'の' + TASKS[x.p.task].label + (x.p.foreign ? '（別のハウス）' : '')); f.addEventListener('click', () => openPhotos(all, all.indexOf(x))); g.append(f); });
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
    requestAnimationFrame(mark);
  }
  // Calendar button (#91): jump to a day's page.
  const calButton = document.createElement('button'); calButton.type = 'button'; calButton.className = 'btn log-cal'; calButton.id = 'log-calendar'; calButton.textContent = '📅 カレンダー';
  $('log-total').after(calButton);
  calButton.addEventListener('click', () => {
    const list = $('log-list'), page = Math.round(list.scrollLeft / list.clientWidth);
    openCalendar({ today: dayIso(dayOffset), selected: logDays[page] ? dayIso(logDays[page].off) : dayIso(dayOffset),
      days: logDays.map((d, i) => ({ day: dayIso(d.off), count: logCounts[i] })),
      onPick: day => { const i = logDays.findIndex(d => dayIso(d.off) === day); if (i >= 0) list.scrollTo({ left: i * list.clientWidth, behavior: 'smooth' }); } });
  });
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
      sl.querySelector('.gal-slot').outerHTML = galIcon(pg, p.who);
      sl.querySelector('.gal-text').textContent = postLine(p);
      sl.querySelector('.tl-get').textContent = REWARD[p.task].item;
      const sound = id => p.foreign ? p.loadMedia(id) : voiceOf(id);
      if (p.foreign) sl.querySelector('.pm-meta').textContent += '（別のハウスでの記録）';
      if (p.caption) { const word = document.createElement('p'); word.className = 'pm-caption'; word.textContent = p.caption; sl.querySelector('.pm-meta').after(word); }
      if (p.voice_media_id) sl.querySelector('.pm-meta').after(voiceButton(() => sound(p.voice_media_id)));
      if (!p.foreign) {
      const reactions = document.createElement('div'); reactions.className = 'reaction-row';
      ['heart','clap','sparkles'].forEach((emoji,i) => { const b=document.createElement('button'); b.textContent=['♥','👏','✨'][i]+' '+Object.values(p.reactions||{}).filter(v=>v===emoji).length; b.onclick=async()=>{ try { await houseApi('/posts/'+p.id+'/reaction',{emoji},'PUT'); b.textContent=['♥','👏','✨'][i]+' ✓'; await refresh(); } catch(e) { toast(e.message); } }; reactions.append(b); }); sl.append(reactions);
      sl.append(commentsBlock(p, { me: ME, nameOf, dotOf, toast }));
      }
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
  setAppIcon(galPref); // #110
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
  const galIcon = (g, who = ME) => dressedGalIcon(g, themeOf(who));
  function renderGalPicker() {
    const box = $('gal-picker'); if (!box) return; box.replaceChildren();
    const faces = { heisei: 'c98ab', reiwa: '24a0f', kuro: 'ddaad', hime: '71e8d' };
    const mini = { heisei: 'd83de', kuro: '36255', hime: '2be8e', reiwa: '4fc4e' };
    const mk = (id) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gal-card' + (galPref === id ? ' is-on' : ''); b.setAttribute('aria-pressed', galPref === id ? 'true' : 'false');
      if (id === 'random') { b.innerHTML = '<span class="gal-face gal-random">' + ['heisei', 'kuro', 'hime', 'reiwa'].map(g => '<i class="mini-' + g + '"><img src="/settings/' + mini[g] + '.svg" alt=""></i>').join('') + '</span><b>ノリで</b><small>毎回ちがうギャルがほめる</small>'; }
      else { b.dataset.gal = id; b.innerHTML = '<span class="gal-heading"><span class="settings-gal-face" style="background:' + GALS[id].bg + '"><img src="/settings/' + faces[id] + '.svg" alt=""></span><b>' + GALS[id].name + '</b></span><small></small><em></em>'; b.setAttribute('aria-label', GALS[id].name); b.querySelector('small').textContent = GALS[id].tag; b.querySelector('em').textContent = '「' + ({ heisei:'あげぽよ〜↑↑', reiwa:'え、天才すぎん？', kuro:'やるじゃん！最強！', hime:'えらすぎるキュン♡' })[id] + '」'; }
      b.addEventListener('click', () => { galPref = id; try { localStorage.setItem('cyl-gal', id); } catch (e) {} setAppIcon(id); renderGalPicker(); [...box.children].find(button => button.getAttribute('aria-pressed') === 'true')?.focus(); syncPushGal(id); void houseApi('/profile', { gal: id }, 'PUT').then(refresh).catch(e => toast(e.message)); if (GALS[id]) galVoice(id, GALS[id].title); });
      return b;
    };
    box.append(mk('random'));
    GAL_IDS.forEach((g) => box.append(mk(g)));
    const cur = $('gal-current');
    if (cur) cur.innerHTML = galPref === 'random' ? '<span class="gal-face gal-random">' + GAL_IDS.map((g) => '<i>' + GALS[g].svg + '</i>').join('') + '</span><small>ノリで</small>' : galIcon(galPref);
    if (cur) cur.setAttribute('aria-label', galPref === 'random' ? 'ノリで' : GALS[galPref].name);
  }

  // ---------- house ----------
  const PER_PAGE = 3;
  const roomOrder = () => [ME, ...RESIDENTS.map(r => r.who).filter(w => w !== ME)].filter(w => RESIDENTS.some(r => r.who === w));
  function renderRooms() {
    const lit = cleared(), order = roomOrder(), plan = $('plan');
    plan.querySelectorAll('.scene.rooms-page').forEach(n => n.remove());
    for (let page = 0; page * PER_PAGE < Math.max(order.length, 1); page++) {
      const scene = document.createElement('div'); scene.className = 'scene rooms-page'; scene.dataset.scene = 'rooms'; scene.dataset.page = page;
      scene.setAttribute('aria-label', 'みんなの部屋' + (order.length > PER_PAGE ? ' ' + (page + 1) : ''));
      const sv = document.createElement('div'); sv.className = 'sv sv-hall'; const doors = document.createElement('div'); doors.className = 'doors';
      order.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).forEach(who => {
        const mine = state.posts.filter((p) => p.who === who), on = lit.has(who);
        const b = document.createElement('button'); b.type = 'button'; b.dataset.who = who;
        b.className = 'door' + (on ? ' is-lit' : '') + (state.newRoom === who ? ' is-new' : '') + (who === ME ? ' is-me' : '');
        b.style.setProperty('--tint', THEMES[themeOf(who)].accent);
        b.setAttribute('aria-label', nameOf(who) + (who === ME ? '（自分）' : '') + 'の部屋：' + (mine.length ? '今日' + mine.length + '個クリア' : 'まだ') + '。タップで中に入る');
        b.innerHTML = '<span class="door-window" aria-hidden="true"></span><span class="door-hanger" aria-hidden="true"></span><span class="door-plate"></span><span class="door-knob" aria-hidden="true"></span>';
        b.querySelector('.door-plate').textContent = nameOf(who);
        b.addEventListener('click', () => showRoom(who));
        doors.append(b);
      });
      sv.append(doors); scene.append(sv); plan.append(scene);
    }
    renderHallIcons();
    renderDots();
    // map
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
      doers.forEach((w) => dots.append(dotOf(w)));
    });
  }
  document.querySelectorAll('[data-chore]').forEach((el) => el.addEventListener('click', () => {
    const id = el.dataset.chore;
    if (id !== 'meal' && (state.doneToday[id] || []).includes(ME)) { toast('今日の' + TASKS[id].label + 'はクリア済み'); return; }
    openSheet(id);
  }));

  function renderNotes() {
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

  function renderAll() {
    document.body.style.setProperty('--my-outfit', outfitOf(themeOf(ME)));
    renderRooms(); renderNotes(); renderPose();
    boardView.update(dashboard, [...state.posts, ...state.history.flatMap(d => d.posts)]);
    if (!$('room-view').hidden) showRoom(currentRoom, true);
  }

  // ---------- views ----------
  let currentRoom = '';
  function showHouse() { document.body.classList.add('no-scroll'); $('board-view').hidden = true; $('room-view').hidden = true; $('house-view').hidden = false; window.scrollTo(0, 0); if (window.__goScene) window.__goScene(); }
  const roomTheme = themeOf;
  function renderPaint() {
    const pop = $('paint-pop'); pop.replaceChildren();
    Object.entries(THEMES).forEach(([k, t]) => {
      const owner = RESIDENTS.find(r => r.who !== ME && themeOf(r.who) === k);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'paint-chip' + (roomTheme(ME) === k ? ' is-on' : '') + (owner ? ' is-taken' : '');
      b.style.background = 'linear-gradient(135deg, ' + t.wall[1] + ' 0 50%, ' + t.accent + ' 50%)';
      b.setAttribute('aria-label', t.name + (owner ? '（' + nameOf(owner.who) + 'の色）' : '')); b.setAttribute('aria-pressed', roomTheme(ME) === k ? 'true' : 'false');
      b.disabled = !!owner; // one color per resident in a house
      // #98: the new color shows at once; the saved state follows (and corrects it on failure).
      b.addEventListener('click', () => { if (dashboard) { dashboard.house.members[ME].theme = k; receive(dashboard); } houseApi('/profile', { theme: k }, 'PUT').then(refresh).catch(e => { toast(e.message); void refresh(); }); });
      pop.append(b);
    });
  }
  function closePaint() { $('room-view').classList.remove('is-decorating'); $('paint-pop').hidden = true; $('room-paint').setAttribute('aria-expanded', 'false'); }
  $('room-paint').addEventListener('click', () => { const p = $('paint-pop'); p.hidden = !p.hidden; $('room-view').classList.toggle('is-decorating', !p.hidden); $('room-paint').setAttribute('aria-expanded', p.hidden ? 'false' : 'true'); });
  function showRoom(who, refresh) {
    currentRoom = who;
    const mine = state.posts.filter((p) => p.who === who);
    const lit = mine.length > 0;
    const theme = THEMES[roomTheme(who)];
    const col = roomTheme(who), hex = theme.accent;
    const S2 = 'stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
    const box = $('room-detail');
    box.innerHTML =
      '<div class="myroom w-' + col + (lit ? ' is-lit' : '') + '">' +
        '<div class="mr-plate"><b></b><span></span></div>' +
        '<svg class="mr-lamp" data-furniture="room-lamp" viewBox="0 0 60 120" aria-hidden="true"><use href="/furniture/room-lamp.svg#art"/></svg>' +
        '<svg class="mr-window" data-furniture="room-window" viewBox="0 0 110 100" aria-hidden="true"><use href="/furniture/room-window-' + (lit ? 'day' : 'night') + '.svg#art"/></svg>' +
        '<p class="mr-cap mr-cap-wall">壁に飾ったプリ</p>' +
        '<div class="mr-frames"></div>' +
        '<div class="mr-shelf"><p class="mr-cap">今日ゲットしたもの</p><div class="mr-items"></div></div>' +
        '<button class="mr-album" type="button" aria-label="アルバム（これまでの記録）"><svg viewBox="0 0 60 52" aria-hidden="true"><g ' + S2 + '><rect x="6" y="6" width="16" height="44" rx="2" fill="#FFFFFF"/><rect x="18" y="4" width="18" height="46" rx="2" fill="' + hex + '"/><path d="M22 12h10M22 18h6" stroke-width="2"/><rect x="32" y="10" width="22" height="40" rx="3" fill="#FFF4A8" transform="rotate(8 43 30)"/><path d="M38 22l4 3l6-6" stroke-width="2" transform="rotate(8 43 30)"/></g></svg></button>' +
        '<span class="mr-rug" aria-hidden="true"></span>' +
        '<svg class="mr-bed" data-furniture="room-bed" viewBox="0 0 170 100" aria-hidden="true"><use href="/furniture/room-bed.svg#art"/></svg>' +
        '<svg class="mr-desk" data-furniture="room-desk" viewBox="0 0 120 110" aria-hidden="true"><use href="/furniture/room-desk.svg#art"/></svg>' +
        roomGal(dashboard, who) +
        '<div class="mr-dark"><p></p></div>' +
      '</div>';
    $('room-view').style.background = 'repeating-linear-gradient(90deg, ' + theme.wall[0] + ' 0 18px, ' + theme.wall[1] + ' 18px 36px)';
    box.querySelector('.myroom').style.setProperty('--mr-rug', theme.rug);
    box.querySelector('.myroom').style.setProperty('--mr-wall', 'repeating-linear-gradient(90deg, ' + theme.wall[0] + ' 0 18px, ' + theme.wall[1] + ' 18px 36px)');
    box.querySelector('.myroom').style.setProperty('--mr-accent', hex); // furniture files use it for the theme color (#101)
    $('room-paint').hidden = who !== ME;
    if (who !== ME) closePaint();
    renderPaint();
    box.querySelector('.mr-plate b').textContent = (nameOf(who) + (who === ME ? '（自分）' : '')) + 'の部屋';
    box.querySelector('.mr-plate span').textContent = lit ? '電気ついてる・今日' + mine.length + '個クリア' : 'まだ真っ暗';
    box.querySelector('.mr-dark p').textContent = who === ME ? 'まだ真っ暗…家事を1つでもやると電気がつくよ' : nameOf(who) + 'はまだ寝てるっぽい…';
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
      document.body.classList.add('no-scroll'); $('house-view').hidden = true; $('board-view').hidden = true; $('room-view').hidden = false;
      $('room-view').style.animation = 'none'; void $('room-view').offsetWidth; $('room-view').style.animation = '';
      window.scrollTo(0, 0); $('room-back').focus();
    }
  }
  $('room-back').addEventListener('click', () => { closePaint(); window.__toHall = true; showHouse(); });
  // けーじばん: opens from the board in the entrance, ← goes back there.
  const boardView = setupBoardView({ nameOf, iconOf, themeOf, galOf: memberGal, toast,
    openPost: (posts, index) => openPhotos(posts.map(p => ({ p, day: p.day === dashboard.state.day ? '今日' : dayLabel(offOf(p.day)) })), index),
    onClose: () => { window.__toScene = sceneIndexOf('entry'); showHouse(); } });
  $('open-board').addEventListener('click', () => boardView.open());

  function openRoom(who) {
    const mine = state.posts.filter((p) => p.who === who);
    sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title"></h2><div class="room-log"></div>';
    sheetBody.querySelector('.sheet-title').textContent = (who === ME ? '自分' : nameOf(who)) + 'の部屋';
    const log = sheetBody.querySelector('.room-log');
    if (!mine.length) {
      const p = document.createElement('p'); p.className = 'sheet-text';
      p.textContent = who === ME ? 'まだ今日の記録はないよ。家具をタップして家事をはじめてみよ。' : 'まだ電気ついてない。ゆるく待と。';
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
    darupoyoRecords.addChoice(choice, toApi(id), () => sheet.close());
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
      if (id === 'meal' || id === 'trash') { photoTaskResult(id, c, gal, body, blob, kind, voice, fields); return; }
      sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">記録する？</h2><div class="result-card" role="group" aria-label="結果"><span class="result-label"></span><b class="result-main"></b><span class="result-sub"></span></div><p class="sheet-text">できたことをお部屋に残そう。</p><label class="post-caption"><span>ひとこと（30文字まで・なくてもOK）</span><input maxlength="30" placeholder="きょうもえらかった〜" autocomplete="off"></label><button class="btn btn-main" id="post">部屋に飾る</button><button class="btn btn-sub" id="redo">やり直す</button>';
      const shown = resultOf(c, fields, result || {});
      sheetBody.querySelector('.result-label').textContent = shown.label;
      sheetBody.querySelector('.result-main').textContent = shown.main;
      sheetBody.querySelector('.result-sub').textContent = shown.sub || '';
      sheetBody.querySelector('.result-sub').hidden = !shown.sub;
      if (voice) { const url = URL.createObjectURL(voice); sheetBody.querySelector('.result-card').append(voiceButton(() => url)); signal.addEventListener('abort', () => URL.revokeObjectURL(url), { once: true }); }
      if (blob) { const img = document.createElement('img'); const url = URL.createObjectURL(blob); img.src = url; img.style.cssText = 'width:100%;max-height:30vh;object-fit:contain'; sheetBody.querySelector('p').after(img); signal.addEventListener('abort', () => URL.revokeObjectURL(url), { once: true }); }
      // 「この切り抜きを使う」の直後に、ギャルが切り抜きをほめる（#109）。記録後のほめ言葉とは別。端末内の定型文で通信なし。
      if (kind === 'cutout' && GALS[gal].lines.cutout) {
        const praise = document.createElement('div'); praise.className = 'verdict cutout-praise'; praise.innerHTML = galIcon(gal) + '<p class="bubble"><span class="gal-text"></span></p>';
        praise.querySelector('.gal-text').textContent = GALS[gal].lines.cutout;
        sheetBody.querySelector('.result-card').after(praise);
        galVoice(gal, GALS[gal].lines.cutout);
      }
      $('redo').onclick = () => { captureController.abort(); openSheet(id); };
      $('post').onclick = async () => {
        const button = $('post'); setBusy(button, true, '飾っています…'); $('redo').disabled = true; $('sheet-close').disabled = true;
        // The word goes with the first try and stays the same on a retry (same request).
        const word = sheetBody.querySelector('.post-caption input');
        if (!word.disabled) { body.caption = word.value.trim(); word.disabled = true; }
        try {
          if (blob && !body.media_id) body.media_id = (await houseApi('/media?kind=' + kind, blob)).id;
          // A confirmed recording must not disappear silently on upload failure.
          if (voice && !body.voice_media_id) body.voice_media_id = (await houseApi('/media?kind=voice', voice)).id;
          const result = await houseApi('/completions', body);
          void refresh().catch(e => toast(e.message)); // #98: show the result now; the house catches up
          sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">記録できた！</h2><div class="verdict">' + galIcon(gal) + '<p class="bubble"><span class="gal-text"></span></p></div><button class="btn btn-main" id="finish">お部屋へ</button>';
          sheetBody.querySelector('.gal-text').textContent = result.post.praise.text;
          sfx.clear(); setTimeout(() => galVoice(gal, result.post.praise.text), 550);
          $('finish').onclick = () => { sheet.close(); showHouse(); toast('部屋に飾った。電気ついたね'); };
        } catch (e) { toast(e.message); setBusy(button, false); button.disabled = false; if ($('redo')) $('redo').disabled = false; }
        finally { $('sheet-close').disabled = false; }
      };
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.name === 'NoHitError') { showNoHit(id, c, e); return; }
      openSheet(id); toast(deviceMessage(e, id));
    }
  }
  // Photo tasks (Figma 写真のタスク): the word was written with the photo. ゴミ出し is sent right
  // from its card (プレゼントを届ける); ごはん asks once more after いただきます (04). Both end on
  // a card with the photo, the word and the gal's line, and a way to けーじばん (05 / 11).
  async function sendRecord(body, blob, kind, voice) {
    if (blob && !body.media_id) body.media_id = (await houseApi('/media?kind=' + kind, blob)).id;
    // A confirmed recording must not disappear silently on upload failure.
    if (voice && !body.voice_media_id) body.voice_media_id = (await houseApi('/media?kind=voice', voice)).id;
    const result = await houseApi('/completions', body);
    void refresh().catch(e => toast(e.message)); // #98: show the result now; the house catches up
    return result;
  }
  function photoTaskResult(id, c, gal, body, blob, kind, voice, fields) {
    const send = async button => {
      setBusy(button, true, id === 'trash' ? '届けてるよ…' : 'みせてるよ…'); $('sheet-close').disabled = true;
      try { const result = await sendRecord(body, blob, kind, voice); photoTaskDone(id, c, gal, result.post, blob); }
      catch (e) { toast(e.message); setBusy(button, false); button.disabled = false; }
      finally { $('sheet-close').disabled = false; }
    };
    if (id === 'trash') { void send(sheetBody.querySelector('.capture-use')); return; }
    const heard = fields.method === 'photo_voice';
    sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">記録する？</h2><section class="result-panel" aria-label="結果"><h3 class="result-main"></h3><p class="result-sub"></p><button class="btn btn-main" id="post">みんなに見せる</button></section>';
    sheetBody.querySelector('.result-main').textContent = heard ? '「いただきます」聞こえた！' : '写真で記録できるよ';
    sheetBody.querySelector('.result-sub').textContent = heard ? '声を確認したよ。写真といっしょに残そ！' : 'ちゃんと食べてえらい。写真だけで残そ！';
    if (voice) { const url = URL.createObjectURL(voice); sheetBody.querySelector('.result-sub').after(voiceButton(() => url)); }
    $('post').onclick = () => send($('post'));
  }
  function photoTaskDone(id, c, gal, post, blob) {
    sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title"></h2><p class="sheet-text">記録できたよん。今日もえらい！</p><img class="done-photo" alt="記録した写真"><p class="done-caption"></p><div class="verdict done-verdict"><p class="bubble"><span class="gal-text"></span></p></div><button class="btn btn-main" id="to-board">け〜じばんをちぇけらする</button>';
    $('sheet-title').textContent = id === 'meal' ? 'きょうのごはん' : c.title;
    const photo = sheetBody.querySelector('.done-photo');
    if (blob) { const url = URL.createObjectURL(blob); photo.src = url; sheet.addEventListener('close', () => URL.revokeObjectURL(url), { once: true }); } else photo.remove();
    const word = sheetBody.querySelector('.done-caption'); word.textContent = post.caption || ''; word.hidden = !post.caption;
    sheetBody.querySelector('.done-verdict').insertAdjacentHTML('afterbegin', galIcon(gal));
    sheetBody.querySelector('.gal-text').textContent = post.praise.text;
    sfx.clear(); setTimeout(() => galVoice(gal, post.praise.text), 550);
    $('to-board').onclick = () => { sheet.close(); showHouse(); $('open-board').click(); };
    $('to-board').focus();
  }
  // 録音した「いただきます」を再生するボタン（#9）。src() は再生する音の URL を返す。
  const voiceUrls = new Map();
  const voiceOf = (id) => { if (!voiceUrls.has(id)) voiceUrls.set(id, houseApi('/media/' + id).then(URL.createObjectURL).catch((e) => { voiceUrls.delete(id); throw e; })); return voiceUrls.get(id); };
  let playing = null;
  function voiceButton(src, phrase = 'いただきます') {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'voice-play';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>いただきます を聞く</span>';
    b.querySelector('span').textContent = phrase + ' を聞く';
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
    if (fields.method === 'rhythm') return { label: 'リズム', main: fields.hits + ' / ' + fields.total_beats + ' ヒット', sub: 'よき ' + (result.good || 0) + '・まあまあ ' + (fields.hits - (result.good || 0)) };
    if (fields.method === 'sound') return { label: 'ドライヤーの音', main: Math.floor(fields.duration_seconds) + '秒 聞こえた', sub: '10秒でクリア' };
    if (fields.method === 'photo_voice') return { label: 'ごはん', main: '「いただきます」聞こえた！', sub: 'AI（Gemini）が声を確認したよ。写真といっしょに残すよ' };
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

  let toastTimer = null;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400); }

  const TAP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10h.4V8.8a1.5 1.5 0 0 1 3 0V10.4a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.8a5 5 0 0 1-4.1-2.1l-2.8-3.9a1.5 1.5 0 0 1 2.3-1.9L9 15z" fill="#FFFFFF" stroke="#3B2560" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 5.5l-1.6-1M10.5 1.8V.2M16 5.5l1.6-1" stroke="#3B2560" stroke-width="1.6" stroke-linecap="round"/></svg>';
  window.__tapMark = (el) => { if (el.querySelector(':scope > .tap-mark')) return; const m = document.createElement('span'); m.className = 'tap-mark'; m.setAttribute('aria-hidden', 'true'); m.innerHTML = TAP_SVG; el.append(m); };
  document.querySelectorAll('.sv-hit, #open-board').forEach(window.__tapMark);

  function receive(data) {
    dashboard = data; ME = client.uid;
    if (data.house.members[ME]?.gal) { galPref = data.house.members[ME].gal; try { localStorage.setItem('cyl-gal', galPref); } catch {} setAppIcon(galPref); }
    THEME_OF = residentThemes(data.house);
    RESIDENTS = data.house.member_ids.map(who => ({ who, color: THEME_OF[who] }));
    const convert = convertPost;
    state.posts = data.posts.filter(p=>p.day===data.state.day).map(convert);
    state.history = [...new Set(data.posts.map(p=>p.day))].filter(day=>day!==data.state.day).map(day=>({ off:Math.round((Date.parse(day)-Date.parse(data.state.day))/86400000), posts:data.posts.filter(p=>p.day===day).map(convert) }));
    state.doneToday = {};
    Object.entries(data.state.completed).forEach(([uid,chores])=>chores.forEach(t=>{ (state.doneToday[fromApi(t)] ||= []).push(uid); }));
    state.originals = Object.fromEntries(Object.entries(data.state.poses).map(([t,p])=>[fromApi(t),{ ...p, fig:0, by:p.user_id }]));
    if (!data.house.member_ids.includes(currentRoom)) currentRoom = ME;
    document.querySelector('.account-row b').textContent = nameOf(ME);
    document.querySelector('.account-row small').textContent = data.house.name + '・' + RESIDENTS.length + '人';
    updateSettingsHouse(data.house, nameOf, ME);
    forgetHistory(); renderSocial();
    renderAccountForm();
    renderAll();
    placeGals();
    darupoyoRecords.update(data);
    furniturePlay.update(data);
    if (!greeted) { greeted = true; greet(); }
  }
  // #121: gals stand where their resident last finished a chore, and walk back to their room after 5 minutes.
  let galTimer;
  function placeGals() {
    clearTimeout(galTimer);
    if (!dashboard) return;
    renderActivities(dashboard);
    if (!$('room-view').hidden) showRoom(currentRoom, true);
    const wait = nextReturn(dashboard);
    if (wait !== null) galTimer = setTimeout(placeGals, wait);
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
  const accountForm = $('account-form'), houseForm = $('house-form');
  function renderAccountForm() {
    if (accountForm.hidden) accountForm.elements.display_name.value = nameOf(ME);
    if (houseForm.hidden) houseForm.elements.house_name.value = dashboard.house.name;
  }
  function setupNameEditor(form, edit, row, field, current, endpoint, key) {
    const toggle = open => {
      if (open) form.elements[field].value = current();
      const hadFocus = form.contains(document.activeElement);
      form.hidden = !open; row.hidden = open;
      edit.setAttribute('aria-expanded', String(open));
      if (open) form.elements[field].focus(); else if (hadFocus) edit.focus();
    };
    edit.addEventListener('click', () => toggle(form.hidden));
    form.querySelector('.account-cancel').addEventListener('click', () => toggle(false));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const value = form.elements[field].value.trim();
      if (!value) { toast('名前を入力してね'); return; }
      const save = form.querySelector('[type=submit]');
      if (save.disabled) return;
      save.disabled = true;
      try {
        if (value !== current()) await houseApi(endpoint, { [key]: value }, 'PUT');
        toggle(false); await refresh(); toast('変更したよ');
      } catch (err) { toast(err.message); } finally { save.disabled = false; }
    });
    $('settings').addEventListener('close', () => toggle(false));
  }
  setupNameEditor(accountForm, $('account-edit'), document.querySelector('.account-row'), 'display_name', () => nameOf(ME), '/profile', 'display_name');
  setupNameEditor(houseForm, $('house-edit'), document.querySelector('.house-name-row'), 'house_name', () => dashboard.house.name, '', 'name');
  const logoutButton = $('settings-logout'); logoutButton.disabled = false; logoutButton.textContent = 'ログアウト'; logoutButton.onclick = () => disablePush().finally(() => logout().catch(e=>toast(e.message)));

  const deleteDialog = document.createElement('dialog'); deleteDialog.className = 'delete-dialog';
  deleteDialog.setAttribute('aria-label', 'アカウント削除の確認');
  deleteDialog.innerHTML = '<h2>アカウントを削除しますか？</h2><p>本人の写真・音声・投稿・リアクション・通知登録を削除し、すべてのハウスから退去します。他の住人の記録は残ります。最後の住人の場合はハウスも削除します。</p><p>この操作は元に戻せません。本人確認のため、Googleへの再ログインが必要です。</p><label><input type="checkbox">削除する内容を確認しました</label><p role="status"></p><button type="button" class="btn btn-sub" data-cancel>やめる</button><button type="button" class="btn btn-main" data-confirm disabled>アカウントとデータを削除</button>';
  document.body.append(deleteDialog);
  const confirmDelete = deleteDialog.querySelector('[data-confirm]'), cancelDelete = deleteDialog.querySelector('[data-cancel]'), acknowledged = deleteDialog.querySelector('input');
  let deleting = false;
  $('delete-account').onclick = () => { acknowledged.checked = false; confirmDelete.disabled = true; deleteDialog.querySelector('[role=status]').textContent = ''; deleteDialog.showModal(); };
  acknowledged.onchange = () => { confirmDelete.disabled = !acknowledged.checked; };
  cancelDelete.onclick = () => deleteDialog.close();
  deleteDialog.addEventListener('cancel', e => { if (deleting) e.preventDefault(); });
  confirmDelete.onclick = async () => {
    deleting = true; confirmDelete.disabled = cancelDelete.disabled = acknowledged.disabled = true;
    deleteDialog.querySelector('[role=status]').textContent = '本人確認とデータの削除をしています…';
    try { await deleteAccount(); }
    catch (e) { deleteDialog.querySelector('[role=status]').textContent = '削除を完了できませんでした。再試行できます。' + e.message; }
    finally { deleting = false; confirmDelete.disabled = cancelDelete.disabled = acknowledged.disabled = false; }
  };
  const renderSocial = setupSocialSettings(() => dashboard?.house.members[ME], (m) => toast(m));
  start(receive, e => toast(e.message)).catch(e => { const notice = document.createElement('p'); notice.className = 'connection-status'; notice.textContent = e.message + '。Backend起動後に再読み込みしてください。'; document.body.append(notice); });

  document.body.classList.add('no-scroll');

  // ---------- walk between rooms ----------
  startAmbience();
  setupMoments();
  setupCritters();
  const plan = $('plan'), scenes = () => [...plan.querySelectorAll('.scene')];
  const sceneIndexOf = (name, page = 0) => Math.max(0, scenes().findIndex(sc => sc.dataset.scene === name && (sc.dataset.page == null || Number(sc.dataset.page) === page)));
  let sceneIdx = 1;
  function goScene(i, instant) {
    sceneIdx = Math.max(0, Math.min(scenes().length - 1, i));
    plan.scrollTo({ left: sceneIdx * plan.clientWidth, behavior: instant ? 'auto' : 'smooth' });
    markScene();
  }
  function renderDots() {
    const box = $('scene-dots'); box.replaceChildren();
    scenes().forEach((sc, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'scene-dot';
      b.setAttribute('aria-label', sc.getAttribute('aria-label') + 'へ');
      b.addEventListener('click', () => goScene(k)); box.append(b);
    });
    markScene();
  }
  // Residents along the bottom of みんなの部屋; those whose door is not on this page are dimmed.
  function renderHallIcons() {
    const box = $('hall-icons'); box.replaceChildren();
    roomOrder().forEach(who => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'hall-icon'; b.dataset.who = who;
      b.setAttribute('aria-label', nameOf(who) + (who === ME ? '（自分）' : '') + 'の部屋に入る');
      b.append(iconOf(who)); b.addEventListener('click', () => showRoom(who)); box.append(b);
    });
  }
  function markScene() {
    const here = scenes()[sceneIdx];
    [...$('scene-dots').children].forEach((d, k) => { d.toggleAttribute('aria-current', k === sceneIdx); d.classList.toggle('has-done', !!scenes()[k]?.querySelector('.sv-hit.is-done, .door.is-lit')); });
    const page = here?.dataset.scene === 'rooms' ? Number(here.dataset.page) : null;
    $('hall-bar').hidden = page === null;
    const shown = new Set(roomOrder().slice((page || 0) * PER_PAGE, (page || 0) * PER_PAGE + PER_PAGE));
    [...$('hall-icons').children].forEach(b => b.classList.toggle('is-away', !shown.has(b.dataset.who)));
  }
  let st;
  plan.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { const i = Math.round(plan.scrollLeft / plan.clientWidth); if (i !== sceneIdx) { sceneIdx = i; markScene(); } }, 60); });
  document.addEventListener('keydown', (e) => { if ($('house-view').hidden || document.querySelector('dialog[open]')) return; if (e.key === 'ArrowLeft') goScene(sceneIdx - 1); if (e.key === 'ArrowRight') goScene(sceneIdx + 1); });
  window.addEventListener('resize', () => goScene(sceneIdx, true));
  new MutationObserver(markScene).observe(plan, { subtree: true, attributes: true, attributeFilter: ['class'] });
  // 「おかえり」: every time the app opens, your gal peeks out of the front door.
  let greeted = false;
  function greet() {
    const box = $('okaeri'), gal = GALS[galPref] ? galPref : pickGal();
    box.innerHTML = '<span class="okaeri-peek"><span class="okaeri-gal">' + galCharacter(gal, themeOf(ME)) + '</span></span><p class="okaeri-bubble">おかえり〜！</p>';
    box.classList.remove('is-out'); void box.offsetWidth; box.classList.add('is-out');
    setTimeout(() => galVoice(gal, 'おかえり〜！'), 450);
    setTimeout(() => box.classList.remove('is-out'), 4200);
  }
  const settings = $('settings');
  $('open-settings').addEventListener('click', () => { renderSocial(); renderGalPicker(); renderPush(); renderSound(); settings.showModal(); $('settings-title').focus(); });
  // ---------- phone notifications (#58) ----------
  const PUSH_NOTES = { install: 'iPhone はホーム画面に追加すると通知をうけとれるよ（共有 → ホーム画面に追加）', blocked: 'スマホの設定で、だるぽよの通知を許可してね' };
  async function renderPush() {
    const state = await pushState().catch(() => 'unsupported');
    const card = $('push-card'), button = $('push-toggle'), note = $('push-note');
    card.hidden = state === 'unsupported';
    const on = state === 'ready' && pushOn();
    button.disabled = state !== 'ready'; button.querySelector('img').src = '/settings/' + (on ? 'c8fcf' : '6b989') + '.svg'; button.setAttribute('aria-pressed', String(on));
    note.hidden = !PUSH_NOTES[state]; note.textContent = PUSH_NOTES[state] || '';
  }
  $('push-toggle').addEventListener('click', async () => {
    const button = $('push-toggle'), note = $('push-note'); button.disabled = true;
    button.setAttribute('aria-busy', 'true'); note.hidden = false; note.textContent = '設定中…';
    let error;
    try {
      if (pushOn()) { await disablePush(); toast('通知をオフにしたよ'); }
      else { await enablePush(galPref); toast('通知をオンにしたよ'); }
    } catch (e) { error = e.message; toast(error); }
    await renderPush(); button.removeAttribute('aria-busy');
    if (error) { note.hidden = false; note.textContent = error; }
  });
  listenInApp((body) => { sfx.ding(); toast(body); });
  // ---------- sound effects (#8 #17) ----------
  function renderSound() { const on = soundOn(), b = $('sound-toggle'); b.querySelector('img').src = '/settings/' + (on ? 'c8fcf' : '6b989') + '.svg'; b.setAttribute('aria-pressed', String(on)); }
  $('sound-toggle').addEventListener('click', () => { setSound(!soundOn()); renderSound(); sfx.pop(); });
  $('settings-close').addEventListener('click', () => settings.close());
  $('open-howto').addEventListener('click', () => { $('howto-page').showModal(); $('howto-title').focus(); });
  $('howto-close').addEventListener('click', () => $('howto-page').close());
  // 初めて家に入ったときだけ、あそびかたを自動で開く
  window.addEventListener('darupoyo:entered', () => {
    const KEY = 'darupoyo-howto-seen';
    try { if (localStorage.getItem(KEY)) return; localStorage.setItem(KEY, '1'); } catch (e) { return; }
    $('howto-page').showModal();
  });
  // Back from a room: the page of みんなの部屋 with that door.
  window.__goScene = () => requestAnimationFrame(() => { if (window.__toHall) { sceneIdx = sceneIndexOf('rooms', Math.floor(Math.max(0, roomOrder().indexOf(currentRoom)) / PER_PAGE)); window.__toHall = false; } if (window.__toScene != null) { sceneIdx = window.__toScene; window.__toScene = null; } goScene(sceneIdx, true); });
  renderDots();
  requestAnimationFrame(() => goScene(sceneIndexOf('entry'), true));
})();
