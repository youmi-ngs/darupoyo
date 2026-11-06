// 洗濯リズムの判定と動き検出。DOMに依存しない純粋な処理だけを置く。
export const BEAT_MS = 800, TOTAL_BEATS = 8;
export const GOOD_MS = 150, OK_MS = 320;

// k番目の音符は開始から (k+1) * BEAT_MS に判定の円へ届く。
export const noteTime = k => (k + 1) * BEAT_MS;

export function judgeHit(elapsed, taken) {
  const k = Math.round(elapsed / BEAT_MS) - 1;
  if (k < 0 || k >= TOTAL_BEATS || taken.has(k)) return null;
  const diff = Math.abs(elapsed - noteTime(k));
  if (diff > OK_MS) return null;
  return { beat: k, grade: diff <= GOOD_MS ? 'good' : 'ok' };
}

// RGBAの2フレームを比べ、大きく変化した画素の割合と重心（0〜1）を返す。
export function detectMotion(prev, cur, width, height, threshold = 40) {
  let changed = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const diff = (Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]) + Math.abs(cur[i + 2] - prev[i + 2])) / 3;
    if (diff > threshold) { changed++; sumX += x; sumY += y; }
  }
  return { ratio: changed / (width * height), x: changed ? (sumX / changed + .5) / width : .5, y: changed ? (sumY / changed + .5) / height : .5 };
}

// 動きの立ち上がりだけを「叩いた」とみなす。動き続けているだけでは反応しない。
export function isSlap(ratio, previousRatio, minRatio = .08) {
  return ratio >= minRatio && ratio > previousRatio * 1.5;
}
