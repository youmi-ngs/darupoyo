// 洗濯物を叩いたときのキラキラ（効果音はアセットを使わずWeb Audioで鳴らす）
export function playSparkle(context) {
  if (!context || context.state === 'closed') return;
  const at = context.currentTime;
  [1046.5, 1318.5, 1568, 2093].forEach((frequency, i) => {
    const osc = context.createOscillator(), gain = context.createGain(), begin = at + i * .05;
    osc.type = 'sine'; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(.0001, begin); gain.gain.exponentialRampToValueAtTime(.09, begin + .01); gain.gain.exponentialRampToValueAtTime(.0001, begin + .2);
    osc.connect(gain).connect(context.destination); osc.start(begin); osc.stop(begin + .22);
  });
}
const SPARK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="#FFF4A8" stroke="#FFFFFF" stroke-width="1"/></svg>';
export function sparkle(parent, x, y) {
  if (!parent) return;
  for (let i = 0; i < 8; i++) {
    const spark = document.createElement('span'); spark.className = 'fx-spark'; spark.innerHTML = SPARK_SVG;
    const angle = i / 8 * Math.PI * 2, far = 40 + (i % 3) * 22;
    spark.style.cssText = 'left:' + x * 100 + '%;top:' + y * 100 + '%;--dx:' + Math.cos(angle) * far + 'px;--dy:' + Math.sin(angle) * far + 'px';
    spark.addEventListener('animationend', () => spark.remove(), { once: true });
    parent.append(spark);
  }
}
