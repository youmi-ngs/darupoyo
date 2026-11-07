import './utility-menu.css';

export function setupUtilityMenu() {
  const opener = document.querySelector('#open-menu'), menu = document.querySelector('#utility-menu');
  opener.addEventListener('click', () => { menu.showModal(); opener.setAttribute('aria-expanded', 'true'); });
  menu.addEventListener('close', () => opener.setAttribute('aria-expanded', 'false'));
  // Close before the existing action handler opens the next dialog.
  menu.addEventListener('click', event => {
    if (event.target.closest('[data-menu-action]')) menu.close();
    if (event.target === menu) {
      const r = menu.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) menu.close();
    }
  }, true);
}
