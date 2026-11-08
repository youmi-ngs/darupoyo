// Focus rings are for people moving around with the keyboard (Tab). A tap or click never
// draws one, even where a browser would (iPhone Safari rings a button focused when a dialog opens).
const root = document.documentElement;
addEventListener('keydown', e => { if (e.key === 'Tab') root.classList.add('keyboard-nav'); }, true);
addEventListener('pointerdown', () => root.classList.remove('keyboard-nav'), true);
