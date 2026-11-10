const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
export const letters = value => [...segmenter.segment(value)].map(x => x.segment);
export const textLength = value => letters(value).length;
export const USER_NAME_LIMIT = 12, HOUSE_NAME_LIMIT = 20, POST_LIMIT = 30;
export function limitInput(input, limit, counter) {
  input.removeAttribute('maxlength');
  const update = event => {
    if (event?.isComposing) return;
    const parts = letters(input.value);
    if (parts.length > limit) input.value = parts.slice(0, limit).join('');
    if (counter) counter.textContent = `${textLength(input.value)} / ${limit}`;
  };
  input.addEventListener('input', update);
  input.addEventListener('compositionend', update);
  if (counter) counter.textContent = `${textLength(input.value)} / ${limit}`;
}
