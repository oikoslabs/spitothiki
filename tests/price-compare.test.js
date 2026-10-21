import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePrices, listComparison } from '../src/price-compare.js';

const receipts = [
  { store: 'Σκλαβενίτης', date: '2026-10-01', items: [{ name: 'ΓΑΛΑ ΦΡΕΣΚΟ ΔΕΛΤΑ 1L', quantity: 1, price: 1.79 }, { name: 'ΦΕΤΑ ΠΟΠ', quantity: 1, price: 4.2 }] },
  { store: 'Σκλαβενίτης', date: '2026-10-15', items: [{ name: 'ΓΑΛΑ ΦΡΕΣ ΔΕΛΤΑ 1L', quantity: 2, price: 3.9 }] },
  { store: 'Lidl', date: '2026-10-10', items: [{ name: 'Γάλα φρέσκο Δέλτα 1l', quantity: 1, price: 1.85 }, { name: 'Φέτα ΠΟΠ', quantity: 1, price: 3.99 }] },
  { store: 'ΑΒ', date: '2026-10-12', items: [{ name: 'ΨΩΜΙ ΤΟΣΤ', quantity: 1, price: 2.1 }] }
];

test('compare: latest price per store, cheapest first', () => {
  const r = comparePrices(receipts, 'Γάλα φρέσκο Δέλτα');
  assert.deepEqual(r.map((x) => [x.store, x.price]), [['Lidl', 1.85], ['Σκλαβενίτης', 1.95]]);
  assert.deepEqual(comparePrices(receipts, 'Κιμάς'), []);
});

test('list comparison: cheapest store on shared products', () => {
  const r = listComparison(receipts, ['Γάλα φρέσκο Δέλτα', 'Φέτα ΠΟΠ', 'Ψωμί τοστ', 'Μπανάνες']);
  assert.equal(r.known, 3);
  assert.equal(r.best.store, 'Lidl');
  assert.equal(r.best.total, 5.84);
});
