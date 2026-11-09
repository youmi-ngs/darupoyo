import { client } from './api.js';

export function setupFirstGuide(goToLiving) {
  let panel, target;
  const close = () => { panel?.remove(); panel = null; target?.classList.remove('guide-target'); target?.removeEventListener('click', close); };
  const open = () => {
    close(); document.querySelector('#howto-page')?.close();
    goToLiving(); target = document.querySelector('[data-chore="meal"]');
    target.classList.add('guide-target'); target.addEventListener('click', close, {once:true});
    panel = document.createElement('section'); panel.className = 'first-guide'; panel.setAttribute('aria-label', 'はじめての操作案内');
    panel.innerHTML = '<p><b>ゆれてるところをタップ！</b><br>ごはんやドライヤーから記録できるよ。<br>今日はだるぽよ、でもおけ♡</p><button type="button" data-try>ごはんをタップしてみる</button><button type="button" data-skip>スキップ</button>';
    panel.querySelector('[data-try]').onclick = () => target.click(); panel.querySelector('[data-skip]').onclick = close;
    document.body.append(panel);
  };
  const again = document.createElement('button'); again.type = 'button'; again.className = 'refined-button secondary'; again.textContent = '操作案内をもう一度見る'; again.onclick = open;
  document.querySelector('#howto-track').before(again);
  window.addEventListener('darupoyo:entered', () => {
    const key = 'darupoyo-first-guide-' + client.uid;
    try {
      if (localStorage.getItem(key) || localStorage.getItem('darupoyo-howto-seen')) return;
      localStorage.setItem(key, '1');
    } catch { /* still let a new visitor discover the controls */ }
    open();
  });
  document.querySelector('#open-menu').addEventListener('click', close);
}
