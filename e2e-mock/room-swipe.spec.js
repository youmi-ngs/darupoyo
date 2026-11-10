import {test,expect} from '@playwright/test';
import {setWelcomeName,setHouseName} from '../e2e/onboarding-helper.js';
async function swipe(page,x,y,dx,dy=0,cancel=false) {
 await page.locator('#room-view').evaluate((room,{x,y,dx,dy,cancel})=>{
  const send=(type,cx,cy)=>{
   const touch={identifier:1,target:room,clientX:cx,clientY:cy};
   const event=new Event(type,{bubbles:true,cancelable:true});
   Object.defineProperties(event,{touches:{value:type==='touchend'||type==='touchcancel'?[]:[touch]},changedTouches:{value:[touch]}});
   room.dispatchEvent(event);
  };
  send('touchstart',x,y);send('touchmove',x+dx,y+dy);send(cancel?'touchcancel':'touchend',x+dx,y+dy);
 },{x,y,dx,dy,cancel});
}
test('left-edge swipe exits a room; central, vertical, short and cancelled gestures stay',async({page})=>{
 await page.goto('/');await setWelcomeName(page,'スワイプ');await setHouseName(page,'戻る操作');
 await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click();await page.getByRole('button',{name:'ハウスに入る',exact:true}).click();await page.getByRole('button',{name:'スキップ',exact:true}).click();
 await page.locator('.door.is-me').click();const room=page.locator('#room-view');await expect(room).toBeVisible();
 await page.waitForTimeout(400);const b=await room.boundingBox();const x=b.x+8,y=b.y+b.height*.6;
 for(const args of [[x+120,y,150],[x,y,10,150],[x,y,25],[x,y,130,0,true]]) {
  await swipe(page,...args);await expect(room).toBeVisible();await page.waitForTimeout(200);
 }
 await swipe(page,x,y,150);await expect(room).toBeHidden();await expect(page.locator('#house-view')).toBeVisible();
 await page.locator('.door.is-me').click();await expect(room).toBeVisible();await page.locator('#room-back').click();await expect(room).toBeHidden();
});
