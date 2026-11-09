import { limitInput } from './text-limits.js';
// Refined first-entry flow. Submission stays explicit; typing never creates a house.
export function createWelcome() {
  const dialog = document.createElement('dialog');
  dialog.className = 'onboarding refined-welcome';
  dialog.innerHTML = '<div class="welcome-surface"></div>';
  const surface = dialog.firstElementChild;
  let loadingSince = performance.now();
  dialog.addEventListener('cancel', e => e.preventDefault());
  document.body.append(dialog); dialog.showModal();
  const screen = (title, mode = 'card', direction = 'forward') => {
    dialog.dataset.screen = mode;
    dialog.classList.toggle('is-loading', mode === 'loading');
    dialog.setAttribute('aria-label', title);
    surface.replaceChildren();
    const card = document.createElement('div'); card.className = 'welcome-card'; card.dataset.direction = direction; surface.append(card);
    const h = document.createElement('h2'); h.textContent = title; card.append(h);
    if (mode === 'card' || mode === 'created') {
      // Announce each new step without opening the mobile keyboard.
      h.tabIndex = -1;
      queueMicrotask(() => { if (card.isConnected && !card.contains(document.activeElement)) h.focus({ preventScroll: true }); });
    }
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.hidden = true; card.append(status);
    return { card, status, h };
  };
  const action = (card, label, work, secondary = false) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'refined-button' + (secondary ? ' secondary' : ''); b.textContent = label;
    b.onclick = async () => {
      if (b.disabled) return;
      const status = card.querySelector('[role=status]'); status.hidden = true;
      const controls = [...card.querySelectorAll('button,input')].map(el => [el, el.disabled]);
      controls.forEach(([el]) => { el.disabled = true; }); b.setAttribute('aria-busy', 'true');
      try { await work(); } catch(e) { status.hidden = false; status.textContent = e.message; }
      finally { controls.forEach(([el, disabled]) => { el.disabled = disabled; }); b.removeAttribute('aria-busy'); }
    };
    card.insertBefore(b, card.querySelector('[role=status]')); return b;
  };
  const loading = () => {
    loadingSince = performance.now();
    const {card,h} = screen('だるぽよ 読み込み中','loading'); h.className = 'sr-only';
    const logo = document.createElement('img'); logo.src = '/refined/7fa43.svg'; logo.alt = 'だるぽよ'; logo.className = 'welcome-logo'; card.prepend(logo);
    const p = document.createElement('p'); p.className = 'sr-only onboarding-loading'; p.textContent = 'よみこみ中…'; card.append(p);
  };
  loading();
  return {
    dialog, loading,
    async leave() {
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (dialog.dataset.screen === 'loading') {
          await surface.querySelector('.welcome-logo')?.decode().catch(() => {});
          await new Promise(resolve => setTimeout(resolve, Math.max(0, 550 - (performance.now() - loadingSince))));
        }
        dialog.classList.add('welcome-leaving');
        await dialog.animate([{opacity:1},{opacity:0}], {duration:460,easing:'ease-out',fill:'forwards'}).finished.catch(() => {});
      }
      dialog.close(); dialog.remove();
    },
    async login(signIn) {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const logoReady = surface.querySelector('.welcome-logo');
      await logoReady?.decode().catch(() => {});
      if (!reduced) await new Promise(resolve => setTimeout(resolve, Math.max(0, 850 - (performance.now() - loadingSince))));
      const {card,h} = screen('Googleでログイン','login'); h.className = 'sr-only';
      const logo = document.createElement('img'); logo.src='/refined/7fa43.svg'; logo.alt='だるぽよ'; logo.className='welcome-logo'; card.prepend(logo);
      await new Promise(resolve => {
        const b=action(card,'Google でログイン',async()=>{ await signIn(); resolve(); });
        b.className='google-sign-in'; b.setAttribute('aria-label','Googleでログイン');
        if (!reduced) { b.disabled=true; setTimeout(()=>{ if(b.isConnected) b.disabled=false; },700); }
        const icon=document.createElement('img'); icon.src='/refined/99579.svg'; icon.alt=''; b.prepend(icon);
        const agree=document.createElement('p'); agree.className='welcome-legal';
        agree.innerHTML='ログインすると、<a href="/terms.html">利用規約</a>と<a href="/privacy.html">プライバシーポリシー</a>に同意したことになるよ（18歳以上）';
        b.after(agree);
      }); loading();
    },
    created(houseName, enter) {
      const {card,h,status}=screen('新しくつくったよ！','created');
      card.classList.add('house-created');
      const art=document.createElement('div'); art.className='record-celebration house-created-art'; art.setAttribute('aria-hidden','true');
      const confetti=document.createElement('span'); confetti.className='record-confetti';
      for(let i=0;i<12;i++) confetti.append(document.createElement('i'));
      const house=document.createElement('img'); house.className='refined-success-art'; house.src='/refined/house-created.svg'; house.alt='';
      art.append(confetti,house); card.prepend(art);
      const name=document.createElement('p'); name.className='created-house-name'; name.textContent=houseName;
      const message=document.createElement('p'); message.className='refined-description'; message.textContent='ここから、みんなの「できた」を増やそ〜♡';
      card.insertBefore(name,status); card.insertBefore(message,status);
      action(card,'おうちに入る',enter).focus();
    },
    deletion(work) {
      const {card,status}=screen('アカウント削除の再開'); status.hidden=false; status.textContent='アカウント削除が途中です。再開して残りのデータを削除してください。'; action(card,'削除を再開',work);
    },
    choose({ items, invite, initialName, askName, saveName, enter, submit }) {
      let name=initialName || '', code=invite || '', houseName='';
      const formScreen=(title, label, value, limit, confirm, onSubmit, back) => {
        const {card,status}=screen(title); const form=document.createElement('form'); card.insertBefore(form,status);
        const input=document.createElement('input'); input.placeholder=label==='あなたの名前'?'なまえ':label==='新しいハウスの名前'?'ハウスのなまえ':label;
        input.setAttribute('aria-label',label); input.required=true; input.maxLength=limit; input.value=value; input.enterKeyHint='done'; input.autocomplete=label==='あなたの名前'?'nickname':'off'; form.append(input); limitInput(input, limit);
        const b=action(card,confirm,()=>onSubmit(input.value.trim())); b.hidden=!input.value.trim();
        input.oninput=()=>{ b.hidden=!input.value.trim(); };
        form.onsubmit=e=>{e.preventDefault();if(input.value.trim())b.click();};
        if(back) {const goBack=action(card,'もどる',()=>back(input.value),true); goBack.classList.add('welcome-back');}
        // Keep the initial screen's empty-input composition. A tap or Tab starts editing.
        return input;
      };
      const create=()=>formScreen('新しく家をつくる','新しいハウスの名前',houseName,20,'ハウスをつくる',async value=>{await submit(false,value,name);}, value=>{houseName=value;choose('back');});
      const join=()=>formScreen('友達の家に住む','招待コード',code,200,'招待に参加する',async value=>{await submit(true,value,name);}, value=>{code=value;choose('back');});
      // #181: the houses you already live in sit one step further in, under 帰る.
      const homes=()=>{
        const {card}=screen('どのおうちに帰る？','card');
        items.forEach(h=>action(card,h.name+'に帰る',()=>enter(h.id)).classList.add('welcome-home'));
        action(card,'もどる',()=>choose('back'),true).classList.add('welcome-back');
      };
      // Three choices, each its own colour (#181).
      const choose=(direction='forward')=>{
        const {card}=screen('やっほ〜','card',direction);
        if(items.length) action(card,'すでに入居済みの家に帰る',homes).classList.add('welcome-home');
        action(card,'友達の家に住む',join).classList.add('welcome-join');
        action(card,'新しく家をつくる',create,true).classList.add('welcome-create');
      };
      if(askName || !name) formScreen('なまえおしえて〜','あなたの名前',name,12,'次へ',value=>{name=value;saveName(value);invite?join():choose();});
      else invite?join():choose();
    },
  };
}
