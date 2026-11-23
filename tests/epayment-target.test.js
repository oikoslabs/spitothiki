import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXTRA_KINDS, loadState, saveState } from '../src/storage.js';
import { parseMyData, parseUbl } from '../src/receipt.js';
import { dictionaries } from '../src/i18n.js';
import { applyReceiptEdit } from '../src/receipt-edit.js';
import { createManualExpense } from '../src/manual-expense.js';
import {
  EPAY_ID, EPAY_TARGET_CAP,
  EPAY_EN,
  activeEpayTarget, createEpayTarget, electronicPaymentTarget, epaymentReport,
  isElectronicPayment, isMarkedCash, monthlyNeed, monthsLeftInYear,
  paidCashWrite, paymentFromMethods,
  yearElectronicSpend
} from '../src/epayment-target.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const now = '2026-11-23T08:00:00.000Z';

test('electronicPaymentTarget: 30% of income, capped at €20.000', () => {
  assert.equal(electronicPaymentTarget(10000), 3000);
  assert.equal(electronicPaymentTarget(20000), 6000);
  assert.equal(electronicPaymentTarget(66666.67), 20000);
  assert.equal(electronicPaymentTarget(100000), EPAY_TARGET_CAP);
  assert.equal(electronicPaymentTarget(15000.5), 4500.15);
  assert.equal(electronicPaymentTarget(0), null);
  assert.equal(electronicPaymentTarget(-10), null);
  assert.equal(electronicPaymentTarget(null), null);
  assert.equal(electronicPaymentTarget('x'), null);
});

test('isElectronicPayment: known cash is out, unknown counts as card', () => {
  assert.equal(isElectronicPayment(undefined), true);
  assert.equal(isElectronicPayment({}), true);
  assert.equal(isElectronicPayment({ payment: 'card' }), true);
  assert.equal(isElectronicPayment({ payment: 'electronic' }), true);
  assert.equal(isElectronicPayment({ payment: 5 }), true);
  assert.equal(isElectronicPayment({ payment: 7 }), true);
  assert.equal(isElectronicPayment({ payment: '48' }), true);
  assert.equal(isElectronicPayment({ payment: 'cash' }), false);
  assert.equal(isElectronicPayment({ payment: 'μετρητά' }), false);
  assert.equal(isElectronicPayment({ payment: 1 }), false);
  assert.equal(isElectronicPayment({ payment: '10' }), false);
  assert.equal(isElectronicPayment({ paidCash: true }), false);
  assert.equal(isElectronicPayment({ paidCash: false }), true);
  assert.equal(isElectronicPayment({ paidCash: false, payment: 'cash' }), true);
  assert.equal(isElectronicPayment({ paidCash: true, payment: 'card' }), false);
  assert.equal(isMarkedCash({ payment: 'cash' }), true);
  assert.equal(isMarkedCash({ paidCash: false, payment: 'cash' }), false);
  assert.equal(isMarkedCash({ paidCash: true }), true);
  assert.equal(isMarkedCash({}), false);
  assert.deepEqual(paidCashWrite(true, {}), { paidCash: true });
  assert.deepEqual(paidCashWrite(false, { payment: 'card' }), {});
  assert.deepEqual(paidCashWrite(false, { payment: 'cash' }), { paidCash: false });
  assert.equal(isElectronicPayment({ paymentMethod: 3 }), false);
  assert.equal(paymentFromMethods([{ type: 7 }, { type: 1 }]), 'electronic');
  assert.equal(paymentFromMethods([{ type: 1 }, { type: 2 }]), 'cash');
  assert.equal(paymentFromMethods([]), undefined);
  const receipts = new Map([['r1', { id: 'r1', payment: 'cash' }]]);
  assert.equal(isElectronicPayment({ receiptId: 'r1', price: 10 }, receipts), false);
  assert.equal(isElectronicPayment({ receiptId: 'missing', price: 10 }, receipts), true);
});

