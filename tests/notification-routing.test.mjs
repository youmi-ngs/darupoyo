import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/push-sw.js',import.meta.url),'utf8');
function setup(windows=[]) {
 const events={},calls=[],entries=new Map();
 const cache={put:async(k,v)=>entries.set(k,v),match:async k=>entries.get(k)?.clone(),delete:async k=>entries.delete(k)};
 const self={location:{origin:'https://example.test'},addEventListener:(n,f)=>events[n]=f,clients:{matchAll:async()=>windows,openWindow:async url=>calls.push(url)}};
 vm.runInNewContext(source,{self,URL,Response,caches:{open:async()=>cache},Date:{now:()=>12345}});
 const dispatch=async(name,event)=>{let done;events[name]({...event,waitUntil:p=>done=p});await done;};
 return {calls,entries,dispatch};
}
test('tap wakes the existing app and retains its target until matching acknowledgement',async()=>{
 const messages=[],calls=[];
 const x=setup([{url:'https://example.test/',postMessage:m=>messages.push(m),focus:async()=>calls.push('focus')}]);
 await x.dispatch('notificationclick',{notification:{close(){},data:{link:'/#house=B&post=123&kind=post'}}});
 assert.equal(messages.length,2); assert.equal(calls[0],'focus');assert.equal(x.entries.size,1);
 const received=[];
 await x.dispatch('message',{data:{type:'darupoyo-notification-read'},source:{postMessage:m=>received.push(m)}});
 assert.equal(received[0].link,'https://example.test/?notification=12345#house=B&post=123&kind=post');
 await x.dispatch('message',{data:{type:'darupoyo-notification-ack',id:'old'}});assert.equal(x.entries.size,1);
 await x.dispatch('message',{data:{type:'darupoyo-notification-ack',id:'12345'}});assert.equal(x.entries.size,0);
});
test('closed app opens target and external destinations are rejected without storing them',async()=>{
 const x=setup();
 await x.dispatch('notificationclick',{notification:{close(){},data:{link:'https://other.test/'}}});assert.equal(x.entries.size,0);
 await x.dispatch('notificationclick',{notification:{close(){},data:{link:'/#house=B&post=123'}}});
 assert.deepEqual(x.calls,['https://example.test/?notification=12345#house=B&post=123']);assert.equal(x.entries.size,1);
});
