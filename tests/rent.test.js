import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { billsMonthSplit, payBill, createBill } from '../src/bills.js';

const bills = [
  { id: 'r1', type: 'rent', amount: 450, due: '2026-10-01', paid: true, paidAt: '2026-10-01' },
  { id: 'e1', type: 'electricity', amount: 80.5, due: '2026-10-12', paid: true, paidAt: '2026-10-12' },
  { id: 'r0', type: 'rent', amount: 430, due: '2026-09-01', paid: true, paidAt: '2026-09-01' },
  { id: 'w1', type: 'water', amount: 20, due: '2026-11-03' },
];
test('rent is split from other bills; total unchanged', () => {
  assert.deepEqual(billsMonthSplit(bills, '2026-10'), { rent: 450, other: 80.5, pending: 0, pendingCount: 0 });
  assert.deepEqual(billsMonthSplit(bills, '2026-09'), { rent: 430, other: 0, pending: 0, pendingCount: 0 });
  assert.deepEqual(billsMonthSplit([], '2026-10'), { rent: 0, other: 0, pending: 0, pendingCount: 0 });
});
test('monthly rent repeats once on pay with same name/amount/type/day', () => {
  const rent = createBill({ name: 'Ενοίκιο', type: 'rent', amount: 450, due: '2026-10-05', period: 1 });
  const a = payBill([rent], rent.id, '2026-10-04');
  assert.equal(a.next.due, '2026-11-05'); assert.equal(a.next.amount, 450); assert.equal(a.next.type, 'rent'); assert.equal(a.next.name, 'Ενοίκιο');
  const again = payBill(a.bills, rent.id, '2026-10-04');
  assert.equal(again.bills.length, 2);
});
test('month totals show a separate rent row', () => {
  const src = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(src, /🏠 \$\{t\('Ενοίκιο \/ κοινόχρηστα'\)\}/);
  assert.match(src, /billsMonthSplit\(state\.bills/);
});
test('rent quick action follows bill', () => {
  const src = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'bill'[^\n]*\n  \{ id: 'rent', icon: '🏠'/);
  assert.match(src, /id === 'rent'\) openRentBill\(\)/);
});
