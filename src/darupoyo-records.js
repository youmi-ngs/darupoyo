import { photoPreview } from './composer-ui.js';
import { limitInput, textLength } from './text-limits.js';
import { setBusy } from './busy.js';
import { whileSending } from './sending.js';
import { doneActionsHTML } from './celebrate.js';
import { audienceChip } from './audience.js';
import { api, client, refresh } from './api.js';
import { blobOf, photoCrop } from './camera.js';
import { takePhoto } from './photo-camera.js';
import './daily-tasks.css';

const LABELS = { laundry: '洗濯', meal: 'ごはん', dryer: 'ドライヤー', garbage: 'ゴミ捨て' };

const scopedApi = (house, path, body) => api('/houses/' + house + path, body);
const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };

async function preparePhoto(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('25MB以下の写真を選んでね');
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url; await image.decode();
    const crop = photoCrop(image.naturalWidth, image.naturalHeight), canvas = document.createElement('canvas');
    canvas.width = Math.min(1000, Math.floor(crop.width / 5) * 5); canvas.height = canvas.width * 6 / 5;
    if (!canvas.width) throw new Error('写真が小さすぎるみたい。別の写真を選んでね');
    canvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return await blobOf(canvas, 'image/jpeg');
  } catch (e) {
    if (e instanceof DOMException) throw new Error('この写真は開けませんでした。JPEG・PNGなどの写真を選んでね');
    throw e;
  } finally { URL.revokeObjectURL(url); }
}

