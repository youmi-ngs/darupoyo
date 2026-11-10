const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
export const letters = value => [...segmenter.segment(value)].map(x => x.segment);
export const textLength = value => letters(value).length;
export const USER_NAME_LIMIT = 12, HOUSE_NAME_LIMIT = 20, POST_LIMIT = 30;
export function limitInput(input, limit, counter, { preserveOverflow = false } = {}) {
  input.removeAttribute('maxlength');
  let composing = false;
  const update = event => {
    if (!preserveOverflow && event?.isComposing) return;
    const parts = letters(input.value);
    if (!preserveOverflow && parts.length > limit) input.value = parts.slice(0, limit).join('');
    const length = textLength(input.value), excess = Math.max(0, length - limit);
    if (preserveOverflow) {
      input.setCustomValidity(excess ? `${limit}文字まで。あと${excess}文字減らしてね` : '');
      input.setAttribute('aria-invalid', String(excess > 0));
    }
    if (counter) counter.textContent = `${length} / ${limit}` + (preserveOverflow && excess ? `　あと${excess}文字減らしてね` : '');
  };
  if (preserveOverflow) {
    input.addEventListener('compositionstart', () => { composing = true; });
    // Normal typing cannot exceed the limit. IME/paste remains editable rather
    // than silently deleting the user's composed text.
    input.addEventListener('beforeinput', event => {
      if (composing || event.isComposing || !event.cancelable || event.inputType !== 'insertText' || !event.data || textLength(event.data) !== 1) return;
      const next = input.value.slice(0, input.selectionStart) + event.data + input.value.slice(input.selectionEnd);
      if (textLength(next) > limit) event.preventDefault();
    });
  }
  input.addEventListener('input', update);
  input.addEventListener('compositionend', event => { composing = false; update(event); });
  if (preserveOverflow) update();
  else if (counter) counter.textContent = `${textLength(input.value)} / ${limit}`;
  return { isComposing: () => composing };
}
