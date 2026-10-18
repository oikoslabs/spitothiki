import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTransportRecurring, classifyReceipt, consumptionFor, createTransport, createTransportRecurring, fuelStats, pricePerLiter, transportMonth } from '../src/transport.js';
import { makeLine } from '../src/receipt.js';
import { parseReceiptText } from '../src/receipt-photo.js';

const now = '2026-10-18T10:00:00.000Z';

test('transport: create validates and keeps fuel-only fields for fuel', () => {
  const e = createTransport({ type: 'fuel', amount: '50,456', date: '2026-10-01', liters: '28,5', odometer: '10000', vehicle: 'v1' }, now);
  assert.deepEqual([e.amount, e.liters, e.odometer, e.vehicle], [50.46, 28.5, 10000, 'v1']);
  assert.equal(pricePerLiter(e), 1.771);
  const toll = createTransport({ type: 'tolls', amount: 2.8, date: '2026-10-02', liters: 5 }, now);
  assert.equal(toll.liters, undefined);
  assert.equal(createTransport({ type: 'nope', amount: 1, date: '2026-10-02' }).type, 'other');
  assert.throws(() => createTransport({ type: 'taxi', amount: 0, date: '2026-10-02' }));
  assert.throws(() => createTransport({ type: 'taxi', amount: 5, date: '' }));
});

test('transport: consumption l/100km from consecutive odometer readings per vehicle', () => {
  const list = [
    createTransport({ id: 'a', type: 'fuel', amount: 60, date: '2026-09-01', liters: 40, odometer: 10000 }),
    createTransport({ id: 'b', type: 'fuel', amount: 45, date: '2026-09-15', liters: 30, odometer: 10500 }),
    createTransport({ id: 'c', type: 'fuel', amount: 30, date: '2026-10-01', liters: 20, odometer: 10750 }),
    createTransport({ id: 'x', type: 'fuel', amount: 30, date: '2026-10-01', liters: 20, odometer: 99999, vehicle: 'moto' })
  ];
  const s = fuelStats(list);
  assert.deepEqual(s.rows.map((r) => r.l100), [6, 8]);
  assert.equal(s.average, 6.7);
  assert.equal(consumptionFor(list, list[1]).km, 500);
  assert.equal(consumptionFor(list, list[0]), null);
  assert.equal(fuelStats(list, 'moto').rows.length, 0);
});

test('transport: monthly totals per category', () => {
  const list = [
    createTransport({ type: 'fuel', amount: 50, date: '2026-10-01' }), createTransport({ type: 'tolls', amount: 2.4, date: '2026-10-03' }),
    createTransport({ type: 'tolls', amount: 2.4, date: '2026-10-04' }), createTransport({ type: 'taxi', amount: 9, date: '2026-09-30' })
  ];
  const m = transportMonth(list, '2026-10');
  assert.equal(m.total, 54.8); assert.equal(m.count, 3);
  assert.deepEqual(m.byType, [{ type: 'fuel', total: 50 }, { type: 'tolls', total: 4.8 }]);
});

test('transport: monthly recurring (transit pass) catches up once, idempotent', () => {
  const rule = createTransportRecurring({ id: 'r1', type: 'transit', amount: 27, start: '2026-08-05', note: 'Κάρτα' }, now);
  const r1 = applyTransportRecurring([rule], [], '2026-10-18', now);
  assert.deepEqual(r1.added.map((e) => e.date), ['2026-08-05', '2026-09-05', '2026-10-05']);
  assert.equal(r1.rules[0].lastMonth, '2026-10');
  const r2 = applyTransportRecurring(r1.rules, r1.entries, '2026-10-30', now);
  assert.equal(r2.changed, false);
  const late = createTransportRecurring({ id: 'r2', type: 'transit', amount: 27, start: '2026-10-25' }, now);
  assert.equal(applyTransportRecurring([late], [], '2026-10-18', now).added.length, 0);
  // Another device already created this month's entry: no duplicate.
  const pre = applyTransportRecurring([rule], [{ id: 'r1_2026-08', type: 'transit', amount: 27, date: '2026-08-05' }], '2026-08-20', now);
  assert.equal(pre.added.length, 0);
});

test('receipts: fuel e-receipt (myDATA lines) is detected with liters and €/l', () => {
  const receipt = { issuerName: 'ΠΡΑΤΗΡΙΟ ΚΑΥΣΙΜΩΝ ΑΕ', date: '2026-10-10', total: 40, lines: [makeLine({ name: 'ΑΜΟΛΥΒΔΗ 95', quantity: 22.599, unit: 'λίτρα', price: 40 })] };
  assert.deepEqual(classifyReceipt(receipt), { type: 'fuel', amount: 40, date: '2026-10-10', note: 'ΠΡΑΤΗΡΙΟ ΚΑΥΣΙΜΩΝ ΑΕ', liters: 22.599, ppl: 1.77 });
});

test('receipts: fuel photo text with €/l, toll receipts, groceries ignored', () => {
  const text = 'SHELL ΠΡΑΤΗΡΙΟ\n15/10/2026\nDIESEL 25,00 L x 1,659 €/L\nΣΥΝΟΛΟ 41,48';
  const fuel = classifyReceipt({ issuerName: '', date: '2026-10-15', total: 41.48, lines: [] }, text);
  assert.deepEqual([fuel.type, fuel.liters, fuel.ppl], ['fuel', 25, 1.659]);
  const toll = classifyReceipt({ issuerName: 'ΑΤΤΙΚΗ ΟΔΟΣ Α.Ε.', date: '2026-10-11', total: 2.8, lines: [] }, 'ΑΤΤΙΚΗ ΟΔΟΣ\nΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ ΚΑΝΤΖΑ\nΚΑΤ. 2 2,80');
  assert.deepEqual([toll.type, toll.amount], ['tolls', 2.8]);
  assert.equal(classifyReceipt({ issuerName: 'Εγνατία Οδός', total: 3.1, lines: [] }).type, 'tolls');
  const groceries = parseReceiptText('ΣΚΛΑΒΕΝΙΤΗΣ\nΓΑΛΑ 1,89 13%\nΨΩΜΙ 1,20 13%\nΣΥΝΟΛΟ 3,09');
  assert.equal(classifyReceipt(groceries, 'ΣΚΛΑΒΕΝΙΤΗΣ ΓΑΛΑ ΨΩΜΙ'), null);
});
