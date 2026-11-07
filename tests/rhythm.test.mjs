import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_MS, TOTAL_BEATS, noteTime, judgeHit, detectMotion, isSlap } from '../src/rhythm.js';
test('rhythm judge grades by distance from the note and rejects misses and repeats',()=>{
  assert.deepEqual(judgeHit(noteTime(0)+50,new Set()),{beat:0,grade:'good'});
  assert.deepEqual(judgeHit(noteTime(2)-200,new Set()),{beat:2,grade:'ok'});
  assert.equal(judgeHit(noteTime(1)+BEAT_MS/2-1,new Set()),null);
  assert.equal(judgeHit(noteTime(0),new Set([0])),null);
  assert.equal(judgeHit(10,new Set()),null);
  assert.equal(judgeHit(noteTime(TOTAL_BEATS-1)+BEAT_MS,new Set()),null);
});
test('motion detection reports the changed area and its center',()=>{
  const W=4,H=2,a=new Uint8ClampedArray(W*H*4),b=new Uint8ClampedArray(W*H*4);
  assert.deepEqual(detectMotion(a,b,W,H),{ratio:0,x:.5,y:.5});
  [0,1,2].forEach(i=>{b[(1*W+3)*4+i]=255;});
  const m=detectMotion(a,b,W,H);
  assert.equal(m.ratio,1/8);assert.equal(m.x,3.5/4);assert.equal(m.y,1.5/2);
});
test('only the rising edge of motion counts as a slap',()=>{
  assert.equal(isSlap(.2,.01),true);
  assert.equal(isSlap(.2,.19),false);
  assert.equal(isSlap(.03,0),false);
});


test('body edge returns outline points of the person and nothing for an empty frame', async () => {
  const { bodyEdge } = await import('../src/rhythm.js');
  const W = 20, H = 20, person = new Float32Array(W * H);
  for (let y = 5; y < 15; y++) for (let x = 6; x < 14; x++) person[y * W + x] = 1; // a block "body"
  const points = bodyEdge(person, W, H, 10);
  assert.ok(points.length > 0 && points.length <= 10);
  for (const p of points) {
    const x = Math.floor(p.x * W), y = Math.floor(p.y * H);
    assert.ok(x === 6 || x === 13 || y === 5 || y === 14, 'on the outline: ' + x + ',' + y);
  }
  assert.deepEqual(bodyEdge(new Float32Array(W * H), W, H), []);
});

test('motion sparkles follow the moving area in mirrored camera coordinates', async () => {
  const { motionEdge } = await import('../src/rhythm.js');
  const width = 64, height = 48, before = new Uint8ClampedArray(width * height * 4), after = before.slice();
  for (let y = 8; y < 30; y++) for (let x = 4; x < 20; x++) {
    const i = (y * width + x) * 4;
    after[i] = after[i + 1] = after[i + 2] = 255;
  }
  const points = motionEdge(before, after, width, height);
  assert.equal(points.length, 14);
  assert.ok(points.every(p => p.x > .68 && p.x < .94 && p.y > .16 && p.y < .63));
  assert.deepEqual(motionEdge(before, before, width, height), []);
});

// 33 Pose landmarks; only the listed indices are visible.
const pose = (visible, at = {}) => Array.from({ length: 33 }, (_, i) => ({ x: .5, y: .5, z: 0, visibility: visible.includes(i) ? .9 : .1, ...at[i] }));

test('upper body is enough for laundry: face, both shoulders and one arm (#106)', async () => {
  const { hasUpperBody } = await import('../src/rhythm.js');
  assert.equal(hasUpperBody(pose([0, 11, 12, 13])), true);
  assert.equal(hasUpperBody(pose([0, 11, 12, 16])), true);
  assert.equal(hasUpperBody(pose([0, 11, 12])), false, 'no arm');
  assert.equal(hasUpperBody(pose([11, 12, 13, 14])), false, 'no face');
  assert.equal(hasUpperBody(pose([0, 11, 13, 14])), false, 'one shoulder');
  assert.equal(hasUpperBody(undefined), false);
  // Hips, knees and ankles are not needed.
  assert.equal(hasUpperBody(pose([0, 11, 12, 13, 14, 15, 16])), true);
});

test('upper body area reaches 1.5 shoulder widths below the shoulders, within limits (#106)', async () => {
  const { upperBodyBottom, UPPER_FALLBACK } = await import('../src/rhythm.js');
  const at = (ly, ry, lx, rx) => ({ 11: { x: lx, y: ly }, 12: { x: rx, y: ry } });
  assert.ok(Math.abs(upperBodyBottom(pose([0, 11, 12, 13], at(.3, .3, .6, .4))) - .6) < 1e-9);
  assert.equal(upperBodyBottom(pose([0, 11, 12, 13], at(.1, .1, .52, .48))), .45, 'never smaller than .45');
  assert.equal(upperBodyBottom(pose([0, 11, 12, 13], at(.8, .8, .9, .1))), 1, 'never past the frame');
  assert.equal(upperBodyBottom(pose([0])), UPPER_FALLBACK);
});

test('motion below the upper body area does not count (#106)', () => {
  const W = 4, H = 4, a = new Uint8ClampedArray(W * H * 4), b = a.slice();
  [0, 1, 2].forEach(i => { b[(3 * W + 1) * 4 + i] = 255; }); // bottom row moves
  assert.equal(detectMotion(a, b, W, H).ratio, 1 / 16);
  assert.deepEqual(detectMotion(a, b, W, H, 40, 2), { ratio: 0, x: .5, y: .5 });
  [0, 1, 2].forEach(i => { b[(0 * W + 2) * 4 + i] = 255; }); // top row moves
  assert.equal(detectMotion(a, b, W, H, 40, 2).ratio, 1 / 8);
});

test('countdown is 3 seconds and grades read よき / まあまあ (#107 #108)', async () => {
  const { COUNTDOWN_SECONDS, GRADE_LABEL } = await import('../src/rhythm.js');
  assert.equal(COUNTDOWN_SECONDS, 3);
  assert.deepEqual(GRADE_LABEL, { good: 'よき', ok: 'まあまあ' });
});
