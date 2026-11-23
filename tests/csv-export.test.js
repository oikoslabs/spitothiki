import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries } from '../src/i18n.js';
import {
  CSV_EXPORT_EN, CSV_HEADERS, buildExpenseCsv, csvField, csvNumber, expensePeriod,
  expenseRows, expenseSource, rowsToCsv
} from '../src/csv-export.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('csvField escapes quotes, semicolons and newlines', () => {
  assert.equal(csvField('απλό'), 'απλό');
  assert.equal(csvField('α;β'), '"α;β"');
  assert.equal(csvField('λέει "γεια"'), '"λέει ""γεια"""');
  assert.equal(csvField('γραμμή\nδύο'), '"γραμμή\nδύο"');
  assert.equal(csvField(''), '');
  assert.equal(csvField(null), '');
});

test('csvNumber uses a comma decimal; amounts keep two digits', () => {
  assert.equal(csvNumber(12.5, { decimals: 2 }), '12,50');
  assert.equal(csvNumber(1), '1');
  assert.equal(csvNumber(1.5), '1,5');
  assert.equal(csvNumber(0.5), '0,5');
  assert.equal(csvNumber(''), '');
  assert.equal(csvNumber(undefined), '');
});

test('rowsToCsv starts with UTF-8 BOM and uses ; separators', () => {
  const csv = rowsToCsv([{
    date: '2026-11-23', type: 'Αγορές', store: 'ΑΒ', item: 'Γάλα', quantity: 2,
    unit: 'τεμ.', amount: 3.2, productType: 'Γαλακτοκομικά', expenseCategory: 'Αγορές',
    cash: 'Όχι', source: 'QR'
  }]);
  assert.equal(csv.startsWith('\uFEFF'), true);
  assert.match(csv, /\uFEFFΗμερομηνία;Τύπος;Κατάστημα;Προϊόν;Ποσότητα;Μονάδα;Ποσό €;Είδος προϊόντος;Κατηγορία εξόδου;Μετρητά;Πηγή\r\n/);
  assert.match(csv, /2026-11-23;Αγορές;ΑΒ;Γάλα;2;τεμ.;3,20;Γαλακτοκομικά;Αγορές;Όχι;QR/);
  assert.deepEqual(CSV_HEADERS.length, 11);
});

test('expensePeriod filenames and inclusive bounds', () => {
  assert.deepEqual(expensePeriod('month', '2026-11-23'), {
    from: '2026-11-01', to: '2026-11-30', filename: 'spitothiki-exoda-2026-11.csv'
  });
  assert.deepEqual(expensePeriod('year', '2026-11-23'), {
    from: '2026-01-01', to: '2026-12-31', filename: 'spitothiki-exoda-2026.csv'
  });
  assert.equal(expensePeriod('all', '2026-11-23').filename, 'spitothiki-exoda-ola.csv');
  assert.equal(expensePeriod('month', 'bad'), null);
});

test('expenseSource: QR, photo, or typed by hand', () => {
  assert.equal(expenseSource({ format: 'myDATA' }), 'QR');
  assert.equal(expenseSource({ format: 'EN16931' }), 'QR');
  assert.equal(expenseSource({ format: 'AADE' }), 'QR');
  assert.equal(expenseSource({ format: 'transport' }), 'QR');
  assert.equal(expenseSource({ format: 'manual', url: 'https://example.test/r' }), 'QR');
  assert.equal(expenseSource({ format: 'photo' }), 'φωτογραφία');
  assert.equal(expenseSource({ format: 'manual' }), 'χειροκίνητα');
  assert.equal(expenseSource(null), 'χειροκίνητα');
});

const cats = [{ id: 'ec-fuel', name: 'Πετρέλαιο', emoji: '🛢️', createdAt: '2026-01-01' }];

