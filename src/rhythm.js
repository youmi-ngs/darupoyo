// 洗濯リズムの判定と動き検出。DOMに依存しない純粋な処理だけを置く。
export const BEAT_MS = 800, TOTAL_BEATS = 8;
// 8拍のうち、これだけタイミングが合えば洗濯クリア。
export const PASS_HITS = 6;
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

// 人らしさ（0〜1）のマスクから、体の輪郭の点を最大 count 個えらぶ（0〜1の座標）。
// 輪郭＝人の画素で、上下左右のどれかが人ではない画素。人が少なすぎるときは空。
export function bodyEdge(person, width, height, count = 14, threshold = .5) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && person[y * width + x] >= threshold;
  const edge = []; let area = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!inside(x, y)) continue;
    area++;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) edge.push([x, y]);
  }
  if (area < width * height * .03 || !edge.length) return [];
  const step = Math.max(1, edge.length / count), points = [];
  for (let i = 0; i < edge.length && points.length < count; i += step) {
    const [x, y] = edge[Math.floor(i)]; points.push({ x: (x + .5) / width, y: (y + .5) / height });
  }
  return points;
}

// Outline the moving laundry with the same tiny frames used for hit detection.
// No synchronous segmentation/model inference is needed during the rhythm game.
export function motionEdge(prev, cur, width, height, threshold = 40) {
  const mask = new Float32Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    mask[i] = (Math.abs(cur[p] - prev[p]) + Math.abs(cur[p + 1] - prev[p + 1]) + Math.abs(cur[p + 2] - prev[p + 2])) / 3 > threshold ? 1 : 0;
  }
  return bodyEdge(mask, width, height).map(p => ({ x: 1 - p.x, y: p.y }));
}
