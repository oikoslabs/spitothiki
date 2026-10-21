import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOW_AFTER, shouldShow, scrollBehavior } from '../src/back-to-top.js';
test('back-to-top shows only after ~300px', () => {
  assert.equal(SHOW_AFTER, 300);
  assert.equal(shouldShow(0), false);
  assert.equal(shouldShow(300), false);
  assert.equal(shouldShow(301), true);
});
test('back-to-top respects reduced motion', () => {
  assert.equal(scrollBehavior(true), 'auto');
  assert.equal(scrollBehavior(false), 'smooth');
});
