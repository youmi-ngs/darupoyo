import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/pcm-worklet.js', import.meta.url),'utf8');
for (const sampleRate of [16000,44100,48000]) test(`microphone supplies full analysis windows at ${sampleRate}Hz without dropping samples`, () => {
  let Processor; const chunks=[];
  class AudioWorkletProcessor { constructor(){this.port={postMessage:data=>chunks.push(Array.from(data))};} }
  vm.runInNewContext(source,{sampleRate,Float32Array,AudioWorkletProcessor,registerProcessor:(_,type)=>Processor=type});
  const processor=new Processor(), count=sampleRate*12;
  for(let offset=0;offset<count;offset+=128) processor.process([[Float32Array.from({length:Math.min(128,count-offset)},(_,i)=>offset+i)]]);
  assert.ok(chunks.length>=12);
  assert.ok(chunks.every(chunk=>chunk.length/sampleRate>=.975 && chunk.length/sampleRate<.976));
  const samples=chunks.flat(); assert.ok(samples.every((value,i)=>value===i));
  assert.ok(samples.length/sampleRate>10);
});
