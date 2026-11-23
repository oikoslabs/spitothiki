import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesProduct, productPriceHistory } from '../src/price-history.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const receipts = [
  { id: 'r1', store: 'Σκλαβενίτης', date: '2026-10-01', importedAt: '2026-10-01T10:00:00Z', items: [{ name: 'ΓΑΛΑ ΦΡΕΣΚΟ ΔΕΛΤΑ 1L', quantity: 1, price: 1.79, barcode: '5200123456789' }, { name: 'ΦΕΤΑ ΠΟΠ', quantity: 1, price: 4.2 }] },
  { id: 'r2', store: 'Σκλαβενίτης', date: '2026-10-15', importedAt: '2026-10-15T10:00:00Z', items: [{ name: 'ΓΑΛΑ ΦΡΕΣ ΔΕΛΤΑ 1L', quantity: 2, price: 3.9 }] },
  { id: 'r3', store: 'Lidl', date: '2026-10-10', importedAt: '2026-10-10T10:00:00Z', items: [{ name: 'Γάλα φρέσκο Δέλτα 1l', quantity: 1, price: 1.85 }] },
  { id: 'r4', store: 'ΑΒ', date: '2026-09-20', importedAt: '2026-09-20T10:00:00Z', items: [{ name: 'Ντομάτες', quantity: 0.5, unit: 'κιλά', price: 0.9 }] },
];

test('empty query or no data: empty history', () => {
  assert.deepEqual(productPriceHistory({}, { name: 'Γάλα' }), { entries: [], cheapest: null, stores: [] });
  assert.deepEqual(productPriceHistory({ receipts }, { name: '' }), { entries: [], cheapest: null, stores: [] });
  assert.equal(productPriceHistory({ receipts }, { name: 'Κιμάς' }).entries.length, 0);
});

test('matches accent, case and extra spaces; barcode wins', () => {
  assert.equal(matchesProduct({ name: '  Γάλα   Φρέσκο  Δέλτα 1L ' }, { name: 'ΓΑΛΑ ΦΡΕΣΚΟ ΔΕΛΤΑ 1L' }), true);
  assert.equal(matchesProduct({ name: 'Γάλα φρέσκο Δέλτα' }, { name: 'ΓΑΛΑ ΦΡΕΣΚΟ ΔΕΛΤΑ 1L' }), true);
  assert.equal(matchesProduct({ name: 'Ψωμί', barcode: '5200123456789' }, { name: 'Άλλο', barcode: '5200123456789' }), true);
  assert.equal(matchesProduct({ name: 'Ψωμί' }, { name: 'Γάλα φρέσκο Δέλτα' }), false);
});

test('newest first, unit price, last 10, lowest price and cheapest store', () => {
  const r = productPriceHistory({ receipts }, { name: 'Γάλα φρέσκο Δέλτα' });
  assert.deepEqual(r.entries.map((e) => [e.date, e.store, e.price]), [
    ['2026-10-15', 'Σκλαβενίτης', 1.95],
    ['2026-10-10', 'Lidl', 1.85],
    ['2026-10-01', 'Σκλαβενίτης', 1.79],
  ]);
  assert.deepEqual(r.cheapest, { date: '2026-10-01', store: 'Σκλαβενίτης', price: 1.79, unit: 'τεμ.' });
  assert.deepEqual(r.stores.sort(), ['Lidl', 'Σκλαβενίτης']);
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: `x${i}`, store: 'ΑΒ', date: `2026-11-${String(i + 1).padStart(2, '0')}`, items: [{ name: 'Ψωμί', quantity: 1, price: 2 + i / 100 }],
  }));
  assert.equal(productPriceHistory({ receipts: many }, { name: 'Ψωμί' }, 10).entries.length, 10);
  assert.equal(productPriceHistory({ receipts: many }, { name: 'Ψωμί' }, 10).entries[0].date, '2026-11-12');
});

test('per-kg unit price from quantity', () => {
  const r = productPriceHistory({ receipts }, { name: 'Ντομάτες' });
  assert.equal(r.entries[0].price, 1.8);
  assert.equal(r.entries[0].unit, 'κιλά');
  assert.equal(r.cheapest.price, 1.8);
});

