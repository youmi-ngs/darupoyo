import { client, start, houseApi, refresh, inviteLink, logout } from './backend.js';
import { capture } from './media.js';
(() => {
  const TASKS = {
    laundry: { label: '洗濯', color: 'cyan',
      presets: [{ id: 'wizard', name: '魔法使い', hint: '洗濯物をはたいて、杖みたいにふる', fig: 8, praise: '洗濯物の魔法使い、爆誕。えらすぎ。' }],
      sound: { title: 'バサバサ音を録る', hint: '洗濯物をはたく音を10秒', listen: 'バサバサ音、聞いてる…', praise: 'バサバサ音、ちゃんと聞こえた。えらすぎ。' } },
    meal: { label: 'ごはん', color: 'pink',
      photo: { title: 'ごはんを撮る', hint: 'ごはんの写真で記録する', look: 'ごはん、確認するね…', praise: 'いただきます、ちゃんと聞こえた。今日の私、優勝。' } },
    dryer: { label: 'ドライヤー', color: 'lilac',
      sound: { title: 'ドライヤーの音を録る', hint: '10秒つづくとゲージがたまる', listen: 'ドライヤーの音、聞いてる…', praise: 'ドライヤーの音、10秒ちゃんと聞こえた。天才。' } },
    trash: { label: 'ゴミ捨て', color: 'lime',
      presets: [
        { id: 'santa', name: 'サンタ', hint: 'ゴミ袋を肩にかついで', fig: 6, praise: 'サンタ（ゴミ）来た。えらすぎ。' },
        { id: 'thief', name: '泥棒', hint: 'ゴミ袋をかついで、こっそり', fig: 7, praise: '泥棒（ゴミ）、確保。えらすぎ。' }
      ] }
  };
  const ORDER = ['laundry', 'meal', 'dryer', 'trash'];
  const REWARD = {
    laundry: { verb: '洗濯をして', item: 'いい匂いの服' },
    meal: { verb: 'ごはんを食べて', item: 'ツヤ肌' },
    dryer: { verb: 'ドライヤーをして', item: '美髪' },
    trash: { verb: 'ゴミを出して', item: 'スッキリ玄関' }
  };
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
  const S = 'stroke="#3B2560" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const POSES = [
    '<g ' + S + '><circle cx="60" cy="58" r="11" fill="#FFFFFF"/><path d="M60 70v34M60 80l-22-18M60 80l24-6M60 104l-16 26M60 104l20 22"/></g>',
    '<g ' + S + '><circle cx="58" cy="56" r="11" fill="#FFFFFF"/><path d="M58 68l4 36M60 78l-26 4M60 78l20-26M62 104l-24 18M62 104l12 28"/></g>',
    '<g ' + S + '><circle cx="62" cy="60" r="11" fill="#FFFFFF"/><path d="M62 72v32M62 82l-20-24M62 82l20-24M62 104l-22 10M62 104l22 10"/></g>',
    '<g ' + S + '><circle cx="58" cy="58" r="11" fill="#FFFFFF"/><path d="M58 70v34M58 80l-18 18M58 80l18-6l-2-16M74 58l-4-10M74 58l4-10M58 104l-12 26M58 104l14 26"/></g>',
    '<g ' + S + '><circle cx="60" cy="62" r="11" fill="#FFFFFF"/><path d="M60 74v30M60 82l-16-20l16-24M60 82l16-20l-16-24M60 104l-14 26M60 104l14 26"/></g>',
    '<g ' + S + '><circle cx="60" cy="54" r="11" fill="#FFFFFF"/><path d="M60 66v36M60 76l-24 6M60 76l24 6M60 102v30M60 102l18 6l-8 14"/></g>',
    '<g ' + S + '><circle cx="78" cy="50" r="20" fill="#FFFFFF" stroke-width="4"/><path d="M70 30q8-8 16 0" stroke-width="4"/><circle cx="54" cy="60" r="11" fill="#FFFFFF"/><path d="M54 72v32M54 80l14-20M54 82l-18 14M54 104l-14 26M54 104l14 26"/></g>',
    '<g ' + S + '><circle cx="86" cy="64" r="18" fill="#FFFFFF" stroke-width="4"/><circle cx="50" cy="66" r="11" fill="#FFFFFF"/><path d="M42 64h16" stroke-width="4"/><path d="M54 77l8 26M57 86l18-10M57 86l-20 6M62 103l-20 22M62 103l18 24"/></g>',
    '<g ' + S + '><path d="M46 46l14-22l14 22z" fill="#FFFFFF" stroke-width="4"/><circle cx="60" cy="56" r="10" fill="#FFFFFF"/><path d="M60 66v38M60 76l22-20M60 78l-20 14M60 104l-14 26M60 104l14 26"/><path d="M82 56l10-16" stroke-width="3"/><path d="M90 30l2 6l6 2l-6 2l-2 6l-2-6l-6-2l6-2z" fill="#FFF4A8" stroke-width="2"/></g>'
  ];
  const ORIGINAL_FIGS = [0, 1, 2, 3, 4, 5];
  const figSvg = (i) => '<svg viewBox="0 0 120 144" aria-hidden="true">' + POSES[i % POSES.length] + '</svg>';
  const MEAL_SVG = '<svg viewBox="0 0 120 144" aria-hidden="true"><g stroke="#3B2560" stroke-width="4" fill="none" stroke-linecap="round"><ellipse cx="60" cy="96" rx="34" ry="12" fill="#FFFFFF"/><path d="M34 92q26-34 52 0" fill="#FFF4A8"/><path d="M92 58v44M98 58v44"/></g></svg>';

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
  $('photo-modal').addEventListener('click', (e) => { if (e.target === $('photo-modal')) $('photo-modal').close(); });

  // ---------- gal AIs ----------
  const GH = '<circle cx="32" cy="36" r="17" fill="#FFE8DE"/>';
  const BL = '<ellipse cx="22" cy="42.5" rx="3.6" ry="2" fill="#FFB3C7" stroke="none"/><ellipse cx="42" cy="42.5" rx="3.6" ry="2" fill="#FFB3C7" stroke="none"/>';
  const EYES = '<ellipse cx="25" cy="38" rx="2.8" ry="3.4" fill="#3B2560"/><ellipse cx="39" cy="38" rx="2.8" ry="3.4" fill="#3B2560"/><circle cx="26" cy="36.8" r="1" fill="#FFFFFF" stroke="none"/><circle cx="40" cy="36.8" r="1" fill="#FFFFFF" stroke="none"/>';
  const G = (inner) => '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#3B2560" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">' + inner + '</g></svg>';
  const GALS = {
    heisei: { name: '平成ギャル', tag: 'Y2K・あげぽよ', bg: '#FFF1D6',
      svg: G('<path d="M12 56 Q8 18 32 15 Q56 18 52 56 Q46 44 47 34 L17 34 Q18 44 12 56Z" fill="#D9A35B"/><circle cx="32" cy="36" r="17" fill="#F6CFAF"/><path d="M15 34 Q16 19 32 18 Q48 19 49 34 Q41 25 33 29 Q27 24 15 34Z" fill="#D9A35B"/><path d="M24 21 Q20 28 18 33" stroke="#FFE08A" stroke-width="3"/><rect x="39" y="21" width="9" height="3.4" rx="1.7" fill="#FF8FCB" transform="rotate(-22 43.5 22.7)"/><rect x="41" y="26" width="9" height="3.4" rx="1.7" fill="#A8E6FF" transform="rotate(-22 45.5 27.7)"/><path d="M21.5 35.5q3.5-2.2 7 0M35.5 35.5q3.5-2.2 7 0" stroke-width="2.6"/>' + EYES + '<path d="M21.6 41.4l-1.2 1.2M42.4 41.4l1.2 1.2"/>' + BL + '<path d="M29 44.5q3 2.6 6 0z" fill="#FF7FA0"/><path d="M45.5 45.5c-.8-1.2-2.6-.4-1.8.9l1.8 1.7 1.8-1.7c.8-1.3-1-2.1-1.8-.9z" fill="#FF8FCB" stroke-width="1.2"/>'),
      title: 'あげぽよ〜↑↑',
      lines: { laundry_pose: '魔法使いとかチョーうける！洗濯もできるとか神だし！', laundry_sound: 'バサバサ音きこえた〜！いい匂いの服ゲットとか最強だし', meal: 'いただきます入りました〜！ちゃんと食べるとかチョーえらいじゃん', dryer: 'ドライヤー10秒完走！髪サラサラでテンアゲ↑↑', trash_santa: 'ゴミのサンタ降臨〜！玄関スッキリでちょべりぐ', trash_thief: '泥棒ポーズうけるんだけど！ゴミ出しえらすぎだし', original_new: '一番乗りじゃん！このポーズ今日の流行り決定〜', original_copy: 'まねっこ完ぺき！うちらズッ友じゃん' } },
    reiwa: { name: '令和ギャル', tag: 'ビジュ・それな', bg: '#E9E3FF',
      svg: G('<path d="M12 58 Q9 16 32 15 Q55 16 52 58 L46 58 Q48 40 46 32 L18 32 Q16 40 18 58Z" fill="#F2C4CF"/><circle cx="32" cy="36" r="17" fill="#FFE8DE"/><path d="M15 41 Q14 20 32 18 Q50 20 49 41 Q46 27 34 22.5 L32 25.5 L30 22.5 Q18 27 15 41Z" fill="#F2C4CF"/>' + EYES + '<path d="M21.5 35.4l-1.4-1.1M42.5 35.4l1.4-1.1"/><path d="M21.6 42.2q3.4 1.6 6.8 0M35.6 42.2q3.4 1.6 6.8 0" stroke="#FF9FB8" stroke-width="1.6"/><ellipse cx="21" cy="44.5" rx="4" ry="1.8" fill="#FFB3C7" stroke="none"/><ellipse cx="43" cy="44.5" rx="4" ry="1.8" fill="#FFB3C7" stroke="none"/><path d="M29.5 45.6q2.5 2.2 5 0q-2.5-1.5-5 0z" fill="#FF6F91"/><circle cx="16" cy="45" r="1.6" fill="#FFFFFF"/><circle cx="48" cy="45" r="1.6" fill="#FFFFFF"/>'),
      title: 'え、天才すぎん？',
      lines: { laundry_pose: '魔法使いビジュ良すぎ。洗濯までやるとか優勝じゃん', laundry_sound: 'バサバサ音ガチで聞こえた。えぐい、えらすぎ', meal: 'いただきます聞こえた〜。ちゃんと食べるの、ありよりのあり', dryer: 'ドライヤーおつ〜。髪ツヤツヤでビジュ爆上がり', trash_santa: 'ゴミのサンタえぐ。玄関スッキリしか勝たん', trash_thief: '泥棒ポーズ天才？ゴミ出しまでできるの尊い', original_new: '一番乗りえぐい。このポーズ今日の正解ね', original_copy: 'まねっこ精度えぐ。それなすぎてシンクロ' } },
    kuro: { name: '黒ギャル', tag: '姉御・自分の機嫌は自分で', bg: '#FFF6C9',
      svg: G('<path d="M10 56 Q6 16 32 14 Q58 16 54 56 Q47 46 47 34 L17 34 Q17 46 10 56Z" fill="#FFF3C4"/><circle cx="32" cy="36" r="17" fill="#B97A57"/><path d="M15 34 Q17 18 33 17 Q48 18 49 32 Q40 22 28 28 Q22 30 15 34Z" fill="#FFF3C4"/><ellipse cx="25" cy="38" rx="4.4" ry="4.8" fill="none" stroke="#FFFFFF" stroke-width="1.8"/><ellipse cx="39" cy="38" rx="4.4" ry="4.8" fill="none" stroke="#FFFFFF" stroke-width="1.8"/>' + EYES + '<path d="M21 35l-1.4-1.3M43 35l1.4-1.3" stroke-width="2.4"/><ellipse cx="21" cy="43.5" rx="3.6" ry="2" fill="#F28A8A" stroke="none"/><ellipse cx="43" cy="43.5" rx="3.6" ry="2" fill="#F28A8A" stroke="none"/><path d="M28.5 44.5q3.5 3 7 0z" fill="#FFFFFF"/><circle cx="14" cy="47" r="4" fill="none" stroke="#FFD84D" stroke-width="2.2"/><circle cx="50" cy="47" r="4" fill="none" stroke="#FFD84D" stroke-width="2.2"/>'),
      title: 'やるじゃん！最強！',
      lines: { laundry_pose: '魔法使いアガる〜！だるいのにやったの、マジ最強だから', laundry_sound: 'バサバサいい音！明日の服いい匂い確定じゃん', meal: 'いただきます聞こえた！食べるのも立派な家事っしょ', dryer: 'ドライヤーおつかれ！自分の機嫌、自分でとれてえらい', trash_santa: 'ゴミ出しサンタ最高！玄関も気分もアガるね', trash_thief: 'こっそりでも出したら勝ち！ウチ見てたからね', original_new: '一番乗りアツい！みんなこのポーズについてきな〜', original_copy: 'まねっこバッチリ！仲間とそろうとアガるよね' } },
    hime: { name: '姫ギャル', tag: '盛り髪・リボン・♡', bg: '#FFE6F4',
      svg: G('<circle cx="32" cy="31" r="20" fill="#F6A9C8"/><circle cx="32" cy="17" r="12" fill="#F6A9C8"/><circle cx="12" cy="44" r="7" fill="#F6A9C8"/><circle cx="52" cy="44" r="7" fill="#F6A9C8"/><circle cx="14" cy="55" r="6" fill="#F6A9C8"/><circle cx="50" cy="55" r="6" fill="#F6A9C8"/><circle cx="32" cy="37" r="16.5" fill="#FFEBE3"/><path d="M15.5 36 Q17 22 32 21 Q47 22 48.5 36 Q44 29 38 31 Q35 26 32 29 Q29 26 26 31 Q20 29 15.5 36Z" fill="#F6A9C8"/><path d="M32 9l-10-5.5v11zM32 9l10-5.5v11z" fill="#FFFFFF"/><circle cx="32" cy="9" r="2.6" fill="#FF8FCB"/><ellipse cx="25" cy="39" rx="3" ry="3.8" fill="#3B2560"/><ellipse cx="39" cy="39" rx="3" ry="3.8" fill="#3B2560"/><circle cx="26.1" cy="37.6" r="1.1" fill="#FFFFFF" stroke="none"/><circle cx="40.1" cy="37.6" r="1.1" fill="#FFFFFF" stroke="none"/><path d="M21 36.2l-1.7-1.6M22.9 35.2l-.9-2M43 36.2l1.7-1.6M41.1 35.2l.9-2"/><ellipse cx="22" cy="43.5" rx="3.4" ry="1.9" fill="#FFB3C7" stroke="none"/><ellipse cx="42" cy="43.5" rx="3.4" ry="1.9" fill="#FFB3C7" stroke="none"/><path d="M30 44.8q2 2.6 4 0" fill="#FF8FA8"/>'),
      title: 'えらすぎて姫キュン…♡',
      lines: { laundry_pose: '魔法使いかわちい〜♡ 洗濯できる子、姫的に満点', laundry_sound: 'バサバサの音、ちゃんと届いたよ♡ いい匂いの服で無敵', meal: 'いただきます聞こえた♡ ちゃんと食べる子、かわいすぎ', dryer: 'ドライヤーおつかれさま♡ 髪サラサラで今日も姫', trash_santa: 'ゴミのサンタさん、きらきら♡ 玄関もお城みたい', trash_thief: '泥棒ちゃん、ハートまで盗まれたかも…♡', original_new: '一番乗り♡ このポーズ、今日のトレンドにしちゃお', original_copy: 'まねっこ上手すぎ♡ おそろいでテンションあがる' } }
  };
  const GAL_IDS = Object.keys(GALS);
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
      else { b.innerHTML = galIcon(id) + '<b></b><small></small><em></em>'; b.querySelector('b').textContent = GALS[id].name; b.querySelector('small').textContent = GALS[id].tag; b.querySelector('em').textContent = '「' + GALS[id].title + '」'; }
      b.addEventListener('click', () => { galPref = id; try { localStorage.setItem('cyl-gal', id); } catch (e) {} renderGalPicker(); });
      return b;
    };
    GAL_IDS.forEach((g) => box.append(mk(g)));
    box.append(mk('random'));
    const cur = $('gal-current');
    if (cur) cur.innerHTML = galPref === 'random' ? '<span class="gal-face gal-random">' + GAL_IDS.map((g) => '<i>' + GALS[g].svg + '</i>').join('') + '</span><small>ノリで</small>' : galIcon(galPref) + '<small>' + GALS[galPref].name + '</small>';
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
    if (!state.board.some((b) => b.id === id)) { state.board.push({ id, done: false }); saveGoals(); }
    renderAll();
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
    if (!state.board.length) { const p = document.createElement('span'); p.className = 'board-empty'; p.textContent = 'ここにマグネットを貼ってね'; boardMagnets.append(p); }
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
        x.addEventListener('click', () => { state.board = state.board.filter((b) => b.id !== item.id); saveGoals(); renderAll(); });
        wrap.append(x);
      }
      boardMagnets.append(wrap);
    });
    const open = state.board.filter((b) => !b.done).length;
    boardSub.textContent = !state.board.length ? '1個でいいよ〜' : open === 0 ? '今日のぶん終わり。えらすぎ。' : 'マグネットをタップしたらスタート';
  }
  function renderTray() {
    trayEl.replaceChildren();
    ORDER.filter((id) => !state.board.some((b) => b.id === id)).forEach((id) => {
      const m = magnetEl(id); m.setAttribute('aria-label', TASKS[id].label + 'をボードに貼る'); bindDrag(m, id); trayEl.append(m);
    });
  }
  function stick(id) { if (state.board.some((b) => b.id === id)) return; state.board.push({ id, done: false }); saveGoals(); renderAll(id); }
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
  const HEX = { pink: '#FFB3DE', cyan: '#A8E6FF', lilac: '#D9C2FF', lime: '#E6F7A0' };
  const ITEM_SVG = {
    laundry: '<path d="M20 6a4 4 0 1 1 4 4v3" fill="none"/><path d="M24 13L6 22h36z" fill="none"/><path d="M10 22l-4 6l6 3v15h24V31l6-3l-4-6z" fill="#A8E6FF"/>',
    meal: '<rect x="16" y="6" width="16" height="8" rx="2" fill="#FFFFFF"/><rect x="12" y="14" width="24" height="32" rx="8" fill="#FFB3DE"/><path d="M18 26q6 4 12 0" fill="none"/><path d="M38 10l2-4l2 4l4 2l-4 2l-2 4l-2-4l-4-2z" fill="#FFF4A8"/>',
    dryer: '<rect x="8" y="10" width="32" height="12" rx="4" fill="#D9C2FF"/><path d="M12 22v18M17 22v18M22 22v18M27 22v18M32 22v18M37 22v18" fill="none"/>',
    trash: '<path d="M24 4l4 14l14 4l-14 4l-4 14l-4-14l-14-4l14-4z" fill="#E6F7A0"/><circle cx="40" cy="40" r="3" fill="#FFF4A8"/>'
  };
  const ROOM_THEMES = {
    pink: { wall: ['#FFF0F8', '#FFE6F3'], accent: '#FFB3DE', rug: '#FFE6F4' },
    lilac: { wall: ['#F6EEFF', '#EFE4FF'], accent: '#D9C2FF', rug: '#F0E6FF' },
    cyan: { wall: ['#EEF9FF', '#E2F4FF'], accent: '#A8E6FF', rug: '#E2F6FF' },
    lime: { wall: ['#F8FCE6', '#F1F8D6'], accent: '#E6F7A0', rug: '#F5FCD6' },
    peach: { wall: ['#FFF4EC', '#FFEADD'], accent: '#FFC9A8', rug: '#FFEDE0' },
    mint: { wall: ['#EEFBF4', '#E1F6EA'], accent: '#A6E3C2', rug: '#E4F7EC' },
    cream: { wall: ['#FFFBEC', '#FFF4D6'], accent: '#FFE08A', rug: '#FFF6DE' },
    night: { wall: ['#E9E6F5', '#DEDAF0'], accent: '#8F86C9', rug: '#E6E2F6' }
  };
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
  function closePaint() { $('paint-pop').hidden = true; $('room-paint').setAttribute('aria-expanded', 'false'); }
  $('room-paint').addEventListener('click', () => { const p = $('paint-pop'); p.hidden = !p.hidden; $('room-paint').setAttribute('aria-expanded', p.hidden ? 'false' : 'true'); });
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
    if (id === 'laundry') return [{ kind: 'rhythm', mode: 'mic', title: 'バサバサでリズム', hint: 'マイクで音の立ち上がりを拾う・8拍' }, { kind: 'rhythm', mode: 'tap', title: '洗濯リズム', hint: 'はたくリズムで8拍タップ（手動モード）' }];
    const t = TASKS[id], list = [];
    (t.presets || []).forEach((p) => list.push({ kind: 'pose', mode: 'preset', title: p.name + 'のポーズ', hint: p.hint, fig: p.fig, praise: p.praise }));
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
    const lead = id === 'laundry' ? '洗濯物をはたくリズムで8拍。マイクまたは手動タップで遊べるよ。'
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
  async function judge(id, c) {
    captureController?.abort(); captureController = new AbortController();
    const signal = captureController.signal;
    try {
      const evidence = await capture(sheetBody, id, c, state.originals[id], signal);
      if (signal.aborted) return;
      const gal = pickGal();
      const { blob, kind, ...fields } = evidence;
      const body = { ...fields, chore: toApi(id), gal, request_id: crypto.randomUUID() };
      sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">記録する？</h2><p class="sheet-text"></p><button class="btn btn-main" id="post">部屋に飾る</button><button class="btn btn-sub" id="redo">やり直す</button>';
      sheetBody.querySelector('p').textContent = fields.similarity !== undefined ? 'まねっこ度 ' + fields.similarity + '%' : 'できたことをお部屋に残そう。';
      if (blob) { const img = document.createElement('img'); const url = URL.createObjectURL(blob); img.src = url; img.style.cssText = 'width:100%;max-height:30vh;object-fit:contain'; sheetBody.querySelector('p').after(img); signal.addEventListener('abort', () => URL.revokeObjectURL(url), { once: true }); }
      $('redo').onclick = () => { captureController.abort(); openSheet(id); };
      $('post').onclick = async () => {
        const button = $('post'); button.disabled = true; $('redo').disabled = true; $('sheet-close').disabled = true;
        try {
          if (blob && !body.media_id) body.media_id = (await houseApi('/media?kind=' + kind, blob)).id;
          const result = await houseApi('/completions', body);
          await refresh();
          sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">記録できた！</h2><div class="verdict">' + galIcon(gal) + '<p class="bubble"><span class="gal-text"></span></p></div><button class="btn btn-main" id="finish">お部屋へ</button>';
          sheetBody.querySelector('.gal-text').textContent = result.post.praise.text;
          $('finish').onclick = () => { sheet.close(); showHouse(); toast('部屋に飾った。電気ついたね'); };
        } catch (e) { toast(e.message); button.disabled = false; if ($('redo')) $('redo').disabled = false; }
        finally { $('sheet-close').disabled = false; }
      };
    } catch (e) {
      if (e.name === 'AbortError') return;
      openSheet(id); toast(e.name === 'NotAllowedError' ? 'カメラ・マイクの利用を許可してください' : e.message);
    }
  }
  sheet.addEventListener('cancel', e => { if ($('sheet-close').disabled) e.preventDefault(); });
  sheet.addEventListener('close', () => captureController?.abort());
  $('sheet-close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet && !$('sheet-close').disabled) sheet.close(); });

  $('shoot').addEventListener('click', () => {
    const next = state.board.find((b) => !b.done);
    if (next) openSheet(next.id);
    else { showFridge(); boardSub.textContent = 'まずマグネットを1個貼ってね'; toast('冷蔵庫にマグネットを貼ると始められるよ'); }
  });
  $('next-day').textContent = '友だちを招待する';
  $('next-day').addEventListener('click', async () => {
    try { const url = await inviteLink(); $('menu').close(); sheetBody.innerHTML = '<h2 class="sheet-title" id="sheet-title">招待リンク貼っとくね（7日間有効）</h2><p class="sheet-text">一緒に住むマブに今すぐ送って！！💖6人までいける～✌</p><input aria-label="招待リンク" readonly style="width:100%;padding:16px">'; sheetBody.querySelector('input').value = url; sheetBody.querySelector('input').onclick = e => e.target.select(); sheet.showModal(); }
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
    document.querySelectorAll('[data-who-map]').forEach((el,i) => { const r = RESIDENTS[i]; el.hidden = !r; if (r) { el.dataset.whoMap = r.who; el.textContent = nameOf(r.who); } });
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
    renderAll();
  }
  const logoutButton = document.querySelector('#settings button[disabled]'); logoutButton.disabled = false; logoutButton.textContent = 'ログアウト'; logoutButton.onclick = () => logout().catch(e=>toast(e.message));
  start(receive, e => toast(e.message)).catch(e => { const notice = document.createElement('p'); notice.className = 'connection-status'; notice.textContent = e.message + '。Backend起動後に再読み込みしてください。'; document.body.append(notice); });

  document.body.classList.add('no-scroll');

  // ---------- walk between rooms ----------
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
  $('open-settings').addEventListener('click', () => { menu.close(); renderGalPicker(); settings.showModal(); });
  $('settings-close').addEventListener('click', () => settings.close());
  $('open-howto').addEventListener('click', () => { menu.close(); $('howto-page').showModal(); });
  $('howto-close').addEventListener('click', () => $('howto-page').close());
  menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });
  document.querySelectorAll('.map-cell').forEach((c) => c.addEventListener('click', () => { menu.close(); if (c.dataset.whoMap) { goScene(4, true); showRoom(c.dataset.whoMap); } else goScene(Number(c.dataset.go)); }));
  window.__goScene = () => requestAnimationFrame(() => { if (window.__toHall) { sceneIdx = 4; window.__toHall = false; } if (window.__toScene != null) { sceneIdx = window.__toScene; window.__toScene = null; } goScene(sceneIdx, true); });
  window.__goLdk = () => goScene(1);
  requestAnimationFrame(() => goScene(1, true));
})();
