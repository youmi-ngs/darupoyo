import { api, client, refresh } from './api.js';
import { blobOf, photoCrop } from './camera.js';
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
  const dialog = el('dialog', null, 'darupoyo-dialog'); dialog.setAttribute('aria-label', 'だるぽよを記録'); document.body.append(dialog);
  const feed = el('section', null, 'darupoyo-feed'); feed.setAttribute('aria-label', 'だるぽよの日');
  feed.append(el('h3','だるぽよの日'), el('p','できなかった日も、そのままでかわいい。'));
  const status = el('p'); status.setAttribute('role','status');
  const list = el('div',null,'darupoyo-records'), more = el('button','もっと見る','btn'); more.type='button'; more.hidden=true;
  const retry = el('button','記録を読み直す','btn'); retry.type='button'; retry.hidden=true;
  feed.append(status,list,more,retry); document.querySelector('.sv-board')?.append(feed);
  let dashboard, signature='', generation=0, nextCursor=null, composer=0, busy=false, previewUrl;
  const urls = new Set();
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    observer.unobserve(entry.target); void entry.target.loadPhoto?.();
  }));
  function release() { observer.disconnect(); urls.forEach(URL.revokeObjectURL); urls.clear(); }
  function discardPreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=null; }
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', () => { composer++; discardPreview(); });

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
    const house=client.house, version=++composer; busy=false; discardPreview();
    let photo=null, photoVersion=0, preparing=false, submission=null;
    dialog.innerHTML='<button type="button" class="btn" data-close>閉じる</button><h2></h2><p>できなかった日も、そのままでかわいい。写真か一言を残してね。同じハウスのみんなに共有されます。</p><label>写真を撮る・選ぶ（任意）<input type="file" accept="image/*" capture="environment"></label><img class="darupoyo-preview" alt="共有する写真の確認" hidden><button type="button" class="btn" data-remove hidden>写真を外す</button><label>ひとこと（任意・140文字まで）<textarea maxlength="140" rows="3" placeholder="今日は洗い物、そのまま〜"></textarea></label><p class="darupoyo-note">家事の完了にはならないよ。部屋の明かりもそのまま。</p><p role="status"></p><button type="button" class="btn btn-main" data-save disabled>このだるぽよを共有</button>';
    dialog.querySelector('h2').textContent=LABELS[chore]+'、今日はだるぽよ';
    const file=dialog.querySelector('input'), caption=dialog.querySelector('textarea'), preview=dialog.querySelector('img'), remove=dialog.querySelector('[data-remove]'), save=dialog.querySelector('[data-save]'), close=dialog.querySelector('[data-close]'), notice=dialog.querySelector('[role=status]');
    const valid=()=>{ save.disabled=busy || preparing || (!photo && !caption.value.trim()); };
    caption.oninput=valid; close.onclick=()=>{ if(!busy) dialog.close(); };
    remove.onclick=()=>{ photoVersion++; photo=null; preparing=false; file.value=''; discardPreview(); preview.hidden=remove.hidden=true; notice.textContent=''; valid(); };
    file.onchange=async()=>{
      const chosen=file.files[0]; if(!chosen) return;
      const revision=++photoVersion; preparing=true; notice.textContent='写真を準備中…'; valid();
      try {
        const prepared=await preparePhoto(chosen);
        if(version!==composer || revision!==photoVersion) return;
        photo=prepared; discardPreview(); previewUrl=URL.createObjectURL(photo); preview.src=previewUrl; preview.hidden=remove.hidden=false; notice.textContent='';
      }catch(e){ if(version===composer && revision===photoVersion) notice.textContent=e.message; }
      finally{ if(version===composer && revision===photoVersion) { preparing=false; valid(); } }
    };
    save.onclick=async()=>{
      if(busy || preparing || client.house!==house) return;
      submission ||= {request_id:crypto.randomUUID(),chore,caption:caption.value.trim()};
      busy=true; [file,caption,remove,save,close].forEach(n=>n.disabled=true); notice.textContent='共有中…';
      try {
        if(photo && !submission.media_id) submission.media_id=(await scopedApi(house,'/media?kind=darupoyo',photo)).id;
        const {record}=await scopedApi(house,'/darupoyo',submission);
        if(version!==composer) return;
        discardPreview(); dialog.innerHTML='<h2>だるぽよ、残せたよ♡</h2><p>できなかった自分も、今日のじぶん。ゆるくいこ〜。</p><button type="button" class="btn btn-main">お部屋へ</button>';
        dialog.querySelector('button').onclick=()=>dialog.close();
        window.dispatchEvent(new CustomEvent('darupoyo:recorded',{detail:{houseId:house,record}}));
        signature=''; void refresh().catch(()=>{}); void load();
      }catch(e){ if(version===composer) { notice.textContent=e.message+' 同じ内容で再試行できます。'; save.textContent='共有を再試行'; save.disabled=close.disabled=false; } }
      finally{ busy=false; }
    };
    dialog.showModal(); close.focus();
  }
  return {
    addChoice(root,chore,beforeOpen) {
      const button=el('button','だるぽよ','btn btn-sub darupoyo-choice'); button.type='button';
      button.append(el('small','できなかった日も、そのまま残す'));
      button.onclick=()=>{ beforeOpen?.(); open(chore); }; root.append(button);
    },
    update(data) {
      if(dashboard && dashboard.house.id!==data.house.id) { generation++; release(); list.replaceChildren(); dialog.close(); }
      dashboard=data;
      const next=JSON.stringify([data.house.id,data.state.day,data.state.darupoyo_updated_at,data.house.members]);
      if(next!==signature){ signature=next; void load(); }
    },
  };
}
