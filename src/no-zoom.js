// #170: quick taps (on the cat, say) and pinches must not zoom the app like a web page.
// iOS Safari ignores user-scalable=no, so pinches are stopped here and double taps by
// touch-action in style.css.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, event => event.preventDefault(), { passive: false });
document.addEventListener('touchmove', event => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });
