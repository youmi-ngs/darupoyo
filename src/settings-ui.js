import { api, client, inviteCode, switchHouse } from './api.js';
import './utility-menu.css';
import { sfx } from './sfx.js';

const $ = id => document.getElementById(id);
const asset = name => `/settings/${name}.svg`;
const steps = [
  { title: 'おうち、ぶらっとしよ〜', lines: ['左右にスワイプでお部屋を移動〜！', '今日できそうな家事、探してこ♡'], icon: '8f750', kind: 'walk' },
  { title: 'できたら、記録しよ♡', lines: ['ゆれてる物をタップでスタート！', 'ポーズ・写真・音で記録しよ。', '家事やったの、えらすぎ〜♡'], icon: 'fdc42', sparkle: '33c2d', kind: 'record' },
  { title: 'みんなの「できた」見よ！', lines: ['け〜じばんで友達の記録をチェック！', 'みんながんばってて、まじえらい♡'], icon: 'a2f56', sparkle: '7fd34', kind: 'share' },
  { title: 'うちら、意外とやってる♡', lines: ['お部屋で今までの記録を見返せるよ。', '小さな「できた！」も立派じゃん♡'], icon: '34158', sparkle: '7fd34', kind: 'lookback' },
];

export function setupSettingsUI() {
  const trigger = $('open-menu'), quick = $('utility-menu');
  const placeMenu = () => {
    const r = trigger.getBoundingClientRect();
    quick.style.top = `${r.bottom + 10}px`;
    quick.style.right = `${Math.max(10, innerWidth - r.right)}px`;
  };
  trigger.addEventListener('click', placeMenu);
  quick.addEventListener('toggle', e => { trigger.setAttribute('aria-expanded', String(e.newState === 'open')); if (e.newState === 'open') sfx.pop(); });
  window.addEventListener('resize', placeMenu);
  quick.addEventListener('click', e => { if (e.target.closest('[data-menu-action]') && quick.matches(':popover-open')) quick.hidePopover(); }, true);
  $('menu-house').onclick = openHouses;
  $('house-edit').onclick = () => { if ($('account-form').hidden) $('account-edit').click(); $('account-form').elements.house_name.focus(); };
  $('profile-photo').onclick = () => document.querySelector('#social-card input[type=file]')?.click();
  for (const id of ['settings', 'howto-page', 'house-switcher']) {
    $(id).addEventListener('close', () => { if (!document.querySelector('dialog[open]')) trigger.focus(); });
  }

  // Figma mypage: the invite code sits in the house card, next to the copy button.
  let invite = { house: null, code: null };
  const loadInvite = async () => {
    if (invite.house === client.house && invite.code) return invite.code;
    const house = client.house, code = await inviteCode();
    if (house === client.house) { invite = { house, code }; $('settings-invite').textContent = code; $('settings-invite').setAttribute('aria-label', `招待コード ${code} をコピー`); }
    return code;
  };
  new MutationObserver(() => { if ($('settings').open) loadInvite().catch(() => {}); }).observe($('settings'), { attributes: true, attributeFilter: ['open'] });
  // Both the code and the pill copy: the code alone, or a link that fills it in.
  const copyInvite = (button, what, value) => async () => {
    const status = $('invite-status');
    button.disabled = true; status.hidden = false; status.textContent = what + 'を準備中…';
    try {
      const text = value(await loadInvite());
      try { await navigator.clipboard.writeText(text); status.textContent = what + 'をコピーしたよ！ 招待は7日間有効だよ。'; }
      catch { status.textContent = 'この' + what + 'をコピーして送ってね（7日間有効）'; const input = document.createElement('input'); input.readOnly = true; input.value = text; input.setAttribute('aria-label', what); status.append(input); input.select(); }
    } catch (e) { status.textContent = e.message; }
    finally { button.disabled = false; }
  };
  $('copy-invite').onclick = copyInvite($('copy-invite'), '招待リンク', code => { const url = new URL(location.pathname, location.origin); url.hash = new URLSearchParams({ invite: code }).toString(); return url.href; });
  $('settings-invite').onclick = copyInvite($('settings-invite'), '招待コード', code => code);

  const track = $('howto-track');
  steps.forEach((step, i) => {
    const card = document.createElement('article'); card.className = 'howto-card'; card.setAttribute('aria-label', `${i + 1} / 4：${step.title}`);
    card.innerHTML = `<div class="howto-art ${step.kind}" aria-hidden="true"><img class="howto-illustration" src="${asset(step.icon)}" alt="">${step.sparkle ? `<img class="howto-sparkle" src="${asset(step.sparkle)}" alt="">` : ''}</div><h3>${step.title}</h3><p>${step.lines.join('<br>')}</p><div class="howto-pagination" aria-label="ページ選択"></div>`;
    steps.forEach((_, j) => {
      const dot = document.createElement('button'); dot.type = 'button'; dot.setAttribute('aria-label', `${j + 1}ページ目へ`); dot.innerHTML = `<img src="${asset(j === i ? 'c25c8' : 'b0fb5')}" alt="">`;
      if (i === j) dot.setAttribute('aria-current', 'step');
      dot.onclick = () => move(j); card.querySelector('.howto-pagination').append(dot);
    });
    card.onclick = e => { if (!card.classList.contains('is-active') && !e.target.closest('button')) move(i); };
    track.append(card);
  });
  let active = 0;
  const cards = [...track.children];
  const move = i => { const next = cards[Math.max(0, Math.min(3, i))]; track.scrollTo({ left: next.offsetLeft - (track.clientWidth - next.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  const mark = () => {
    const center = track.scrollLeft + track.clientWidth / 2;
    active = cards.reduce((best, card, i) => Math.abs(card.offsetLeft + card.offsetWidth / 2 - center) < Math.abs(cards[best].offsetLeft + cards[best].offsetWidth / 2 - center) ? i : best, 0);
    cards.forEach((card, i) => { card.classList.toggle('is-active', i === active); card.querySelectorAll('button').forEach(b => { b.tabIndex = i === active ? 0 : -1; }); });
    $('howto-status').textContent = `${active + 1} / 4：${steps[active].title}`;
  };
  track.addEventListener('scroll', mark, { passive: true });
  track.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); move(active + (e.key === 'ArrowRight' ? 1 : -1)); } });
  new MutationObserver(() => { if ($('howto-page').open) { track.scrollLeft = 0; mark(); } }).observe($('howto-page'), { attributes: true, attributeFilter: ['open'] });
  new ResizeObserver(() => { if ($('howto-page').open) move(active); }).observe(track);
  cards[0].classList.add('is-active');

  $('house-switch-close').onclick = () => $('house-switcher').close();
  $('house-add').onclick = () => switchHouse();
  async function openHouses() {
    const dialog = $('house-switcher'), list = $('house-list'), status = $('house-switch-status');
    list.replaceChildren(); status.textContent = 'おうちを探してるよ…'; dialog.showModal(); $('house-switch-title').focus();
    try {
      const result = await api('/houses'); const houses = result.items || result;
      houses.forEach(house => {
        const current = house.id === client.house;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'house-choice';
        const icon = document.querySelector('#menu-house svg').cloneNode(true);
        const name = document.createElement('b'); name.textContent = house.name;
        const label = document.createElement('span'); label.textContent = current ? 'いまのおうち' : 'このおうちへ →';
        button.append(icon, name, label); button.disabled = current;
        if (current) button.setAttribute('aria-current', 'true');
        button.onclick = () => switchHouse(house.id);
        list.append(button);
      });
      status.textContent = houses.length < 2 ? '招待コードで、友だちのおうちにも参加できるよ。' : 'おうちを選んで、ただいま！';
    } catch (e) {
      status.textContent = e.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'pink-pill'; retry.textContent = 'もう一度読み込む'; retry.onclick = () => { dialog.close(); openHouses(); }; list.append(retry);
    }
  }
}

export function updateSettingsHouse(house, nameOf, me) {
  const avatar = $('profile-avatar'), member = house.members[me];
  avatar.src = member?.avatar || asset('2dc1e');
  avatar.classList.toggle('has-avatar', !!member?.avatar);
  $('settings-house-name').textContent = house.name;
  $('settings-members').replaceChildren(...house.member_ids.map(uid => Object.assign(document.createElement('span'), { textContent: nameOf(uid) })));
  if ($('settings-invite').dataset.house !== house.id) { $('settings-invite').dataset.house = house.id; $('settings-invite').textContent = '友だちを招待しよう'; $('settings-invite').removeAttribute('aria-label'); $('invite-status').hidden = true; }
}