test('yearElectronicSpend: calendar year, same expenses as month totals, cash excluded', () => {
  const state = {
    purchases: [
      { date: '2026-01-15', price: 100 },
      { date: '2026-06-02', price: 40, payment: 'cash' },
      { date: '2026-11-23', price: 25, receiptId: 'r-cash' },
      { date: '2025-12-31', price: 999 }
    ],
    extras: [
      { date: '2026-03-01', amount: 12 },
      { date: '2026-03-02', amount: 8, paidCash: true }
    ],
    transport: [
      { date: '2026-04-10', amount: 20, type: 'fuel' },
      { date: '2026-04-11', amount: 5, type: 'tolls', payment: 'card' }
    ],
    bills: [
      { type: 'rent', amount: 300, paid: true, paidAt: '2026-02-01', due: '2026-02-01' },
      { type: 'power', amount: 50, paid: true, paidAt: '2026-02-10', due: '2026-02-10', payment: 'cash' },
      { type: 'water', amount: 30, paid: false, due: '2026-11-20' }
    ],
    receipts: [{ id: 'r-cash', payment: 'cash' }]
  };
  const spend = yearElectronicSpend(state, 2026);
  // 100 + 12 + 20 + 5 + 300 = 437; cash purchase 40, receipt-linked 25, cash extra 8, cash bill 50, unpaid 30, 2025 999 excluded
  assert.equal(spend.total, 437);
  assert.equal(spend.from, '2026-01-01');
  assert.equal(spend.to, '2026-12-31');
  assert.equal(yearElectronicSpend(state, 'nope').total, 0);
});

test('months left and monthly need include the current month', () => {
  assert.equal(monthsLeftInYear('2026-11-23'), 2);
  assert.equal(monthsLeftInYear('2026-01-01'), 12);
  assert.equal(monthsLeftInYear('2026-12-31'), 1);
  assert.equal(monthsLeftInYear('bad'), 0);
  assert.equal(monthlyNeed(200, '2026-11-23'), 100);
  assert.equal(monthlyNeed(0, '2026-11-23'), 0);
  assert.equal(monthlyNeed(10, '2026-12-01'), 10);
});

test('epaymentReport and saved income record', () => {
  const rec = createEpayTarget({ income: '18.000' }, now);
  assert.equal(rec.id, EPAY_ID);
  assert.equal(rec.income, 18000);
  assert.equal(activeEpayTarget([rec]).income, 18000);
  assert.throws(() => createEpayTarget({ income: '' }, now));
  assert.throws(() => createEpayTarget({ income: '0' }, now));
  const state = { purchases: [{ date: '2026-02-01', price: 1200 }] };
  const report = epaymentReport({ income: rec.income, state, today: '2026-11-23' });
  assert.equal(report.year, '2026');
  assert.equal(report.target, 5400);
  assert.equal(report.spent, 1200);
  assert.equal(report.remaining, 4200);
  assert.equal(report.monthsLeft, 2);
  assert.equal(report.monthly, 2100);
  assert.equal(report.pct, 22);
  assert.equal(report.status, 'ok');
  const met = epaymentReport({ income: 1000, state: { purchases: [{ date: '2026-01-01', price: 400 }] }, today: '2026-06-01' });
  assert.equal(met.target, 300);
  assert.equal(met.status, 'met');
  assert.equal(met.remaining, 0);
  assert.equal(met.monthly, 0);
  const empty = epaymentReport({ state, today: '2026-11-23' });
  assert.equal(empty.status, 'need-income');
  assert.equal(empty.spent, 1200);
  assert.equal(empty.target, null);
});

test('income is stored in synced state (epayTargets), no Firestore rules change', () => {
  assert.ok(EXTRA_KINDS.includes('epayTargets'));
  const storage = new Map();
  const api = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const rec = createEpayTarget({ income: 18000 }, now);
  saveState({ items: [], shopping: [], epayTargets: [rec] }, api);
  const loaded = loadState(api);
  assert.equal(loaded.epayTargets[0].income, 18000);
});

test('myDATA type 7 (provider POS) is electronic; cash type 1 is not', () => {
  const retail = read('tests/fixtures/receipt-impact-retail.xml');
  const parsed = parseMyData(retail);
  assert.ok(parsed.paymentMethods?.length);
  assert.equal(String(parsed.paymentMethods[0].type), '7');
  assert.equal(isElectronicPayment(parsed), true);
  assert.equal(isElectronicPayment({ paymentMethods: [{ type: 1, amount: 10 }] }), false);
});

