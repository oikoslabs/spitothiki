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

import { nearEnd } from '../src/back-to-top.js';
test('dialog ⬆ hides near the end of a dialog, where its buttons are', () => {
  assert.equal(nearEnd(900, 1500, 600), true);
  assert.equal(nearEnd(400, 1500, 600), false);
  assert.equal(nearEnd(800, 1500, 600, 50), false);
});
