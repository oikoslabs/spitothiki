import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BAR, moveBar, normalizeBar, parseBar, toggleBar } from '../src/bar.js';
test('default bar unchanged; bad/empty values fall back to it', () => {
  assert.deepEqual(DEFAULT_BAR, ['scan', 'list', 'extra', 'transport', 'all']);
  assert.deepEqual(parseBar(null), DEFAULT_BAR); assert.deepEqual(parseBar('[]'), DEFAULT_BAR); assert.deepEqual(parseBar('{x'), DEFAULT_BAR);
  assert.deepEqual(normalizeBar(['scan', 'scan', 'bogus', 'view:chores']), ['scan', 'view:chores']);
  assert.equal(normalizeBar(['scan', 'list', 'extra', 'transport', 'all', 'view:chores']).length, 5);
});
test('add up to 5, remove (never the last one), move up/down', () => {
  assert.deepEqual(toggleBar(DEFAULT_BAR, 'view:chores'), DEFAULT_BAR);
  const four = toggleBar(DEFAULT_BAR, 'extra'); assert.deepEqual(four, ['scan', 'list', 'transport', 'all']);
  assert.deepEqual(toggleBar(four, 'view:chores'), ['scan', 'list', 'transport', 'all', 'view:chores']);
  assert.deepEqual(toggleBar(['scan'], 'scan'), ['scan']);
  assert.deepEqual(moveBar(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']); assert.deepEqual(moveBar(['a', 'b'], 0, -1), ['a', 'b']);
});
