import test from 'node:test';
import assert from 'node:assert/strict';
import { letters, textLength } from '../src/text-limits.js';
test('visible characters include emoji sequences and combining marks', () => {
  for (const value of ['👨‍👩‍👧‍👦', '🇯🇵', 'か\u3099']) {
    assert.equal(textLength(value.repeat(30)), 30);
    assert.equal(letters(value.repeat(31)).slice(0,30).join(''), value.repeat(30));
  }
});
