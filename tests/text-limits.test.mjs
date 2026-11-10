import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedEdit, letters, textLength } from '../src/text-limits.js';
test('visible characters include emoji sequences and combining marks', () => {
  for (const value of ['👨‍👩‍👧‍👦', '🇯🇵', 'か\u3099']) {
    assert.equal(textLength(value.repeat(30)), 30);
    assert.equal(letters(value.repeat(31)).slice(0,30).join(''), value.repeat(30));
  }
});

test('hard limit retains suffixes, graphemes and legacy long values', () => {
  assert.equal(boundedEdit('abcdef', 'abcXYZdef', 6), 'abcdef');
  assert.equal(boundedEdit('abcdef', 'abXYZef', 6), 'abXYef');
  assert.equal(boundedEdit('', '👨‍👩‍👧‍👦'.repeat(31), 30), '👨‍👩‍👧‍👦'.repeat(30));
  assert.equal(boundedEdit('long name', 'long name!', 3), 'long name');
  assert.equal(boundedEdit('long name', 'long', 3), 'long');
});
