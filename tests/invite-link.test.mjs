import test from 'node:test';
import assert from 'node:assert/strict';
import { captureInvite, clearInvite, inviteLink } from '../src/invite-link.js';
const store = () => { const values = new Map(); return {getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k)}; };
test('new and legacy invite links survive a reload without URL parameters', () => {
  for (const separator of ['?', '#']) {
    const storage = store();
    assert.equal(captureInvite('https://example.test/' + separator + 'invite=ABCD-EFGH', storage), 'ABCD-EFGH');
    assert.equal(captureInvite('https://example.test/', storage), 'ABCD-EFGH');
    assert.equal(captureInvite('https://example.test/?invite=NEW', storage), 'NEW');
    assert.equal(clearInvite('https://example.test/?invite=NEW&keep=1#house=h&post=p', storage), '/?keep=1#house=h&post=p');
    assert.equal(captureInvite('https://example.test/', storage), null);
  }
});
test('blocked browser storage still allows the current link', () => {
  const blocked = {getItem() {throw Error();}, setItem() {throw Error();}, removeItem() {throw Error();}};
  assert.equal(captureInvite('https://example.test/#invite=CODE', blocked), 'CODE');
  assert.equal(captureInvite('https://example.test/', blocked), null);
  assert.equal(clearInvite('https://example.test/#invite=CODE&post=p', blocked), '/#post=p');
});
test('shared links carry the invite in the query and exclude unrelated targets', () => {
  assert.equal(inviteLink('https://example.test/?old=1#house=h&post=p', 'ABCD-EFGH'), 'https://example.test/?invite=ABCD-EFGH');
});
