import { client, houseApi } from './api.js';
import { capture } from './media.js';

export function setupMoments() {
  const dialog = document.createElement('dialog');
  dialog.className = 'moments-dialog';
  dialog.setAttribute('aria-label', 'みんなの今');
  dialog.innerHTML = '<button class="btn" type="button" data-close>閉じる</button><h2>みんなの今</h2><p>家事とは別の、気ままな近況。写真はハウスの住人にだけ共有されます。</p><button class="btn btn-main" type="button" data-shoot>自撮りを撮る</button><button class="btn" type="button" data-refresh>更新</button><p role="status"></p><div data-content></div>';
  document.body.append(dialog);
  const content = dialog.querySelector('[data-content]'), status = dialog.querySelector('[role=status]');
  const shoot = dialog.querySelector('[data-shoot]'), refresh = dialog.querySelector('[data-refresh]');
  let controller, urls = [], generation = 0, busy = false;
  const clearUrls = () => { urls.forEach(URL.revokeObjectURL); urls = []; };
  const reset = () => { generation++; controller?.abort(); controller = null; clearUrls(); busy = false; shoot.disabled = refresh.disabled = false; };
  dialog.addEventListener('close', reset);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  async function load() {
    reset(); const current = generation; content.replaceChildren(); status.textContent = '読み込み中…';
    shoot.disabled = refresh.disabled = true;
    try {
      const house = await houseApi('/dashboard'), page = await houseApi('/moments');
      if (current !== generation) return;
      const append = async result => {
        for (const moment of result.items) {
          const blob = await houseApi('/media/' + moment.media_id);
          if (current !== generation) return;
          const url = URL.createObjectURL(blob); urls.push(url);
          const card = document.createElement('article'), img = document.createElement('img'); img.src = url; img.alt = 'ハウスの近況写真';
          const name = document.createElement('strong'); name.textContent = house.house.members[moment.user_id]?.display_name || '住人';
          const time = document.createElement('time'); time.dateTime = moment.created_at; time.textContent = new Date(moment.created_at).toLocaleString();
          const caption = document.createElement('p'); caption.textContent = moment.caption;
          card.append(name,time,img,caption);content.append(card);
        }
        if (result.next_cursor && current === generation) {
          const more = document.createElement('button');more.className='btn';more.textContent='もっと見る';content.append(more);
          more.onclick = async () => { more.disabled=true;try { const next=await houseApi('/moments?before='+encodeURIComponent(result.next_cursor)); more.remove();await append(next); } catch { more.disabled=false;status.textContent='読み込めませんでした。もう一度試してね'; } };
        }
      };
      await append(page);
      if (current === generation) status.textContent = page.items.length ? '' : 'まだ写真がありません。今のじぶんを撮ってみよう';
    } catch(e) { if (current === generation) status.textContent=e.message; }
    finally { if(current===generation) shoot.disabled=refresh.disabled=false; }
  }
  refresh.onclick = load;
  document.querySelectorAll('#open-moments, [data-open-moments]').forEach(button => {
    button.onclick = () => { document.querySelector('#menu')?.close(); dialog.showModal(); void load(); };
  });
  shoot.onclick = async () => {
    reset(); const current = generation, house = client.house; controller = new AbortController();
    shoot.disabled=refresh.disabled=true;status.textContent='';content.replaceChildren();
    try {
      const evidence=await capture(content,'selfie',{title:'今のじぶん'},null,controller.signal);
      if(current!==generation) return;
      const label=document.createElement('label');label.textContent='ひとこと（任意）';
      const caption=document.createElement('input');caption.maxLength=140;label.append(caption);
      const save=document.createElement('button');save.className='btn btn-main';save.textContent='みんなに共有';
      const cancel=document.createElement('button');cancel.className='btn';cancel.textContent='やめる';cancel.onclick=load;
      content.append(label,save,cancel);
      let mediaId;const requestId=crypto.randomUUID();
      save.onclick=async()=>{
        if(busy || client.house!==house)return;busy=true;save.disabled=cancel.disabled=true;caption.disabled=true;
        try {
          mediaId ||= (await houseApi('/media?kind=selfie',evidence.blob)).id;
          await houseApi('/moments',{request_id:requestId,media_id:mediaId,caption:caption.value});
          window.dispatchEvent(new CustomEvent('darupoyo:moment')); // けーじばん picks up the new selfie
          if(current===generation) await load();
        }catch(e){if(current===generation){status.textContent=e.message;save.disabled=cancel.disabled=false;}}
        finally{busy=false;}
      };
    }catch(e){if(current===generation && e.name!=='AbortError'){status.textContent=e.message;shoot.disabled=refresh.disabled=false;}}
  };
}
