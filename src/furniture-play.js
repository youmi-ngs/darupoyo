import { sfx } from './sfx.js';
import './daily-tasks.css';

// PC① may supply data-furniture-name on replacement artwork. Keep artwork and
// task buttons intact; this adapter only adds keyboard/tap behavior to props.
const SELECTOR = '.scene .sv > .sv-obj:not(.balcony-pole), .myroom > .mr-bed, .myroom > .mr-desk, .myroom > .mr-lamp, .myroom > .mr-window, [data-furniture-name]';
const NAMES = { outside:['ハウス'], entry:['玄関のドア'], ldk:['時計','窓'], wash:['植木'] };
// Every fifth play drops one of these little gal treasures.
const PRIZES = [
  { name:'つけまつげ', short:'つけま', svg:'<path d="M10 12Q40 40 70 12M15 18L9 28M26 25l-4 12M40 29v12M54 25l4 12M65 18l6 10" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>' },
  { name:'ネイルチップ', short:'ネイルチップ', svg:'<g stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M28 40V16q0-12 12-12t12 12v24z" fill="#FFB3DE"/><path d="M34 14q2-5 6-6" fill="none" stroke="#FFFFFF" stroke-width="3"/><path d="M40 24l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z" fill="#FFF4A8" stroke-width="1.5"/></g>' },
  { name:'アメピン', short:'アメピン', svg:'<g stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" fill="none" stroke-width="3.5"><path d="M8 30h58q8 0 8-6t-8-6H8"/><path d="M8 18q8-5 14 0t14 0t14 0t14 0"/></g>' },
  { name:'ピアスのキャッチ', short:'ピアスのキャッチ', svg:'<g stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><ellipse cx="40" cy="30" rx="16" ry="7" fill="#FFE08A"/><path d="M24 30v-8q0-7 16-7t16 7v8" fill="#FFE08A"/><ellipse cx="40" cy="22" rx="16" ry="7" fill="#FFF4A8"/><ellipse cx="40" cy="22" rx="3.5" ry="1.8" fill="#3B2560"/></g>' },
];
export function setupFurniturePlay() {
  let taps=0, house='', prize=null, expiry;
  const bound=new WeakSet(), animations=new WeakMap();
  const status=document.createElement('p'); status.className='furniture-play-status'; status.setAttribute('role','status'); document.body.append(status);
  const clearPrize=()=>{ clearTimeout(expiry); prize?.remove(); prize=null; };
  function play(target) {
    taps++; sfx.pop();
    const special=taps%5===0;
    animations.get(target)?.cancel();
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frames=special ? [{rotate:'0deg',scale:'1'},{rotate:'18deg',scale:'.85'},{rotate:'-6deg',scale:'1'},{rotate:'0deg',scale:'1'}] : [{rotate:'0deg'},{rotate:'-4deg'},{rotate:'4deg'},{rotate:'0deg'}];
      animations.set(target,target.animate(frames,{duration:special?650:350,easing:'ease-out'}));
    }
    if(!special) { status.textContent='ぽよっ'; return; }
    clearPrize(); sfx.ding();
    const room=target.closest('.sv, .myroom'); if(!room) return;
    const item=PRIZES[Math.floor(Math.random()*PRIZES.length)];
    prize=document.createElement('button'); prize.type='button'; prize.className='furniture-prize'; prize.setAttribute('aria-label','落ちた'+item.name+'を拾う');
    prize.innerHTML='<svg viewBox="0 0 80 45" aria-hidden="true">'+item.svg+'</svg><span>'+item.short+'♡</span>';
    prize.onclick=()=>{ clearPrize(); sfx.clear(); status.textContent=item.short+'みっけ♡ ラッキ〜'; status.classList.add('is-visible'); setTimeout(()=>status.classList.remove('is-visible'),2000); };
    room.append(prize); status.textContent=item.short+'が落ちた！拾ってみよ♡'; expiry=setTimeout(clearPrize,15000);
  }
  function bind() {
    document.querySelectorAll(SELECTOR).forEach(target=>{
      if(bound.has(target) || target.matches('.sv-hit') || target.closest('button,a')) return;
      bound.add(target);
      const scene=target.closest('.scene'), siblings=scene ? [...scene.querySelectorAll('.sv > .sv-obj')] : [];
      const name=target.dataset.furnitureName || NAMES[scene?.dataset.scene]?.[siblings.indexOf(target)] || ({'mr-bed':'ベッド','mr-desk':'机','mr-lamp':'ライト','mr-window':'窓'})[[...target.classList].find(c=>c.startsWith('mr-'))] || '家具';
      target.classList.add('furniture-toy'); target.removeAttribute('aria-hidden'); target.setAttribute('role','button'); target.setAttribute('tabindex','0');
      if(target.id!=='room-clock') target.setAttribute('aria-label',name+'であそぶ');
      target.addEventListener('pointerdown',()=>target.classList.add('is-pointer-focus'));
      target.addEventListener('blur',()=>target.classList.remove('is-pointer-focus'));
      target.addEventListener('click',()=>play(target));
      target.addEventListener('keydown',event=>{ target.classList.remove('is-pointer-focus'); if(event.key==='Enter' || event.key===' ') { event.preventDefault(); if(!event.repeat) play(target); } });
    });
  }
  bind();
  const observer=new MutationObserver(bind);
  for(const root of document.querySelectorAll('#plan,#room-detail')) observer.observe(root,{childList:true,subtree:true});
  return { update(data) { if(house!==data.house.id) { house=data.house.id; taps=0; clearPrize(); status.textContent=''; status.classList.remove('is-visible'); } } };
}
