import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyScore, fuzzyFilter } from '../src/lib/fuzzy.js';

test('fuzzyScore returns null for non-subsequence', () => {
  assert.equal(fuzzyScore('xyz', 'join'), null);
});

test('fuzzyScore matches subsequence', () => {
  assert.notEqual(fuzzyScore('jn', 'join'), null);
  assert.notEqual(fuzzyScore('join', '/join'), null);
});

test('empty query matches everything', () => {
  assert.equal(fuzzyScore('', 'anything'), 1);
});

test('fuzzyFilter ranks better matches first', () => {
  const items = [
    { label: '/quit' },
    { label: '/query' },
    { label: '/join' },
  ];
  const r = fuzzyFilter('q', items);
  assert.ok(r.length >= 2);
  assert.ok(r[0]!.label.startsWith('/q'));
});

test('fuzzyFilter with empty query returns all in order', () => {
  const items = [{ label: 'a' }, { label: 'b' }];
  assert.deepEqual(fuzzyFilter('', items), items);
});

test('consecutive + start matches score higher than scattered', () => {
  const consec = fuzzyScore('joi', 'join')!;
  const scattered = fuzzyScore('jn', 'jolly nice nook')!;
  assert.ok(consec > scattered);
});
