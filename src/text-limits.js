const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
export const letters = value => [...segmenter.segment(value)].map(x => x.segment);
export const textLength = value => letters(value).length;
export const USER_NAME_LIMIT = 12, HOUSE_NAME_LIMIT = 20, POST_LIMIT = 30;
// Preserve the text after the caret when a non-cancellable IME/paste overflows.
export function boundedEdit(previous, next, limit) {
  const before = letters(previous), after = letters(next), cap = Math.max(limit, before.length);
  if (after.length <= cap) return next;
  let left = 0, right = 0;
  while (left < before.length && left < after.length && before[left] === after[left]) left++;
  while (right < before.length - left && right < after.length - left && before[before.length - 1 - right] === after[after.length - 1 - right]) right++;
  return [...after.slice(0, left), ...after.slice(left, left + Math.max(0, cap - left - right)), ...after.slice(after.length - right)].join('');
}
export function limitInput(input, limit, counter) {
  input.removeAttribute('maxlength');
  let composing = false, previous = input.value;
  // Existing long names are preserved on open; edits may shorten but not extend them.
  input.addEventListener('focus', () => { previous = input.value; });
  const update = () => {
    const cap = Math.max(limit, textLength(previous));
    if (textLength(input.value) > cap) {
      const caret = input.selectionStart;
      input.value = boundedEdit(previous, input.value, limit);
      input.setSelectionRange(Math.min(caret, input.value.length), Math.min(caret, input.value.length));
    }
    previous = input.value;
    if (counter) counter.textContent = `${textLength(input.value)} / ${limit}`;
  };
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('beforeinput', event => {
    if (!event.cancelable || !event.inputType.startsWith('insert') || event.data == null) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const prefix = input.value.slice(0, start), suffix = input.value.slice(end);
    const cap = Math.max(limit, textLength(input.value));
    let addition = letters(event.data);
    if (textLength(prefix + event.data + suffix) <= cap) return;
    event.preventDefault();
    while (addition.length && textLength(prefix + addition.join('') + suffix) > cap) addition.pop();
    if (addition.length || start !== end) {
      input.setRangeText(addition.join(''), start, end, 'end');
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: event.inputType }));
    }
  });
  // IME and some paste events cannot be cancelled. Clamp in the input event,
  // before painting; keep submission disabled until composition has finished.
  input.addEventListener('input', update);
  input.addEventListener('compositionend', () => { composing = false; update(); });
  if (counter) counter.textContent = `${textLength(input.value)} / ${limit}`;
  return { isComposing: () => composing };
}
