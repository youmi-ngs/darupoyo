// MediaPipe Pose Landmarker, preset pose scoring and copycat similarity, all on the device.
// Landmarks use image coordinates (x right, y down). Indices follow MediaPipe Pose:
// 0 nose, 11/12 shoulders, 13/14 elbows, 15/16 wrists, 23/24 hips, 25/26 knees, 27/28 ankles.
const L = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
const clamp01 = v => Math.max(0, Math.min(1, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
// Angle at b between b→a and b→c, in degrees.
const jointAngle = (a, b, c) => {
  const u = Math.atan2(a.y - b.y, a.x - b.x), v = Math.atan2(c.y - b.y, c.x - b.x);
  const d = Math.abs(u - v) * 180 / Math.PI; return d > 180 ? 360 - d : d;
};
// Linear score: 1 at `good`, 0 at `bad` (either direction).
const ramp = (value, good, bad) => clamp01((value - bad) / (good - bad));

// #173: only the upper body has to be in the picture. Hips, knees and ankles count when seen.
const seen = (p, ...ids) => ids.every(i => (p[i].visibility ?? 1) >= .5);
function body(p) {
  const shoulders = mid(p[L.ls], p[L.rs]), width = dist(p[L.ls], p[L.rs]) || .1;
  const hips = seen(p, L.lh, L.rh) ? mid(p[L.lh], p[L.rh]) : null;
  const torso = hips ? dist(shoulders, hips) || .1 : width * 1.3;
  // 0° means the torso is upright; unknown without the hips.
  const tilt = hips ? Math.abs(Math.atan2(shoulders.x - hips.x, hips.y - shoulders.y)) * 180 / Math.PI : null;
  const knees = [[L.lh, L.lk, L.la], [L.rh, L.rk, L.ra]].filter(ids => seen(p, ...ids)).map(([h, k, a]) => jointAngle(p[h], p[k], p[a]));
  const knee = knees.length ? Math.min(...knees) : null;
  // A hunch: the head sinks toward the shoulders (about .7 shoulder widths when standing tall).
  const neck = (shoulders.y - p[L.nose].y) / width;
  return { torso, tilt, knee, neck };
}

// A hand resting on either shoulder, as if carrying a garbage bag over it. Lenient (#173).
function carry(p, torso) {
  return Math.max(...[p[L.lw], p[L.rw]].map(w => {
    const near = Math.min(dist(w, p[L.ls]), dist(w, p[L.rs])) / torso;
    const high = (Math.min(p[L.ls].y, p[L.rs].y) - w.y) / torso; // >0 when above the shoulders
    return ramp(near, .4, 1.1) * ramp(high, -.2, -.8);
  }));
}

// Each sign that is visible counts; a sign that is out of the picture is not held against you.
const signs = list => { const known = list.filter(v => v !== null); return known.length ? known : [.5]; };
const upright = b => Math.min(...signs([b.tilt === null ? null : ramp(b.tilt, 12, 35), b.knee === null ? null : ramp(b.knee, 160, 125), ramp(b.neck, .55, .3)]));
// Without hips or knees in the picture a lean can't be seen, so it gets half credit.
const sneak = b => Math.max(b.tilt === null && b.knee === null ? .5 : 0, ...signs([b.tilt === null ? null : ramp(b.tilt, 22, 6), b.knee === null ? null : ramp(b.knee, 140, 165), ramp(b.neck, .35, .6)]));

export const PRESET_PASS = 60;
// Each preset returns 0–100: how close the body is to the pose described in data.js.
export const PRESET_POSES = {
  santa: p => { const b = body(p); return Math.round(100 * carry(p, b.torso) * (.6 + .4 * upright(b))); },
  thief: p => { const b = body(p); return Math.round(100 * carry(p, b.torso) * (.5 + .5 * sneak(b))); },
  // Laundry wizard: one straight arm raised above the head like a wand. Not used until laundry poses are allowed.
  wizard: p => {
    const b = body(p);
    return Math.round(100 * Math.max(...[[L.ls, L.le, L.lw], [L.rs, L.re, L.rw]].map(([s, e, w]) =>
      ramp((p[L.nose].y - p[w].y) / b.torso, .3, -.2) * ramp(jointAngle(p[s], p[e], p[w]), 150, 100))));
  },
};
export const presetScore = (id, landmarks) => PRESET_POSES[id] ? PRESET_POSES[id](landmarks) : null;

// Limb segments compared by direction, so position and body size do not matter.
const SEGMENTS = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [11, 23], [12, 24]];
const MIRROR = Object.fromEntries([[11, 12], [13, 14], [15, 16], [23, 24], [25, 26], [27, 28]].flatMap(([a, b]) => [[a, b], [b, a]]));
const mirror = p => p.map((_, i) => { const q = p[MIRROR[i] ?? i]; return { ...q, x: -q.x }; });
function directionScore(a, b) {
  let sum = 0, weight = 0;
  for (const [i, j] of SEGMENTS) {
    const w = Math.min(a[i].visibility ?? 1, a[j].visibility ?? 1, b[i].visibility ?? 1, b[j].visibility ?? 1);
    const u = Math.atan2(a[j].y - a[i].y, a[j].x - a[i].x), v = Math.atan2(b[j].y - b[i].y, b[j].x - b[i].x);
    let d = Math.abs(u - v); if (d > Math.PI) d = 2 * Math.PI - d;
    sum += w * clamp01(1 - d / (Math.PI / 2)); weight += w; // 90° off scores 0
  }
  return weight ? sum / weight : 0;
}
// Copycat percentage against today's original pose. A mirrored copy counts as the same pose.
export function poseSimilarity(a, b) {
  return Math.round(100 * Math.max(directionScore(a, b), directionScore(mirror(a), b)));
}

export async function createPoseLandmarker(options = {}) {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  return PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/models/vision'), { baseOptions: { modelAssetPath: '/models/pose.task' }, runningMode: 'IMAGE', ...options });
}

// #173: a face and both shoulders are enough to count as a person.
export const hasUpperBody = landmarks => !!landmarks && ![0, 11, 12].some(i => landmarks[i].visibility < .5);
