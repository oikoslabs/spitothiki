import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAutoPay, addMonths, billStats, billsDue, createBill, guessBillType, parseBillCode, payBill, unpaidBills, unpayBill, validRf } from '../src/bills.js';

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
  // v1.6.11: only the paid one counts; the two unpaid March bills are shown apart.
  assert.equal(s.total, 50);
  assert.equal(s.months[0].paid, 50);
  assert.equal(s.months[2].total, 0);
  assert.deepEqual(s.pending, { count: 2, total: 82.99 });
  assert.deepEqual(s.byType.map((r) => r.type), ['electricity']);
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

test('bills: direct debit — not "to pay", no warnings, auto-paid on the due date, remembered per provider', async () => {
  const { applyAutoPay, autoPayFor, scheduledDebits } = await import('../src/bills.js');
  const dd = createBill({ id: 'b1', name: 'ΔΕΗ', amount: 50, due: '2026-10-20', period: 1, autoPay: true });
  const manual = createBill({ id: 'b2', name: 'ΕΥΔΑΠ', amount: 30, due: '2026-10-21' });
  assert.equal(dd.autoPay, true); assert.equal(manual.autoPay, false);
  const bills = [dd, manual];
  assert.deepEqual(unpaidBills(bills).map((b) => b.id), ['b2']);
  assert.deepEqual(billsDue(bills, '2026-10-25').map((b) => b.id), ['b2']); // overdue manual only
  assert.deepEqual(scheduledDebits(bills).map((b) => b.id), ['b1']);
  // before the due date nothing changes
  assert.deepEqual(applyAutoPay(bills, '2026-10-19').paid, []);
  // on/after the due date: paid at the due date, next month's instance created (still direct debit)
  const after = applyAutoPay(bills, '2026-10-20').bills;
  const paid = after.find((b) => b.id === 'b1');
  assert.deepEqual([paid.paid, paid.paidAt], [true, '2026-10-20']);
  const next = after.find((b) => b.due === '2026-11-20');
  assert.deepEqual([next.paid, next.autoPay], [false, true]);
  // long absence: catches up month by month, once each
  const caught = applyAutoPay(bills, '2027-01-25');
  assert.deepEqual(caught.paid.length, 4);
  assert.equal(caught.bills.filter((b) => b.name === 'ΔΕΗ' && !b.paid).length, 1);
  // counted once in the yearly stats
  assert.equal(billStats(caught.bills, 2026).months[9].total, 50); // v1.6.11: the unpaid ΕΥΔΑΠ (30) is not counted
  assert.equal(autoPayFor(after, 'δεη'), true);
  assert.equal(autoPayFor(after, 'ΕΥΔΑΠ'), false);
  assert.equal(autoPayFor(after, 'Cosmote'), false);
});

test('v1.6.11/12: unpaid bills never count; paid ones count once, in their due month', async () => {
  const { billsMonthSplit, billSpentDate } = await import('../src/bills.js');
  const deh = createBill({ id: 'd1', name: 'ΔΕΗ', amount: 60, due: '2026-11-05', period: 1 }, now);
  const water = createBill({ id: 'w1', name: 'ΕΥΔΑΠ', amount: 25, due: '2026-10-30' }, now);
  let bills = [deh, water];
  // Not due yet / not paid: nothing in the October or November totals, both listed as pending in their due month.
  assert.deepEqual(billsMonthSplit(bills, '2026-10'), { rent: 0, other: 0, pending: 25, pendingCount: 1 });
  assert.deepEqual(billsMonthSplit(bills, '2026-11'), { rent: 0, other: 0, pending: 60, pendingCount: 1 });
  assert.equal(billStats(bills, 2026).total, 0);
  // Paid early, on 25/10: still counts in November (its due month), not October; the new December one is pending.
  bills = payBill(bills, 'd1', '2026-10-25', now).bills;
  assert.equal(billSpentDate(bills.find((b) => b.id === 'd1')), '2026-11-05');
  assert.deepEqual(billsMonthSplit(bills, '2026-10'), { rent: 0, other: 0, pending: 25, pendingCount: 1 });
  assert.deepEqual(billsMonthSplit(bills, '2026-11'), { rent: 0, other: 60, pending: 0, pendingCount: 0 });
  assert.deepEqual(billsMonthSplit(bills, '2026-12'), { rent: 0, other: 0, pending: 60, pendingCount: 1 });
  const s = billStats(bills, 2026); assert.equal(s.total, 60); assert.equal(s.months[10].total, 60); assert.equal(s.months[9].total, 0); assert.deepEqual(s.pending, { count: 2, total: 85 });
  // Undo the payment: back out of the totals. No double counting across months.
  bills = unpayBill(bills, 'd1', now);
  assert.equal(billStats(bills, 2026).total, 0);
  assert.equal(billSpentDate({ paid: true, due: '2026-09-01' }), '2026-09-01');
  assert.equal(billSpentDate({ paid: false, due: '2026-09-01' }), '');
});

