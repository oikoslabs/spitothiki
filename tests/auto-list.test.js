import test from 'node:test';
import assert from 'node:assert/strict';
import { autoListAdds } from '../src/auto-list.js';

test('auto list: out of stock and expired go on the list once, tagged auto, no duplicates', () => {
  const items = [
    { id: 'a', name: 'Γάλα', quantity: 0, unit: 'λίτρα', minimum: 2 },
    { id: 'b', name: 'Γιαούρτι', quantity: 2, unit: 'τεμ.', expiry: '2026-10-20' },
    { id: 'c', name: 'Ρύζι', quantity: 1, unit: 'πακέτα' },
    { id: 'd', name: 'Φέτα', quantity: 0, unit: 'τεμ.' }
  ];
  const shopping = [{ id: 's1', name: 'φετα', quantity: 1, unit: 'τεμ.', checked: false }];
  const r = autoListAdds(items, shopping, '2026-10-21');
  assert.deepEqual(r.added.map((x) => [x.name, x.quantity, x.auto]), [['Γάλα', 2, true], ['Γιαούρτι', 1, true]]);
  assert.equal(r.shopping.length, 3);
  // second run: nothing new, even if the user deleted the auto row
  const again = autoListAdds(r.items, shopping, '2026-10-21');
  assert.equal(again.added.length, 0);
  // restocked → mark cleared → runs out again → added again
  const restocked = autoListAdds(r.items.map((i) => (i.id === 'a' ? { ...i, quantity: 1 } : i)), [], '2026-10-21');
  assert.ok(!restocked.items.find((i) => i.id === 'a').autoListed);
  const outAgain = autoListAdds(restocked.items.map((i) => (i.id === 'a' ? { ...i, quantity: 0 } : i)), [], '2026-10-21');
  assert.ok(outAgain.added.some((x) => x.name === 'Γάλα'));
});