export function setupDarupoyoRecords() {
  const dialog = el('dialog', null, 'darupoyo-dialog refined-modal'); dialog.setAttribute('aria-label', 'だるぽよを記録'); document.body.append(dialog);
  const feed = el('section', null, 'darupoyo-feed'); feed.setAttribute('aria-label', 'だるぽよの日');
  feed.append(el('h3','だるぽよの日'), el('p','ゆるい日も、そのままでかわいい。'));
  const status = el('p'); status.setAttribute('role','status');
  const list = el('div',null,'darupoyo-records'), more = el('button','もっと見る','btn'); more.type='button'; more.hidden=true;
  const retry = el('button','記録を読み直す','btn'); retry.type='button'; retry.hidden=true;
  feed.append(status,list,more,retry); // records are shown as cards on けーじばん (board-view.js)
  let cameraController;
  let dashboard, signature='', generation=0, nextCursor=null, composer=0, busy=false, previewUrl, goTo='board';
  const urls = new Set();
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    observer.unobserve(entry.target); void entry.target.loadPhoto?.();
  }));
  function release() { observer.disconnect(); urls.forEach(URL.revokeObjectURL); urls.clear(); }
  function discardPreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=null; }
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', () => {
    composer++; cameraController?.abort(); discardPreview();
    if (dialog.classList.contains('is-success')) window.dispatchEvent(new Event(goTo === 'entry' ? 'darupoyo:go-entry' : 'darupoyo:open-board'));
  });

  function appendRecords(items, house, version) {
    for (const record of items) {
      const card=el('article',null,'darupoyo-record'); card.dataset.recordId=record.id;
      const member=dashboard.house.members[record.user_id];
      card.append(el('strong',member?.display_name || '住人'),el('span',LABELS[record.chore]+'、だるぽよ','darupoyo-tag'));
      const time=el('time',new Intl.DateTimeFormat('ja-JP',{timeZone:dashboard.timezone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(record.created_at)));
      time.dateTime=record.created_at; card.append(time);
      if(record.caption) card.append(el('p',record.caption));
      if(record.media_id) {
        const img=el('img'); img.alt=LABELS[record.chore]+'の、ありのままの記録'; img.width=250; img.height=300; card.append(img);
        img.loadPhoto=async()=>{
          try {
            const blob=await scopedApi(house,'/media/'+record.media_id);
            if(version!==generation || !img.isConnected) return;
            const url=URL.createObjectURL(blob); urls.add(url); img.src=url;
          }catch{ if(version===generation) img.alt='写真を読み込めませんでした。記録を読み直してね'; }
        };
        observer.observe(img);
      }
      list.append(card);
    }
  }
  async function load(append=false) {
    if(!dashboard) return;
    const house=dashboard.house.id, version=append ? generation : ++generation;
    more.disabled=true; retry.hidden=true; status.textContent='読み込み中…';
    try {
      const result=await scopedApi(house,'/darupoyo'+(append && nextCursor ? '?before='+encodeURIComponent(nextCursor) : ''));
      if(version!==generation) return;
      if(!append) { release(); list.replaceChildren(); }
      appendRecords(result.items,house,version); nextCursor=result.next_cursor; more.hidden=!nextCursor;
      status.textContent=list.children.length ? '' : 'まだ記録はないよ。だるい日は「だるぽよ」で残そう。';
    }catch(e){ if(version===generation) status.textContent=e.message; }
    finally{ if(version===generation) { more.disabled=false; retry.hidden=false; } }
  }
  more.onclick=()=>void load(true); retry.onclick=()=>void load();

  function open(chore) {
    if(!client.house || !LABELS[chore]) return;
    cameraController?.abort();
    const house=client.house, version=++composer; busy=false; discardPreview();
    let photo=null, photoVersion=0, preparing=false, submission=null;
    dialog.classList.remove('is-success'); goTo = 'board';
    dialog.innerHTML='<header class="refined-header"><h2>だるぽよ</h2><button type="button" class="refined-close" data-close aria-label="閉じる"><img src="/refined/edfe8.svg" alt=""></button></header><p class="refined-description">ま、そんな日もあるっしょ〜♡</p><div class="composer-field"><label for="darupoyo-caption">ひとこと（かかなくてもおけ♡）</label><div class="composer-input"><textarea id="darupoyo-caption" aria-label="ひとこと（任意・30文字まで）" maxlength="30" rows="3"></textarea><div class="composer-attachment" data-photo hidden><img class="darupoyo-preview" alt="共有する写真の確認"><button type="button" class="composer-remove" data-remove aria-label="写真を外す"><img src="/refined/edfe8.svg" alt=""></button></div><div class="composer-toolbar"><div class="composer-photos"><button type="button" data-camera aria-label="写真を撮る"><img src="/refined/f677c.svg" alt=""></button><button type="button" data-library aria-label="ライブラリから選ぶ"><img src="/refined/18d84.svg" alt=""></button></div><span data-count>0 / 30</span></div><input type="file" accept="image/*" aria-label="写真を選ぶ" data-file hidden></div></div><p role="status"></p><button type="button" class="refined-button" data-save>きょーゆー</button>';
    const file=dialog.querySelector('[data-file]'), camera=dialog.querySelector('[data-camera]'), library=dialog.querySelector('[data-library]'), caption=dialog.querySelector('textarea'), preview=dialog.querySelector('.darupoyo-preview'), attachment=dialog.querySelector('[data-photo]'), remove=dialog.querySelector('[data-remove]'), save=dialog.querySelector('[data-save]'), close=dialog.querySelector('[data-close]'), notice=dialog.querySelector('[role=status]');
    photoPreview(preview);
    const audience=audienceChip(); save.before(audience.el); // 共有範囲
    const inputState = limitInput(caption, 30, dialog.querySelector("[data-count]"), {preserveOverflow:true});
    caption.after(dialog.querySelector("[data-count]"));
    library.onclick=()=>file.click();
    const valid=()=>{ save.disabled=busy || preparing || inputState.isComposing() || textLength(caption.value)>30; };
    caption.oninput=()=>{ submission=null; notice.textContent=''; save.textContent='きょーゆー'; valid(); };
    caption.addEventListener('compositionstart',valid); caption.addEventListener('compositionend',valid);
    close.onclick=()=>{ if(!busy) dialog.close(); };
    remove.onclick=()=>{ submission=null; photoVersion++; photo=null; preparing=false; file.value=''; discardPreview(); attachment.hidden=true; preview.removeAttribute('src'); notice.textContent=''; valid(); };
    const onPhoto=async(event)=>{
      const chosen=event.target.files[0]; if(!chosen) return;
      const revision=++photoVersion; preparing=true; notice.textContent='写真を準備中…'; valid();
      try {
        const prepared=await preparePhoto(chosen);
        if(version!==composer || revision!==photoVersion) return;
        submission=null; photo=prepared; discardPreview(); previewUrl=URL.createObjectURL(photo); preview.src=previewUrl; attachment.hidden=false; notice.textContent='';
      }catch(e){ if(version===composer && revision===photoVersion) notice.textContent=e.message; }
      finally{ if(version===composer && revision===photoVersion) { preparing=false; valid(); } }
    };
    file.onchange=onPhoto;
    camera.onclick=async()=>{
      cameraController?.abort(); cameraController=new AbortController();
      camera.disabled=true; notice.textContent='';
      try {
        const photo=await takePhoto(cameraController.signal);
        if(version===composer) await onPhoto({target:{files:[photo]}});
      } catch(e) { if(version===composer && e.name!=='AbortError') notice.textContent=e.message; }
      finally { if(version===composer) { camera.disabled=false; camera.focus(); } }
    };
    save.onclick=async()=>{
      if(busy || preparing || inputState.isComposing() || client.house!==house) return;
      if(textLength(caption.value)>30) { caption.reportValidity(); caption.focus(); valid(); return; }
      submission ||= {request_id:crypto.randomUUID(),chore,caption:caption.value.trim(),share_to:audience.shareTo()};
      busy=true; [file,camera,library,caption,remove,save,close].forEach(n=>n.disabled=true); notice.textContent=''; setBusy(save,true,'共有しています…');
      try {
        const {record}=await whileSending(dialog, async()=>{ // そ〜しんちゅ〜
          if(photo && !submission.media_id) submission.media_id=(await scopedApi(house,'/media?kind=darupoyo',photo)).id;
          return scopedApi(house,'/darupoyo',submission);
        });
        if(version!==composer) return;
        discardPreview(); dialog.classList.add('is-success'); dialog.innerHTML='<div class="record-celebration" aria-hidden="true"><span class="record-confetti"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><img class="refined-success-art" src="/refined/3759b.svg" alt=""></div><h2>だるぽよ、<br>記録かんりょ〜</h2><p>きょうのあんたも、超かわいいよん♡</p>'+doneActionsHTML('けーじばんを見る');
        // #176: けーじばん or the entrance (closing with Esc still goes to けーじばん).
        dialog.querySelectorAll('[data-done]').forEach(button=>{ button.onclick=()=>{ goTo=button.dataset.done; dialog.close(); }; });
        dialog.querySelector('[data-done]').focus({preventScroll:true});
        window.dispatchEvent(new CustomEvent('darupoyo:recorded',{detail:{houseId:house,record}}));
        signature=''; void refresh().catch(()=>{}); if(feed.isConnected) void load();
      }catch(e){ if(version===composer) { setBusy(save,false); notice.textContent=e.message+' 内容を直すか、同じ内容で再試行できます。'; save.textContent='共有を再試行'; [file,camera,library,caption,remove,close].forEach(n=>n.disabled=false); } }
      finally{ busy=false; if(version===composer && save.isConnected) valid(); }
    };
    dialog.showModal(); close.focus();
  }
  return {
    addChoice(root,chore,beforeOpen) {
      const button=el('button','だるぽよ','btn btn-sub darupoyo-choice'); button.type='button';
      button.className='refined-button secondary darupoyo-choice'; button.append(el('small','きょうはサボる'));
      button.onclick=()=>{ beforeOpen?.(); open(chore); }; root.append(button);
    },
    update(data) {
      if(dashboard && dashboard.house.id!==data.house.id) { generation++; release(); list.replaceChildren(); dialog.close(); }
      dashboard=data;
      const next=JSON.stringify([data.house.id,data.state.day,data.state.darupoyo_updated_at,data.house.members]);
      if(next!==signature){ signature=next; if(feed.isConnected) void load(); }
    },
  };
}