test('does not double-count receipt lines and their purchases', () => {
  const purchases = [
    { id: 'pur-r1-0', name: 'ΓΑΛΑ ΦΡΕΣΚΟ ΔΕΛΤΑ 1L', price: 1.79, date: '2026-10-01', receiptId: 'r1', storeName: 'Σκλαβενίτης' },
    { id: 'pur-r2-0', name: 'ΓΑΛΑ ΦΡΕΣ ΔΕΛΤΑ 1L', price: 3.9, date: '2026-10-15', receiptId: 'r2', storeName: 'Σκλαβενίτης' },
  ];
  const r = productPriceHistory({ receipts, purchases }, { name: 'Γάλα φρέσκο Δέλτα' });
  assert.equal(r.entries.length, 3);
  assert.equal(r.entries[0].price, 1.95);
});

test('uses purchases and cart prices when there is no receipt line', () => {
  const r = productPriceHistory({
    receipts: [{ id: 't1', store: 'ΑΒ', date: '2026-10-08', items: [] }],
    purchases: [
      { id: 'pur-shop', name: 'Καφές', price: 4.2, date: '2026-10-20', storeName: 'ΑΒ' },
      { id: 'pur-t1', name: 'Καφές', price: 3.9, date: '2026-10-08', receiptId: 't1', storeName: 'ΑΒ' },
    ],
    prices: [
      { id: 'price-1', name: 'Καφές', price: 4.5, unit: 'τεμ.', date: '2026-09-01', storeName: 'Σκλαβενίτης', updatedAt: '2026-09-01T12:00:00Z' },
    ],
    stores: [],
  }, { name: 'καφες' });
  assert.deepEqual(r.entries.map((e) => [e.date, e.store, e.price]), [
    ['2026-10-20', 'ΑΒ', 4.2],
    ['2026-10-08', 'ΑΒ', 3.9],
    ['2026-09-01', 'Σκλαβενίτης', 4.5],
  ]);
  assert.equal(r.cheapest.store, 'ΑΒ');
  assert.equal(r.cheapest.price, 3.9);
  assert.equal(r.stores.length, 2);
});

test('skips a trip purchase when the cart already remembered the unit price', () => {
  const r = productPriceHistory({
    prices: [{ name: 'Ντομάτες', price: 1.8, unit: 'κιλά', date: '2026-10-05', storeName: 'Lidl', updatedAt: '2026-10-05T18:00:00Z' }],
    purchases: [{ name: 'Ντομάτες', price: 3.6, date: '2026-10-05', storeName: 'Lidl', tripId: 'trip-1' }],
  }, { name: 'Ντομάτες' });
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].price, 1.8);
  assert.equal(r.entries[0].unit, 'κιλά');
});

test('UI hooks: pantry, shopping list, receipt line, dialog, no Pro gate, cached in the SW shell', () => {
  const app = read('src/app.js');
  const html = read('index.html');
  const sw = read('sw.js');
  const i18n = read('src/i18n.js');
  const hist = read('src/price-history.js');
  assert.match(app, /productPriceHistory/);
  assert.match(app, /data-action="price-history"/);
  assert.match(app, /function openPriceHistory/);
  assert.match(app, /t\('Τελευταίες τιμές'\)/);
  assert.match(app, /t\('Φθηνότερα στο \{store\}'/);
  const from = app.indexOf('function openPriceHistory');
  assert.doesNotMatch(app.slice(from, from + 2000), /calendarProEnabled|isPro|proGate/);
  assert.match(app.slice(app.indexOf('function renderInventoryCard'), app.indexOf('function renderInventoryCard') + 2500), /data-action="price-history"/);
  assert.match(app.slice(app.indexOf('function renderShoppingRow'), app.indexOf('function renderShoppingRow') + 1500), /data-action="price-history"/);
  assert.match(app.slice(app.indexOf('function openReceiptDetails'), app.indexOf('function openReceiptDetails') + 2500), /data-action="price-history"/);
  assert.match(html, /id="price-history-dialog"/);
  assert.match(i18n, /PRICE_HISTORY_EN/);
  assert.match(sw, /src\/price-history\.js/);
  assert.match(sw, /CACHE_VERSION = 'v160'/);
  assert.doesNotMatch(hist, /isPro|proGate|calendarProEnabled/);
});
