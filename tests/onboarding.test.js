import test from 'node:test';
import assert from 'node:assert/strict';
import { BILL_PRESETS, hasData, pendingPresets, presetsFrom, shouldOnboard } from '../src/onboarding.js';

test('first run: only for new users without data and without the done flag', () => {
  assert.equal(shouldOnboard({ items: [], shopping: [] }, null), true);
  assert.equal(shouldOnboard({ items: [], shopping: [] }, '1'), false);
  assert.equal(shouldOnboard({ items: [{ id: 'a' }] }, null), false); // existing user with data: never
  assert.equal(shouldOnboard({ bills: [{ id: 'b' }] }, null), false);
  assert.equal(hasData({}), false);
});

test('first run: chosen bills become shortcuts until a bill of that provider exists', () => {
  assert.deepEqual(presetsFrom(['dei', 'water', 'nope']).map((p) => p.name), ['ΔΕΗ', 'ΕΥΔΑΠ']);
  assert.deepEqual(pendingPresets(['dei', 'water', 'road'], [{ name: 'δεη' }, { name: 'Road tax', presetId: 'road' }]).map((p) => p.id), ['water']);
  assert.equal(BILL_PRESETS.length, 9);
  assert.ok(BILL_PRESETS.every((p) => p.name && p.type && Number.isInteger(p.period)));
});
