import { client } from './api.js';

export function setupFirstGuide(goToLiving) {
  let panel, target, next, choices;
  const sheet = document.querySelector('#sheet');
  const close = () => {
    document.body.classList.remove("first-guide-active");
    panel?.remove(); panel = null; next?.remove(); next = null;
    target?.classList.remove('guide-target'); target?.removeEventListener('click', showChoices);
    choices?.removeEventListener('click', close); choices = null;
  };
  function showChoices() {
    close();
    // The furniture opens the ordinary chore sheet first. Explain its choices
    // there, without adding another screen or starting a camera/recording.
    choices = sheet.querySelector('.refined-actions');
    if (!sheet.open || !choices) return;
    next = document.createElement('section'); next.className = 'first-guide-next';
    next.setAttribute('aria-label', '操作案内 2 / 2');
    next.innerHTML = '<small>2 / 2　きょうの気分で選んでね</small><p>やる日は<span>「たべる」</span>、休む日は<span>「だるぽよ」</span>。<br>共有した記録は、けーじばんで見られるよ♡</p><button type="button">わかった！ 案内おわり</button>';
    next.querySelector('button').onclick = () => {
      const firstChoice = choices?.querySelector('button'); close(); firstChoice?.focus();
    };
    choices.before(next); choices.addEventListener('click', close);
  }
  const open = () => {
    close(); document.querySelector('#howto-page')?.close();
    goToLiving(); target = document.querySelector('[data-chore="meal"]');
    document.body.classList.add('first-guide-active');
    target.classList.add('guide-target'); target.addEventListener('click', showChoices, {once:true});
    panel = document.createElement('section'); panel.className = 'first-guide'; panel.setAttribute('aria-label', 'はじめての操作案内');
    panel.innerHTML = '<small class="first-guide-progress">1 / 2</small><p><b>ゆれてるところをタップ！</b><br>ごはんやドライヤー、記録しよ♡<br>今日はだるぽよ、でもおけ♡</p><div class="first-guide-actions"><button type="button" data-try>ごはんをタップしてみる</button><button type="button" data-skip>スキップ</button></div>';
    panel.querySelector('[data-try]').onclick = () => target.click(); panel.querySelector('[data-skip]').onclick = close;
    document.body.append(panel);
  };
  document.addEventListener('click', event => {
    if (!panel || event.target.closest('.push-banner') || panel.contains(event.target) || target?.contains(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown', event => {
    if (panel && event.key === 'Escape') { event.preventDefault(); close(); }
  });
  document.addEventListener('focusin', event => {
    if (panel && !panel.contains(event.target) && !target?.contains(event.target) && !event.target.closest('.push-banner')) target?.focus();
  });
  const again = document.createElement('button'); again.type = 'button'; again.className = 'refined-button secondary'; again.textContent = '操作案内をもう一度見る'; again.onclick = open;
  document.querySelector('#howto-track').before(again);
  const first = () => {
    if (!client.firstEntry) return;
    const key = 'darupoyo-first-guide-' + client.uid;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch { /* still let a new visitor discover the controls */ }
    open();
  };
  window.addEventListener('darupoyo:entered', event => { if (!event.detail?.joining) first(); });
  window.addEventListener('darupoyo:guide-ready', first);
  window.addEventListener('darupoyo:notification-opening', close);
  sheet.addEventListener('close', close);
  document.querySelector('#open-menu').addEventListener('click', close);
}
