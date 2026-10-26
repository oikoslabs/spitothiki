import test from 'node:test';
import assert from 'node:assert/strict';
import { createBill, payBill, incomeTaxPlan, billsDue } from '../src/bills.js';
import { BILL_PRESETS } from '../src/onboarding.js';

test('income tax plan: next instalment from today (end of month, Jul→Feb)', () => {
  assert.deepEqual(incomeTaxPlan('2026-10-26'), { due: '2026-10-31', installment: 4, installments: 8 });
  assert.deepEqual(incomeTaxPlan('2026-07-01'), { due: '2026-07-31', installment: 1, installments: 8 });
  assert.deepEqual(incomeTaxPlan('2027-02-10'), { due: '2027-02-28', installment: 8, installments: 8 });
  assert.deepEqual(incomeTaxPlan('2028-02-10'), { due: '2028-02-29', installment: 8, installments: 8 });
  assert.deepEqual(incomeTaxPlan('2027-01-05'), { due: '2027-01-31', installment: 7, installments: 8 });
  assert.deepEqual(incomeTaxPlan('2026-04-15'), { due: '2026-07-31', installment: 1, installments: 8 });
});

test('income tax: 8 instalments, end-of-month dates, stops after the last one', () => {
  let bills = [createBill({ id: 'tax', name: 'Φόρος εισοδήματος', type: 'tax', amount: 120, due: '2026-07-31', period: 1, installments: 8, installment: 1 })];
  const dues = [];
  for (let i = 0; i < 10; i++) {
    const open = bills.find((b) => !b.paid);
    if (!open) break;
    dues.push([open.installment, open.due]);
    bills = payBill(bills, open.id, open.due).bills;
  }
  assert.deepEqual(dues, [[1, '2026-07-31'], [2, '2026-08-31'], [3, '2026-09-30'], [4, '2026-10-31'], [5, '2026-11-30'], [6, '2026-12-31'], [7, '2027-01-31'], [8, '2027-02-28']]);
  assert.equal(bills.length, 8);
  assert.ok(bills.every((b) => b.paid && b.amount === 120 && b.type === 'tax'));
});

test('instalment bills remind like any other bill', () => {
  const bill = createBill({ name: 'Φόρος εισοδήματος', amount: 100, due: '2026-10-31', period: 1, installments: 8, installment: 4 });
  assert.equal(billsDue([bill], '2026-10-29').length, 1);
});

test('additive: bills without instalments keep repeating forever, no new fields', () => {
  const bill = createBill({ id: 'enfia', name: 'ΕΝΦΙΑ', type: 'tax', amount: 30, due: '2026-03-31', period: 1 });
  assert.equal('installments' in bill, false);
  assert.equal('installment' in bill, false);
  const { next } = payBill([bill], 'enfia', '2026-03-30');
  assert.equal(next.due, '2026-04-30');
  assert.equal('installment' in next, false);
  const { next: n2 } = payBill([{ ...next }], next.id, '2026-04-30');
  assert.equal(n2.due, '2026-05-30'); // unchanged old behaviour (day clamps, never re-extends)
});

test('instalments only kept on recurring bills, clamped and validated', () => {
  assert.equal('installments' in createBill({ name: 'X', amount: 1, due: '2026-01-01', period: 0, installments: 8 }), false);
  assert.equal('installments' in createBill({ name: 'X', amount: 1, due: '2026-01-01', period: 1, installments: '' }), false);
  const b = createBill({ name: 'X', amount: 1, due: '2026-01-01', period: 1, installments: 8, installment: 12 });
  assert.equal(b.installment, 8);
  assert.equal(createBill({ name: 'X', amount: 1, due: '2026-01-01', period: 1, installments: 8 }).installment, 1);
});

test('income tax is a bill preset like ΕΝΦΙΑ', () => {
  const p = BILL_PRESETS.find((x) => x.id === 'incometax');
  assert.equal(p.type, 'tax');
  assert.equal(p.period, 1);
  assert.equal(BILL_PRESETS.find((x) => x.id === 'enfia').period, 1);
});