test('applyReceiptEdit and manual expense persist paidCash; unchecking removes or overrides it', () => {
  const base = {
    receipts: [{ id: 'r1', store: 'Φούρνος', date: '2026-11-23', total: 10, items: [], payment: 'card' }],
    purchases: [{ id: 'pur-r1', receiptId: 'r1', name: 'Φούρνος', price: 10, date: '2026-11-23' }]
  };
  const marked = applyReceiptEdit(base, 'r1', { store: 'Φούρνος', date: '2026-11-23', total: '10', paidCash: true }, now);
  assert.equal(marked.receipts[0].paidCash, true);
  assert.equal(isElectronicPayment(marked.receipts[0]), false);
  assert.equal(yearElectronicSpend({ ...marked, purchases: marked.purchases }, 2026).total, 0);
  const cleared = applyReceiptEdit(marked, 'r1', { store: 'Φούρνος', date: '2026-11-23', total: '10', paidCash: null }, now);
  assert.equal(cleared.receipts[0].paidCash, undefined);
  assert.equal(isElectronicPayment(cleared.receipts[0]), true);
  const cashScan = {
    receipts: [{ id: 'r2', store: 'Λαϊκή', date: '2026-11-23', total: 8, items: [], payment: 'cash' }],
    purchases: [{ id: 'pur-r2', receiptId: 'r2', name: 'Λαϊκή', price: 8, date: '2026-11-23' }]
  };
  const override = applyReceiptEdit(cashScan, 'r2', { store: 'Λαϊκή', date: '2026-11-23', total: '8', paidCash: false }, now);
  assert.equal(override.receipts[0].paidCash, false);
  assert.equal(override.receipts[0].payment, 'cash');
  assert.equal(isElectronicPayment(override.receipts[0]), true);
  assert.equal(yearElectronicSpend({ ...override, purchases: override.purchases }, 2026).total, 8);
  const kept = applyReceiptEdit(marked, 'r1', { store: 'Φούρνος Νέο', date: '2026-11-23', total: '10' }, now);
  assert.equal(kept.receipts[0].paidCash, true);
  const manual = createManualExpense({ amount: '12,50', store: 'Λαϊκή', date: '2026-11-23', paidCash: true }, '2026-11-23', now);
  assert.equal(manual.receipt.paidCash, true);
  const plain = createManualExpense({ amount: '5', date: '2026-11-23' }, '2026-11-23', now);
  assert.equal(plain.receipt.paidCash, undefined);
});

test('UI: insights card, no Pro gate, cached in the SW shell, English strings present', () => {
  const app = read('src/app.js');
  const sw = read('sw.js');
  const i18n = read('src/i18n.js');
  const css = read('styles.css');
  const mod = read('src/epayment-target.js');
  assert.match(app, /epaymentReport/);
  assert.match(app, /renderEpayCard/);
  assert.match(app, /id="epay-card"/);
  assert.match(app, /t\('Στόχος ηλεκτρονικών πληρωμών'\)/);
  assert.match(app, /όσα δεν ξέρουμε τρόπο πληρωμής μετράνε ως κάρτα/);
  assert.match(app, /μπορείς να σημειώσεις «Πληρώθηκε με μετρητά» στην απόδειξη/);
  assert.match(app, /function receiptPaidCashRow/);
  assert.match(app, /'receipt-detail-paid-cash'/);
  assert.match(app, /'re-paid-cash'/);
  assert.match(app, /'review-paid-cash'/);
  assert.match(app, /'manual-paid-cash'/);
  assert.match(app, /function saveReceiptPaidCash/);
  assert.match(app, /paidCashWrite\(Boolean\(form\.elements\.paidCash\?\.checked\)/);
  assert.match(app, /Ενδεικτικό· για ακρίβεια ρώτα τον λογιστή σου/);
  const from = app.indexOf('function renderEpayCard');
  assert.doesNotMatch(app.slice(from, from + 3500), /calendarProEnabled|isPro|proGate/);
  assert.doesNotMatch(mod, /isPro|proGate|calendarProEnabled/);
  assert.match(i18n, /EPAY_EN/);
  assert.match(sw, /src\/epayment-target\.js/);
  assert.match(sw, /CACHE_VERSION = 'v161'/);
  assert.match(css, /#epay-card/);
  for (const key of Object.keys(EPAY_EN)) {
    assert.ok(dictionaries.en[key], key);
    assert.equal(dictionaries.el[key], key);
  }
});
