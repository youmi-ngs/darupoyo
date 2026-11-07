// Photos and sharing: profile photos (#96), photo comments (#88) and the
// setting that shows records from other houses to this house (#99).
import { houseApi, refresh } from './api.js';

// A resident's round mark: their profile photo, or the first letter of their name.
export function residentDot(member, name, color, className = 'who-dot') {
  const d = document.createElement('span'); d.className = className + ' m-' + color; d.setAttribute('aria-hidden', 'true');
  if (member?.avatar) { d.classList.add('has-avatar'); const img = document.createElement('img'); img.src = member.avatar; img.alt = ''; d.append(img); }
  else d.textContent = (name || '').slice(0, 1);
  return d;
}

// ---------- comments ----------
// ctx = { me, nameOf, dotOf(uid), toast }
export function commentsBlock(post, ctx) {
  const box = document.createElement('section'); box.className = 'comments'; box.setAttribute('aria-label', 'コメント');
  const list = document.createElement('ul'); list.className = 'comment-list';
  const form = document.createElement('form'); form.className = 'comment-form';
  const input = document.createElement('input'); input.maxLength = 200; input.placeholder = 'コメントする'; input.setAttribute('aria-label', 'コメントを書く');
  const send = document.createElement('button'); send.type = 'submit'; send.className = 'btn'; send.textContent = '送る';
  form.append(input, send); box.append(list, form);
  const draw = () => {
    list.replaceChildren();
    (post.comments || []).forEach(c => {
      const li = document.createElement('li'); li.className = 'comment';
      const body = document.createElement('p'); const b = document.createElement('b'); b.textContent = ctx.nameOf(c.user_id); body.append(b, ' ', c.text);
      li.append(ctx.dotOf(c.user_id), body);
      if (c.user_id === ctx.me) {
        const x = document.createElement('button'); x.type = 'button'; x.className = 'comment-delete'; x.textContent = '×'; x.setAttribute('aria-label', '自分のコメントを消す');
        x.onclick = async () => { x.disabled = true; try { post.comments = (await houseApi('/posts/' + post.id + '/comments/' + c.id, undefined, 'DELETE')).comments; draw(); void refresh(); } catch (e) { x.disabled = false; ctx.toast(e.message); } };
        li.append(x);
      }
      list.append(li);
    });
  };
  // One id per text, so a retry after a lost response does not post twice.
  let pending = null;
  form.onsubmit = async e => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    if (pending?.text !== text) pending = { text, id: crypto.randomUUID() };
    send.disabled = true;
    try {
      post.comments = (await houseApi('/posts/' + post.id + '/comments', { request_id: pending.id, text })).comments;
      pending = null; input.value = ''; draw(); void refresh();
    } catch (err) { ctx.toast(err.message); } finally { send.disabled = false; }
  };
  draw();
  return box;
}

// ---------- settings card ----------
async function squareJpeg(file, size = 320) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('写真を読み込めませんでした')), 'image/jpeg', 0.88));
}

// getMe() → this resident's member entry (with .avatar URL) in the current house.
export function setupSocialSettings(getMe, toast) {
  const anchor = document.getElementById('sound-card'); if (!anchor) return () => {};
  const card = document.createElement('section'); card.className = 'set-card social-card'; card.id = 'social-card';
  card.innerHTML = '<h3 class="drawer-h">プロフィール写真</h3>'
    + '<div class="avatar-row"><span class="avatar-preview" aria-hidden="true"></span><label class="btn avatar-pick">写真をえらぶ<input type="file" accept="image/*" hidden></label><button class="btn avatar-clear" type="button">はずす</button></div>'
    + '<p class="push-note">タイムラインとみんなの部屋の名前の横に出るよ</p>'
    + '<div class="push-row"><h3 class="drawer-h" id="share-history-title">ほかのハウスの記録を見せる</h3><button class="push-toggle" type="button" id="share-history" aria-labelledby="share-history-title" aria-pressed="false">オフ</button></div>'
    + '<p class="push-note">オンにすると、あなたが別のハウスで残した写真・記録を、このハウスの住人もアルバムで見られるよ。コメントやリアクションは見せないよ。あなた自身はいつでも見られる。</p>';
  anchor.after(card);
  const preview = card.querySelector('.avatar-preview'), file = card.querySelector('input[type=file]'), clear = card.querySelector('.avatar-clear'), share = card.querySelector('#share-history');
  const render = () => {
    const me = getMe(); preview.replaceChildren();
    if (me?.avatar) { const img = document.createElement('img'); img.src = me.avatar; img.alt = ''; preview.append(img); }
    else preview.textContent = (me?.display_name || '').slice(0, 1);
    clear.hidden = !me?.avatar_media_id;
    const on = !!me?.share_history; share.textContent = on ? 'オン' : 'オフ'; share.setAttribute('aria-pressed', String(on));
  };
  file.onchange = async () => {
    const chosen = file.files[0]; file.value = ''; if (!chosen) return;
    try {
      const { id } = await houseApi('/media?kind=avatar', await squareJpeg(chosen));
      await houseApi('/avatar', { media_id: id }, 'PUT'); await refresh(); toast('プロフィール写真を変えたよ');
    } catch (e) { toast(e.message); }
  };
  clear.onclick = async () => { clear.disabled = true; try { await houseApi('/avatar', undefined, 'DELETE'); await refresh(); } catch (e) { toast(e.message); } finally { clear.disabled = false; } };
  share.onclick = async () => {
    share.disabled = true;
    try { await houseApi('/history-sharing', { enabled: !getMe()?.share_history }, 'PUT'); await refresh(); toast(getMe()?.share_history ? 'このハウスの住人にも見せるよ' : '自分だけに戻したよ'); }
    catch (e) { toast(e.message); } finally { share.disabled = false; }
  };
  return render;
}
