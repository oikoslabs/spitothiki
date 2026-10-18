import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, billStats, billsDue, createBill, guessBillType, parseBillCode, payBill, unpayBill, validRf } from '../src/bills.js';

const now = '2026-10-18T10:00:00.000Z';

test('bills: create validates and guesses the type', () => {
  const b = createBill({ name: 'ΔΕΗ σπίτι', amount: '84.456', due: '2026-10-25', period: 2 }, now);
  assert.deepEqual([b.type, b.amount, b.period, b.remind, b.paid], ['electricity', 84.46, 2, 3, false]);
  assert.equal(guessBillType('Ε.Υ.Δ.Α.Π.'.replace(/\./g, '')), 'water');
  assert.equal(guessBillType('Netflix'), 'subscription');
  assert.equal(guessBillType('Ενοίκιο'), 'rent');
  assert.throws(() => createBill({ name: '', amount: 1, due: '2026-10-01' }));
  assert.throws(() => createBill({ name: 'x', amount: -1, due: '2026-10-01' }));
  assert.throws(() => createBill({ name: 'x', amount: 1, due: '' }));
});

test('bills: months roll over and clamp to month end', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-15', 2), '2027-01-15');
  assert.equal(addMonths('2026-10-10', 12), '2027-10-10');
});

test('bills: paying a recurring bill creates the next one once; unpay', () => {
  const bill = createBill({ id: 'b1', name: 'ΕΥΔΑΠ', amount: 30, due: '2026-10-20', period: 4 }, now);
  const { bills, next } = payBill([bill], 'b1', '2026-10-18', now);
  assert.equal(next.due, '2027-02-20');
  assert.equal(next.paid, false);
  assert.equal(bills.find((b) => b.id === 'b1').paidAt, '2026-10-18');
  const again = payBill(unpayBill(bills, 'b1', now), 'b1', '2026-10-19', now);
  assert.equal(again.next, null);
  assert.equal(again.bills.length, 2);
  assert.equal(payBill([createBill({ id: 'o', name: 'x', amount: 1, due: '2026-10-20' }, now)], 'o', '2026-10-18').next, null);
});

test('bills: reminders use each bill window and include overdue', () => {
  const bills = [
    createBill({ id: 'a', name: 'ΔΕΗ', amount: 50, due: '2026-10-20', remind: 3 }, now),
    createBill({ id: 'b', name: 'Νερό', amount: 20, due: '2026-10-25', remind: 3 }, now),
    createBill({ id: 'c', name: 'Ενοίκιο', amount: 400, due: '2026-10-15', remind: 0 }, now),
    createBill({ id: 'd', name: 'Paid', amount: 5, due: '2026-10-19', paid: true, paidAt: '2026-10-10' }, now)
  ];
  const due = billsDue(bills, '2026-10-18');
  assert.deepEqual(due.map((b) => b.id), ['c', 'a']);
  assert.equal(due[0].overdue, true);
  assert.equal(due[1].days, 2);
});

test('bills: yearly stats by month and type', () => {
  const bills = [
    createBill({ name: 'ΔΕΗ', amount: 50, due: '2026-01-20', paid: true }, now),
    createBill({ name: 'ΔΕΗ', amount: 70, due: '2026-03-20' }, now),
    createBill({ name: 'Netflix', amount: 12.99, due: '2026-03-05' }, now),
    createBill({ name: 'ΔΕΗ', amount: 99, due: '2025-12-20' }, now)
  ];
  const s = billStats(bills, 2026);
  assert.equal(s.total, 132.99);
  assert.equal(s.months[0].paid, 50);
  assert.equal(s.months[2].total, 82.99);
  assert.deepEqual(s.byType.map((r) => r.type), ['electricity', 'subscription']);
});

test('bills: RF references, EPC QR and barcodes', () => {
  assert.equal(validRf('RF18 5390 0754 7034'), true);
  assert.equal(validRf('RF19539007547034'), false);
  assert.deepEqual(parseBillCode('RF18539007547034'), { kind: 'rf', reference: 'RF18539007547034', rfValid: true, amount: null, name: '' });
  assert.equal(parseBillCode('00012RF18539007547034').reference, 'RF18539007547034');
  const epc = parseBillCode('BCD\n002\n1\nSCT\n\nΕΤΑΙΡΕΙΑ ΥΔΡΕΥΣΗΣ\nGR1601101250000000012300695\nEUR31.40\n\nRF18539007547034\n');
  assert.deepEqual([epc.kind, epc.name, epc.amount, epc.reference, epc.rfValid], ['epc', 'ΕΤΑΙΡΕΙΑ ΥΔΡΕΥΣΗΣ', 31.4, 'RF18539007547034', true]);
  assert.equal(parseBillCode('123456789012345678').kind, 'barcode');
  assert.equal(parseBillCode(''), null);
});

test('bills: unpaid order and paid history grouping, filters, paging', async () => {
  const { unpaidBills, paidHistory } = await import('../src/bills.js');
  const mk = (id, name, type, due, paidAt = '', amount = 10) => ({ id, name, type, due, amount, paid: Boolean(paidAt), paidAt });
  const bills = [mk('u2', 'Νερό', 'water', '2026-11-05'), mk('u1', 'ΔΕΗ', 'electricity', '2026-10-01'), mk('u3', 'Ενοίκιο', 'rent', '2026-10-30'),
    ...Array.from({ length: 14 }, (_, i) => mk(`p${i}`, i % 2 ? 'ΔΕΗ' : 'Cosmote', i % 2 ? 'electricity' : 'phone', `2026-${String(10 - Math.floor(i / 2)).padStart(2, '0')}-10`, `2026-${String(10 - Math.floor(i / 2)).padStart(2, '0')}-0${(i % 2) + 1}`, 20 + i))];
  assert.deepEqual(unpaidBills(bills).map((b) => b.id), ['u1', 'u3', 'u2']);
  const h = paidHistory(bills);
  assert.equal(h.count, 14); assert.equal(h.shown, 10); assert.equal(h.more, 4);
  assert.equal(h.groups[0].month, '2026-10'); assert.deepEqual(h.groups[0].bills.map((b) => b.id), ['p1', 'p0']);
  assert.equal(h.groups[0].total, 41);
  assert.ok(h.groups.every((g, i, a) => !i || a[i - 1].month > g.month));
  assert.equal(paidHistory(bills, { limit: 20 }).more, 0);
  const dei = paidHistory(bills, { filter: 'name:δεη' });
  assert.equal(dei.matched, 7); assert.ok(dei.groups.flatMap((g) => g.bills).every((b) => b.name === 'ΔΕΗ'));
  assert.equal(paidHistory(bills, { filter: 'type:phone' }).matched, 7);
  assert.deepEqual(h.types, ['electricity', 'phone']); assert.deepEqual([...h.names].sort(), ['Cosmote', 'ΔΕΗ']);
});
