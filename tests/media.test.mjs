import test from 'node:test';
import assert from 'node:assert/strict';
import { countdown } from '../src/media.js';
import { poseSimilarity, presetScore, PRESET_PASS } from '../src/pose.js';

const pose = Array.from({length:33},(_,i)=>({x:(i%2)*.4+.2,y:i/33,visibility:1,z:0}));
test('pose comparison normalizes translation and body scale',()=>{
  assert.equal(poseSimilarity(pose,pose),100);
  assert.equal(poseSimilarity(pose,pose.map(p=>({...p,x:p.x*2+3,y:p.y*2-4}))),100);
});
test('different limbs lower similarity and score stays bounded',()=>{
  const different = pose.map((p,i)=>({...p,x:p.x+(i===15?2:0)}));
  assert.ok(poseSimilarity(pose,different)<100);
  assert.ok(poseSimilarity(pose,different)>=0);
});

// A front-facing person standing straight with arms down (image coordinates, y down).
const POINTS = { 0:[.5,.15], 11:[.42,.3], 12:[.58,.3], 13:[.4,.42], 14:[.6,.42], 15:[.39,.54], 16:[.61,.54],
  23:[.45,.55], 24:[.55,.55], 25:[.45,.72], 26:[.55,.72], 27:[.45,.9], 28:[.55,.9] };
const person = (changes = {}) => Array.from({length:33}, (_, i) => {
  const [x, y] = changes[i] || POINTS[i] || [.5, .15];
  return { x, y, z:0, visibility:1 };
});
const standing = person();
// Left hand up on the right shoulder, like a sack over the shoulder.
const santa = person({ 13:[.5,.38], 15:[.56,.27] });
// Same carry, but knees bent and the body leaning.
const thief = person({ 0:[.62,.2], 11:[.52,.34], 12:[.66,.36], 13:[.58,.42], 14:[.68,.46], 15:[.64,.31], 16:[.7,.56], 25:[.5,.68], 26:[.6,.68], 27:[.44,.9], 28:[.54,.9] });
const wizard = person({ 14:[.64,.18], 16:[.68,.05] });

test('santa needs a hand on the shoulder and an upright body',()=>{
  assert.ok(presetScore('santa', santa) >= PRESET_PASS);
  assert.ok(presetScore('santa', standing) < PRESET_PASS);
  assert.ok(presetScore('santa', thief) < presetScore('santa', santa));
});
test('thief needs the carry plus bent knees or a lean',()=>{
  assert.ok(presetScore('thief', thief) >= PRESET_PASS);
  assert.ok(presetScore('thief', standing) < PRESET_PASS);
  assert.ok(presetScore('thief', santa) < PRESET_PASS);
});
test('wizard needs a straight arm raised above the head',()=>{
  assert.ok(presetScore('wizard', wizard) >= PRESET_PASS);
  assert.ok(presetScore('wizard', standing) < PRESET_PASS);
  assert.equal(presetScore('unknown', standing), null);
});
test('copycat similarity accepts a mirrored copy and rejects a different pose',()=>{
  const mirrored = santa.map((_, i, all) => {
    const swap = {11:12,12:11,13:14,14:13,15:16,16:15,23:24,24:23,25:26,26:25,27:28,28:27}[i] ?? i;
    return { ...all[swap], x: 1 - all[swap].x };
  });
  assert.ok(poseSimilarity(mirrored, santa) >= 95);
  assert.ok(poseSimilarity(wizard, santa) < poseSimilarity(mirrored, santa));
});

test('countdown shows each second, then resolves',async()=>{
  const shown=[];
  await countdown(1,n=>shown.push(n),new AbortController().signal);
  assert.deepEqual(shown,[1,0]);
});
test('countdown stops when aborted',async()=>{
  const controller=new AbortController(), shown=[];
  const running=countdown(5,n=>shown.push(n),controller.signal);
  controller.abort();
  await assert.rejects(running,{name:'AbortError'});
  assert.deepEqual(shown,[5]);
});
