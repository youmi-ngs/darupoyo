import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/push-sw.js', import.meta.url),'utf8');
test('notification click navigates an existing tab to the target before focusing it',async()=>{
  const events={}, calls=[];
  const self={location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn,clients:{matchAll:async()=>[{url:'https://example.test/',navigate:async url=>calls.push(url),focus:async()=>calls.push('focus')} ]}};
  vm.runInNewContext(source,{self,URL,Date:{now:()=>12345}});
  let done;events.notificationclick({notification:{close(){},data:{link:'/#house=B&post=123&kind=post'}},waitUntil:p=>done=p});
  await done;assert.deepEqual(calls,['https://example.test/?notification=12345#house=B&post=123&kind=post','focus']);
});
test('notification from a closed app opens its target and rejects external destinations',async()=>{
  const events={},calls=[];
  const self={location:{origin:'https://example.test'},addEventListener:(name,fn)=>events[name]=fn,clients:{matchAll:async()=>[],openWindow:async url=>calls.push(url)}};
  vm.runInNewContext(source,{self,URL,Date:{now:()=>12345}});
  for(const link of ['/#house=B&post=123','https://other.test/']) {let done;events.notificationclick({notification:{close(){},data:{link}},waitUntil:p=>done=p});await done;}
  assert.deepEqual(calls,['https://example.test/?notification=12345#house=B&post=123']);
});