test('v1.6.12: new user enters and ticks past months\' bills in October → each counts in its own month', async () => {
  const { billsMonthSplit, paidHistory } = await import('../src/bills.js');
  const now2 = '2026-10-20T10:00:00.000Z';
  // Like a real household that started on 17–23/10: bills from July–October, all ticked «Πληρώθηκε» in October.
  let bills = [
    createBill({ id: 'r7', name: 'Ενοίκιο', type: 'rent', amount: 450, due: '2026-07-01' }, now2), createBill({ id: 'r8', name: 'Ενοίκιο', type: 'rent', amount: 450, due: '2026-08-01' }, now2),
    createBill({ id: 'r9', name: 'Ενοίκιο', type: 'rent', amount: 450, due: '2026-09-01' }, now2), createBill({ id: 'r10', name: 'Ενοίκιο', type: 'rent', amount: 450, due: '2026-10-01', period: 1 }, now2),
    createBill({ id: 'e8', name: 'ΔΕΗ', amount: 98.4, due: '2026-08-20' }, now2), createBill({ id: 'e10', name: 'ΔΕΗ', amount: 87.15, due: '2026-10-20', period: 2 }, now2),
    createBill({ id: 'w9', name: 'ΕΥΔΑΠ', amount: 31.2, due: '2026-09-15' }, now2), createBill({ id: 'c10', name: 'Cosmote', amount: 45.9, due: '2026-10-10', period: 1, autoPay: true }, now2),
    createBill({ id: 'n10', name: 'Netflix', amount: 62.93, due: '2026-10-28' }, now2)
  ];
  for (const id of ['r7', 'r8', 'r9', 'r10', 'e8', 'e10', 'w9']) bills = payBill(bills, id, id === 'r7' ? '2026-10-17' : '2026-10-21', now2).bills;
  bills = applyAutoPay(bills, '2026-10-25', now2).bills;
  const oct = billsMonthSplit(bills, '2026-10');
  assert.deepEqual(oct, { rent: 450, other: 133.05, pending: 62.93, pendingCount: 1 }); // rent + ΔΕΗ + Cosmote; Netflix apart
  assert.deepEqual(billsMonthSplit(bills, '2026-09'), { rent: 450, other: 31.2, pending: 0, pendingCount: 0 });
  assert.deepEqual(billsMonthSplit(bills, '2026-08'), { rent: 450, other: 98.4, pending: 0, pendingCount: 0 });
  assert.deepEqual(billsMonthSplit(bills, '2026-07'), { rent: 450, other: 0, pending: 0, pendingCount: 0 });
  // Auto-created next bills (rent 1/11, ΔΕΗ 20/12, Cosmote 10/11) are unpaid: not in November's total, only pending.
  assert.deepEqual(billsMonthSplit(bills, '2026-11'), { rent: 0, other: 0, pending: 495.9, pendingCount: 2 });
  const s = billStats(bills, 2026);
  assert.deepEqual(s.months.slice(6, 10).map((m) => m.total), [450, 548.4, 481.2, 583.05]);
  assert.equal(s.total, 2062.65); // = sum of the months, nothing counted twice
  // The paid history groups the same way (October header = October total).
  const h = paidHistory(bills, { limit: 50 });
  assert.equal(h.groups.find((g) => g.month === '2026-10').total, 583.05);
  assert.equal(h.groups.find((g) => g.month === '2026-08').total, 548.4);
});

test('v1.6.12: the month breakdown lists exactly the bills that make up the figure', async () => {
  const { billsMonthList, billsMonthSplit } = await import('../src/bills.js');
  const bills = [
    { id: 'a', name: 'ΔΕΗ', type: 'electricity', amount: 149, due: '2026-10-20', paid: true, paidAt: '2026-10-21' },
    { id: 'b', name: 'ΕΥΔΑΠ', type: 'water', amount: 105.41, due: '2026-10-15', paid: true, paidAt: '2026-10-21' },
    { id: 'c', name: 'ΔΕΗ', type: 'electricity', amount: 640, due: '2026-08-20', paid: true, paidAt: '2026-10-22' }, // past bill ticked in October
    { id: 'd', name: 'Internet', type: 'phone', amount: 62.93, due: '2026-10-28', paid: false, paidAt: '' }
  ];
  const list = billsMonthList(bills, '2026-10');
  assert.deepEqual(list.map((b) => b.id), ['a', 'b']);
  const split = billsMonthSplit(bills, '2026-10');
  assert.equal(Math.round(list.reduce((s, b) => s + b.amount, 0) * 100) / 100, split.rent + split.other);
  assert.equal(split.other, 254.41);
  assert.deepEqual(billsMonthList(bills, '2026-08').map((b) => b.id), ['c']);
});
