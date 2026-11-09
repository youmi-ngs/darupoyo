// #179: a swipe in the けーじばん viewer moves either sideways (to the next card) or up and
// down (scrolling the card), never both at once. The browser keeps the up-and-down scroll;
// a sideways swipe is followed here and lands on the nearest card.
export function lockSwipeAxis(track) {
  if (track.dataset.swipeAxis) return;
  track.dataset.swipeAxis = 'locked';
  track.style.touchAction = 'pan-y';
  let x0 = null, y0 = 0, left0 = 0, axis = null;
  track.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) { x0 = null; return; }
    const touch = event.touches[0]; x0 = touch.clientX; y0 = touch.clientY; left0 = track.scrollLeft; axis = null;
  }, { passive: true });
  track.addEventListener('touchmove', event => {
    if (x0 === null || event.touches.length !== 1) return;
    const touch = event.touches[0], dx = touch.clientX - x0, dy = touch.clientY - y0;
    if (!axis) {
      if (Math.hypot(dx, dy) < 6) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'x') { track.style.scrollSnapType = 'none'; track.style.scrollBehavior = 'auto'; }
    }
    if (axis !== 'x') return;
    if (event.cancelable) event.preventDefault();
    track.scrollLeft = left0 - dx;
  }, { passive: false });
  const end = event => {
    if (axis === 'x') {
      const dx = (event.changedTouches[0]?.clientX ?? x0) - x0, width = Math.max(1, track.clientWidth);
      let page = Math.round(left0 / width);
      if (Math.abs(dx) > width * .18) page += dx < 0 ? 1 : -1;
      page = Math.max(0, Math.min(track.children.length - 1, page));
      track.style.scrollSnapType = ''; track.style.scrollBehavior = '';
      track.scrollTo({ left: page * width, behavior: 'smooth' });
    }
    x0 = null; axis = null;
  };
  track.addEventListener('touchend', end);
  track.addEventListener('touchcancel', end);
}
