// Edit the words of, or delete, your own post. Shown under your own chore records,
// うちらのなう and だるぽよ in the enlarged views. Only the text can be edited; the server
// writes the gal's line again from the new words.
import { houseApi } from './api.js';
import { setBusy } from './busy.js';

const LIMIT = 30;
const count = text => [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].length;

// base: '/posts', '/moments' or '/darupoyo'. onEdited(record) / onDeleted() update the screen.
export function ownerActions({ record, base, onEdited, onDeleted, toast }) {
  const box = document.createElement('div'); box.className = 'post-owner';
  const path = base + '/' + record.id;
  const row = document.createElement('div'); row.className = 'post-owner-actions';
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'post-owner-edit'; edit.textContent = 'ひとことを編集';
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'post-owner-delete'; remove.textContent = '削除';
  row.append(edit, remove); box.append(row);

  edit.onclick = () => {
    const form = document.createElement('form'); form.className = 'post-owner-form';
    const label = document.createElement('label'); label.textContent = 'ひとこと（30文字まで）';
    const input = document.createElement('input'); input.value = record.caption || ''; input.maxLength = 60; input.autocomplete = 'off';
    const counter = document.createElement('small'); counter.className = 'post-owner-count';
    const hint = () => { const n = count(input.value.trim()); counter.textContent = n + ' / ' + LIMIT; counter.classList.toggle('is-over', n > LIMIT); save.disabled = n > LIMIT; };
    const buttons = document.createElement('div'); buttons.className = 'post-owner-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'やめる';
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'is-main'; save.textContent = '保存';
    buttons.append(cancel, save); label.append(input); form.append(label, counter, buttons);
    row.hidden = true; box.append(form); input.oninput = hint; hint(); input.focus();
    cancel.onclick = () => { form.remove(); row.hidden = false; };
    form.onsubmit = async e => {
      e.preventDefault();
      setBusy(save, true, 'ほぞんちゅ〜'); cancel.disabled = input.disabled = true;
      try {
        const updated = await houseApi(path, { caption: input.value.trim() }, 'PATCH');
        Object.assign(record, updated); form.remove(); row.hidden = false;
        onEdited(updated); toast('ひとことを変えたよ');
      } catch (err) { toast(err.message); setBusy(save, false); cancel.disabled = input.disabled = false; hint(); }
    };
  };

  // Two taps: 削除 → ほんとに消す？
  remove.onclick = () => {
    const ask = document.createElement('div'); ask.className = 'post-owner-confirm'; ask.setAttribute('role', 'group'); ask.setAttribute('aria-label', '削除の確認');
    const text = document.createElement('p'); text.textContent = 'この投稿を消す？写真や声も消えて、もとに戻せないよ';
    const buttons = document.createElement('div'); buttons.className = 'post-owner-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'やめる';
    const yes = document.createElement('button'); yes.type = 'button'; yes.className = 'is-danger'; yes.textContent = '消す';
    buttons.append(cancel, yes); ask.append(text, buttons); row.hidden = true; box.append(ask); cancel.focus();
    cancel.onclick = () => { ask.remove(); row.hidden = false; };
    yes.onclick = async () => {
      setBusy(yes, true, 'けしてるよ…'); cancel.disabled = true;
      try { await houseApi(path, undefined, 'DELETE'); toast('投稿を消したよ'); onDeleted(); }
      catch (err) { toast(err.message); setBusy(yes, false); cancel.disabled = false; }
    };
  };
  return box;
}
