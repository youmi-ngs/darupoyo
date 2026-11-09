import { api, client, houseApi, inviteCode, switchHouse } from './api.js';
import { setBusy } from './busy.js';
import './utility-menu.css';
import { sfx } from './sfx.js';
import { setupInstallGuide } from './install-guide.js';

const $ = id => document.getElementById(id);
const asset = name => `/settings/${name}.svg`;
const steps = [
  { title: 'おうち、ぶらっとしよ〜', lines: ['左右にスワイプでお部屋を移動〜！', '今日できそうな家事、探してこ♡'], icon: '8f750', kind: 'walk' },
  { title: 'できたら、記録しよ♡', lines: ['ゆれてる物をタップでスタート！', 'ポーズ・写真・音で記録しよ。', '家事やったの、えらすぎ〜♡'], icon: 'fdc42', sparkle: '33c2d', kind: 'record' },
  { title: 'みんなの「できた」見よ！', lines: ['け〜じばんで友達の記録をチェック！', 'みんながんばってて、まじえらい♡'], icon: 'a2f56', sparkle: '7fd34', kind: 'share' },
  { title: 'うちら、意外とやってる♡', lines: ['お部屋で今までの記録を見返せるよ。', '小さな「できた！」も立派じゃん♡'], icon: 'lookback', sparkle: '7fd34', kind: 'lookback' },
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
  let exitCopy = null, menuExit = Promise.resolve();
  quick.addEventListener('beforetoggle', e => {
    exitCopy?.remove(); exitCopy = null;
    if (e.newState !== 'closed' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // A visual-only copy survives native light-dismiss, including Safari's immediate hide.
    const rect = quick.getBoundingClientRect(), copy = quick.cloneNode(true);
    copy.removeAttribute('id'); copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    copy.classList.add('menu-exit'); copy.removeAttribute('popover');
    copy.setAttribute('aria-hidden', 'true'); copy.inert = true;
    Object.assign(copy.style, {top:`${rect.top}px`,left:`${rect.left}px`,right:'auto',width:`${rect.width}px`});
    document.body.append(copy); exitCopy = copy;
    menuExit = (async () => {
      const animations = [...copy.children].map((item, i, items) => item.animate([
        {opacity:1,transform:'translateY(0) scale(1)'},
        {opacity:0,transform:'translateY(-12px) scale(.75)'}
      ], {duration:180,delay:(items.length - 1 - i)*35,easing:'ease-in',fill:'both'}));
      await Promise.all(animations.map(a => a.finished.catch(() => {})));
      copy.remove(); if (exitCopy === copy) exitCopy = null;
    })();
  });
  quick.addEventListener('click', async e => {
    const item = e.target.closest('[data-menu-action]');
    if (!item || !quick.matches(':popover-open')) return;
    e.preventDefault(); e.stopImmediatePropagation(); quick.hidePopover();
    await menuExit; item.click();
  }, true);
  $('menu-house').onclick = openHouses;
  $('profile-photo').onclick = () => document.querySelector('#social-card input[type=file]')?.click();
  for (const id of ['settings', 'howto-page', 'house-switcher']) {
    const page = $(id);
    let closing = false;
    const closePage = async () => {
      if (closing || !page.open) return;
      closing = true;
      let fade;
      try {
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          page.classList.add('is-closing');
          // Opacity only: a transform would move the fixed × button again.
          fade = page.animate([{opacity:getComputedStyle(page).opacity},{opacity:0}], {duration:220,easing:'ease-in',fill:'forwards'});
          await fade.finished.catch(() => {});
        }
        if (page.open) page.close();
      } finally { fade?.cancel(); page.classList.remove('is-closing'); closing = false; }
    };
    page.querySelector('.drawer-close').addEventListener('click', e => {
      e.preventDefault(); e.stopImmediatePropagation(); closePage();
    }, true);
    page.addEventListener('cancel', e => { e.preventDefault(); closePage(); });
    page.addEventListener('close', () => { if (!document.querySelector('dialog[open]')) trigger.focus(); });
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
  // Both the code and the pill copy the invitation code.
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
  $('copy-invite').onclick = copyInvite($('copy-invite'), '招待コード', code => code);
  $('settings-invite').onclick = copyInvite($('settings-invite'), '招待コード', code => code);

  const track = $('howto-track');
  const guideSteps = [...steps, {title:'ホーム画面に追加',kind:'install',lines:['ホーム画面に追加すると、','通知がとどくよ♡']}];
  guideSteps.forEach((step, i) => {
    const card = document.createElement('article'); card.className = 'howto-card'; card.setAttribute('aria-label', `${i + 1} / ${guideSteps.length}：${step.title}`);
    card.innerHTML = `<div class="howto-art ${step.kind}" aria-hidden="true">${step.icon ? `<img class="howto-illustration" src="${asset(step.icon)}" alt="">` : ''}${step.sparkle ? `<img class="howto-sparkle" src="${asset(step.sparkle)}" alt="">` : ''}</div><h3>${step.title}</h3><p>${step.lines.join('<br>')}</p><div class="howto-pagination" aria-label="ページ選択"></div>`;
    if (step.kind === 'install') {
      card.id = 'install-card';
      card.querySelector('.howto-art').innerHTML = '<svg class="howto-install-art" width="166" height="166" viewBox="0 0 166 166" fill="none"><rect x="44" y="8" width="78" height="148" rx="20" fill="#fff5fc" stroke="#6a5590" stroke-width="4"/><path d="M70 20h26M73 144h20" stroke="#6a5590" stroke-width="4" stroke-linecap="round"/><rect x="60" y="56" width="46" height="46" rx="13" fill="#ffb8dc"/><path d="M83 67v24M71 79h24" stroke="#6a5590" stroke-width="4" stroke-linecap="round"/><path d="m130 32 5-12 5 12 12 5-12 5-5 12-5-12-12-5Z" fill="#c9b6ff"/></svg>';
      const button = document.createElement('button'); button.id = 'install-app'; button.type = 'button'; button.className = 'refined-button secondary'; button.textContent = '追加方法を見る'; card.append(button);
    }
    guideSteps.forEach((_, j) => {
      const dot = document.createElement('button'); dot.type = 'button'; dot.setAttribute('aria-label', `${j + 1}ページ目へ`); dot.innerHTML = `<img src="${asset(j === i ? 'c25c8' : 'b0fb5')}" alt="">`;
      if (i === j) dot.setAttribute('aria-current', 'step');
      dot.dataset.page = j; dot.onclick = () => move(j); card.querySelector('.howto-pagination').append(dot);
    });
    card.onclick = e => { if (!card.classList.contains('is-active') && !e.target.closest('button')) move(i); };
    track.append(card);
  });
  let active = 0;
  const cards = [...track.children];
  const visibleCards = () => cards.filter(card => !card.hidden);
  const move = i => { const shown = visibleCards(); const next = shown[Math.max(0, Math.min(shown.length - 1, i))]; track.scrollTo({ left: next.offsetLeft - (track.clientWidth - next.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  const mark = () => {
    const center = track.scrollLeft + track.clientWidth / 2;
    const shown = visibleCards();
    active = shown.reduce((best, card, i) => Math.abs(card.offsetLeft + card.offsetWidth / 2 - center) < Math.abs(shown[best].offsetLeft + shown[best].offsetWidth / 2 - center) ? i : best, 0);
    cards.forEach((card, i) => { card.classList.toggle('is-active', i === active); card.querySelectorAll('button').forEach(b => { b.tabIndex = i === active ? 0 : -1; }); });
    $('howto-status').textContent = `${active + 1} / ${shown.length}：${guideSteps[active].title}`;
  };
  track.addEventListener('scroll', mark, { passive: true });
  track.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); move(active + (e.key === 'ArrowRight' ? 1 : -1)); } });
  new MutationObserver(() => { if ($('howto-page').open) { track.scrollLeft = 0; mark(); } }).observe($('howto-page'), { attributes: true, attributeFilter: ['open'] });
  new ResizeObserver(() => { if ($('howto-page').open) move(active); }).observe(track);
  const updatePages = () => {
    const count = visibleCards().length;
    track.setAttribute('aria-label', `遊び方・左右にスワイプして全${count}ページ`);
    cards.forEach((card,i) => {
      card.setAttribute('aria-label', `${i+1} / ${count}：${guideSteps[i].title}`);
      card.querySelectorAll('[data-page]').forEach(dot => { dot.hidden = Number(dot.dataset.page) >= count; });
    });
    active = Math.min(active, count - 1);
    if ($('howto-page').open) move(active);
    mark();
  };
  new MutationObserver(updatePages).observe($('install-card'), {attributes:true,attributeFilter:['hidden']});
  setupInstallGuide(); updatePages();

  setupHouseRemoval();
  $('house-switch-close').onclick = () => $('house-switcher').close();
  $('house-add').onclick = () => switchHouse();
  let houseRequest = 0;
  async function openHouses() {
    const request = ++houseRequest, owner = client.uid;
    const dialog = $('house-switcher'), list = $('house-list'), status = $('house-switch-status');
    let shown = '';
    const render = houses => {
      const signature = JSON.stringify(houses.map(h => [h.id, h.name, h.id === client.house]));
      if (signature === shown) return;
      shown = signature; list.replaceChildren();
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
    };
    // Startup already fetched memberships; show them before opening the page.
    render(client.houses);
    if (!client.houses.length) {
      const placeholder = document.createElement('div'); placeholder.className = 'house-choice house-loading';
      placeholder.textContent = 'おうちを読み込み中…'; list.append(placeholder); status.textContent = '';
    }
    if (!dialog.open) dialog.showModal(); $('house-switch-title').focus();
    try {
      const result = await api('/houses');
      if (request !== houseRequest || owner !== client.uid) return;
      client.houses = result.items || result;
      // Replace placeholders even when the server confirms an empty list.
      if (list.querySelector('.house-loading')) shown = '';
      render(client.houses);
    } catch (e) {
      if (request !== houseRequest || owner !== client.uid) return;
      list.querySelector('.house-loading')?.remove();
      status.textContent = client.houses.length ? '一覧を更新できなかったよ。もう一度試してね。' : e.message;
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'pink-pill'; retry.textContent = 'もう一度読み込む'; retry.onclick = openHouses; list.append(retry);
    }
  }

}

// Moving out (any resident) and deleting the house (only its last resident).
let shownHouse = null;
function setupHouseRemoval() {
  const dialog = document.createElement('dialog'); dialog.className = 'house-remove-dialog refined-modal confirmation-dialog';
  dialog.innerHTML = '<h2></h2><p data-what></p><p>この操作は元に戻せません。</p><label><input type="checkbox">削除する内容を確認しました</label><p role="status"></p><button type="button" class="refined-button secondary" data-cancel>やめる</button><button type="button" class="refined-button" data-confirm disabled></button>';
  document.body.append(dialog);
  const title = dialog.querySelector('h2'), what = dialog.querySelector('[data-what]'), check = dialog.querySelector('input');
  const status = dialog.querySelector('[role=status]'), cancel = dialog.querySelector('[data-cancel]'), confirm = dialog.querySelector('[data-confirm]');
  let busy = false, action = null;
  check.onchange = () => { confirm.disabled = !check.checked; };
  cancel.onclick = () => dialog.close();
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  const open = leaving => {
    const name = shownHouse?.name || 'このハウス';
    dialog.setAttribute('aria-label', leaving ? 'ハウスから退去の確認' : 'ハウス削除の確認');
    title.textContent = leaving ? `「${name}」から退去しますか？` : `「${name}」を削除しますか？`;
    what.textContent = leaving
      ? 'このハウスでのあなたの写真・音声・記録・自撮り・だるぽよと、ほかの住人の記録に付けたコメント・リアクションを削除します。ほかの住人の記録は残ります。'
      : 'このハウスと、中の写真・音声・記録をすべて削除します。';
    confirm.textContent = leaving ? '退去する' : 'ハウスを削除';
    action = leaving ? () => houseApi('/leave', {}) : () => houseApi('', undefined, 'DELETE');
    check.checked = false; confirm.disabled = true; status.textContent = '';
    $('settings').close(); dialog.showModal();
  };
  $('leave-house').onclick = () => open(true);
  $('delete-house').onclick = () => open(false);
  confirm.onclick = async () => {
    busy = true; check.disabled = cancel.disabled = true; setBusy(confirm, true, '削除しています…');
    try { await action(); switchHouse(); } // back to the start: pick another house or make a new one
    catch (e) { status.textContent = '削除できませんでした。もう一度試してね。' + e.message; setBusy(confirm, false); check.disabled = cancel.disabled = false; confirm.disabled = !check.checked; busy = false; }
  };
}

export function updateSettingsHouse(house, nameOf, me) {
  shownHouse = house;
  const alone = house.member_ids.length === 1 && house.member_ids[0] === me;
  $('leave-house').hidden = alone; // the last resident deletes instead
  $('delete-house').disabled = !alone; $('delete-house-note').hidden = alone;
  const avatar = $('profile-avatar'), member = house.members[me];
  avatar.src = member?.avatar || asset('2dc1e');
  avatar.classList.toggle('has-avatar', !!member?.avatar);
  $('settings-house-name').textContent = house.name;
  $('settings-members').replaceChildren(...house.member_ids.map(uid => Object.assign(document.createElement('span'), { textContent: nameOf(uid) })));
  if ($('settings-invite').dataset.house !== house.id) { $('settings-invite').dataset.house = house.id; $('settings-invite').textContent = '友だちを招待しよう'; $('settings-invite').removeAttribute('aria-label'); $('invite-status').hidden = true; }
}
