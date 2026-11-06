import test from 'node:test';
import assert from 'node:assert/strict';
import { poseSimilarity, countdown } from '../src/media.js';
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