test('one row per expense line: items, total-only, bills, transport, extras', () => {
  const state = {
    expenseCategories: cats,
    receipts: [
      { id: 'r1', store: 'Σκλαβενίτης', date: '2026-11-10', format: 'myDATA', items: [
        { name: 'Γάλα', quantity: 2, unit: 'τεμ.', price: 3.2 },
        { name: 'Ψωμί', quantity: 1, unit: 'τεμ.', price: 1.1 }
      ] },
      { id: 'r2', store: 'Πρατήριο', date: '2026-11-12', format: 'AADE', items: [], paidCash: true },
      { id: 'r3', store: 'Αττική Οδός', date: '2026-11-13', format: 'transport', items: [] }
    ],
    purchases: [
      { id: 'pur-r1-0', name: 'Γάλα', category: 'Γαλακτοκομικά', price: 3.2, date: '2026-11-10', receiptId: 'r1', storeName: 'Σκλαβενίτης' },
      { id: 'pur-r1-1', name: 'Ψωμί', category: 'Ξηρά τρόφιμα', price: 1.1, date: '2026-11-10', receiptId: 'r1', storeName: 'Σκλαβενίτης' },
      { id: 'pur-r2', name: 'Πρατήριο', category: 'Άλλο', price: 85, date: '2026-11-12', receiptId: 'r2', storeName: 'Πρατήριο', expenseCategory: 'ec-fuel' },
      { id: 'pur-shop', name: 'Καφές', category: 'Ροφήματα', price: 4.2, date: '2026-10-20', storeName: 'ΑΒ' }
    ],
    bills: [
      { id: 'b1', name: 'ΔΕΗ', type: 'electricity', amount: 60, due: '2026-11-15', paid: true, paidAt: '2026-11-16' },
      { id: 'b2', name: 'ΕΥΔΑΠ', type: 'water', amount: 20, due: '2026-12-01', paid: false }
    ],
    transport: [
      { id: 't1', type: 'tolls', amount: 2.8, date: '2026-11-13', note: 'Αττική Οδός', receiptId: 'r3' },
      { id: 't2', type: 'fuel', amount: 50, date: '2026-11-14', liters: 30.5, vehicle: 'ΙΧ' }
    ],
    extras: [
      { id: 'x1', category: 'Καφές', amount: 3.5, qty: 1, date: '2026-11-11', note: '' }
    ]
  };
  const month = expenseRows(state, '2026-11-01', '2026-11-30');
  assert.deepEqual(month.map((r) => [r.date, r.type, r.item || r.store, r.amount, r.source, r.cash]), [
    ['2026-11-10', 'Αγορές', 'Γάλα', 3.2, 'QR', 'Όχι'],
    ['2026-11-10', 'Αγορές', 'Ψωμί', 1.1, 'QR', 'Όχι'],
    ['2026-11-11', 'Μικροέξοδο', 'Καφές', 3.5, 'χειροκίνητα', 'Όχι'],
    ['2026-11-12', 'Αγορές', 'Πρατήριο', 85, 'QR', 'Ναι'],
    ['2026-11-13', 'Μετακίνηση', 'Διόδια', 2.8, 'QR', 'Όχι'],
    ['2026-11-14', 'Μετακίνηση', 'Βενζίνη / καύσιμα', 50, 'χειροκίνητα', 'Όχι'],
    ['2026-11-16', 'Λογαριασμός', 'ΔΕΗ', 60, 'χειροκίνητα', 'Όχι']
  ]);
  const milk = month.find((r) => r.item === 'Γάλα');
  assert.equal(milk.quantity, 2);
  assert.equal(milk.unit, 'τεμ.');
  assert.equal(milk.productType, 'Γαλακτοκομικά');
  const oil = month.find((r) => r.date === '2026-11-12');
  assert.equal(oil.item, ''); // total-only receipt
  assert.equal(oil.store, 'Πρατήριο');
  assert.equal(oil.expenseCategory, '🛢️ Πετρέλαιο');
  const fuel = month.find((r) => r.item === 'Βενζίνη / καύσιμα');
  assert.equal(fuel.quantity, 30.5);
  assert.equal(fuel.unit, 'λίτρα');
  assert.equal(csvNumber(fuel.quantity), '30,5');
  const bill = month.find((r) => r.type === 'Λογαριασμός');
  assert.equal(bill.expenseCategory, 'Ρεύμα');
  assert.equal(month.some((r) => r.store === 'ΑΒ'), false); // October purchase out of range
  const year = buildExpenseCsv(state, { period: 'year', today: '2026-11-23' });
  assert.equal(year.filename, 'spitothiki-exoda-2026.csv');
  assert.equal(year.count, 8); // November rows + October coffee
  assert.equal(year.csv.charCodeAt(0), 0xFEFF);
  assert.match(year.csv, /30,5/);
  assert.match(year.csv, /3,20/);
  assert.match(year.csv, /"🛢️ Πετρέλαιο"|🛢️ Πετρέλαιο/);
});

test('quoted field with a semicolon survives a round-trip of the CSV text', () => {
  const csv = rowsToCsv([{
    date: '2026-11-01', type: 'Αγορές', store: 'ΑΒ; Κηφισιά', item: 'Λάδι "έξτρα"',
    quantity: 1, unit: 'τεμ.', amount: 8, productType: '', expenseCategory: 'Αγορές',
    cash: 'Όχι', source: 'χειροκίνητα'
  }]);
  const body = csv.replace(/^\uFEFF/, '').trim().split('\r\n')[1];
  assert.equal(body.includes('"ΑΒ; Κηφισιά"'), true);
  assert.equal(body.includes('"Λάδι ""έξτρα"""'), true);
});

test('module stays local: no upload, fetch or analytics', () => {
  const src = read('src/csv-export.js');
  assert.doesNotMatch(src, /\bfetch\s*\(/);
  assert.doesNotMatch(src, /XMLHttpRequest|navigator\.sendBeacon|analytics/i);
});

test('UI: Settings + insights buttons, download/share, SW cache, English strings', () => {
  const app = read('src/app.js');
  const sw = read('sw.js');
  const i18n = read('src/i18n.js');
  assert.match(app, /buildExpenseCsv/);
  assert.match(app, /data-action="export-expenses"/);
  assert.match(app, /id="settings-export-csv"/);
  assert.match(app, /id="insights-export-csv"/);
  assert.match(app, /navigator\.canShare/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /text\/csv/);
  assert.match(i18n, /CSV_EXPORT_EN/);
  assert.match(sw, /src\/csv-export\.js/);
  assert.match(sw, /CACHE_VERSION = 'v160'/);
  for (const key of Object.keys(CSV_EXPORT_EN)) {
    assert.ok(dictionaries.en[key], key);
    assert.equal(dictionaries.el[key], key);
  }
});
