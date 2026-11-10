// Only the left edge belongs to back navigation; album/photo gestures stay local.
export function setupRoomSwipe(room, back) {
  let gesture = null, restoring = null;
  const reset = () => { gesture = null; restoring?.cancel(); restoring = null; room.style.translate = ''; };
  room.addEventListener('touchstart', event => {
    if (room.hidden || room.inert || event.touches.length !== 1 || document.querySelector('dialog[open]')) return;
    const t = event.touches[0], bounds = room.getBoundingClientRect();
    if (t.clientX < bounds.left || t.clientX - bounds.left > 28 || event.target.closest('button,input,textarea,a,[role=button]')) return;
    reset(); gesture = {x:t.clientX,y:t.clientY,dx:0,axis:null};
    // Reserve an edge touch so Safari doesn't navigate out of the app's page.
    if (event.cancelable) event.preventDefault();
  }, {passive:false});
  const cancel = () => {
    if (!gesture) return;
    const dx = gesture.dx; gesture = null;
    if (!dx || matchMedia('(prefers-reduced-motion: reduce)').matches) { reset(); return; }
    const animation = room.animate([{translate:dx+'px 0'},{translate:'0px 0'}],{duration:180,easing:'ease-out'});
    room.style.translate = ''; restoring = animation;
    animation.finished.catch(()=>{}).finally(()=>{if(restoring===animation) restoring=null;});
  };
  room.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1) { cancel(); return; }
    const t = event.touches[0], dx=t.clientX-gesture.x, dy=t.clientY-gesture.y;
    if (!gesture.axis && Math.hypot(dx,dy)>8) gesture.axis=dx>0 && dx>Math.abs(dy)*1.3 ? 'x' : 'y';
    if (gesture.axis !== 'x') return;
    if(event.cancelable) event.preventDefault();
    gesture.dx = Math.max(0,Math.min(dx,room.clientWidth));
    room.style.translate=gesture.dx+'px 0';
  },{passive:false});
  room.addEventListener('touchend', () => {
    if (!gesture) return;
    if (gesture.axis==='x' && gesture.dx>=Math.min(100,room.clientWidth*.25)) { gesture=null; back(); }
    else cancel();
  });
  room.addEventListener('touchcancel',cancel);
  window.addEventListener('darupoyo:notification-opening',reset);
}
