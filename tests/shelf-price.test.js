import test from 'node:test';
import assert from 'node:assert/strict';
import { extractShelfPrice, lastReceiptPrice, nameScore } from '../src/shelf-price.js';

test('shelf label: product price, not the per-kilo price', () => {
  const r = extractShelfPrice('ΓΙΑΟΥΡΤΙ ΣΤΡΑΓΓΙΣΤΟ 2% 500γρ\nΤιμή κιλού: 3,78 €\n1,89€');
  assert.equal(r.best, 1.89);
  assert.ok(!r.candidates.some((c) => c.price === 3.78));
});

test('shelf label: unit word on the line above the number is ignored', () => {
  const r = extractShelfPrice('ΜΑΚΑΡΟΝΙΑ Νο10 500g\nΤΙΜΗ ΑΝΑ ΚΙΛΟ\n2,58\n1,29 €');
  assert.equal(r.best, 1.29);
});

test('shelf label: €/kg, /lt and "ανά" variants', () => {
  assert.equal(extractShelfPrice('ΓΑΛΑ ΦΡΕΣΚΟ 1L\n1,45 €/lt\n1,45').best, 1.45);
  assert.equal(extractShelfPrice('ΤΥΡΙ ΚΑΣΕΡΙ\n12,90 €/kg\n4,52 €').best, 4.52);
  assert.equal(extractShelfPrice('ΑΠΟΡΡΥΠΑΝΤΙΚΟ\n0,21 ανά μεζούρα\n8,40€').best, 8.4);
});

test('shelf label: big split digits and OCR dot', () => {
  assert.equal(extractShelfPrice('ΚΑΦΕΣ ΦΙΛΤΡΟΥ 250γρ\n3 49€\nτιμή κιλού 13,96').best, 3.49);
  assert.equal(extractShelfPrice('ΧΥΜΟΣ ΠΟΡΤΟΚΑΛΙ\n2.15').best, 2.15);
});

test('shelf label: old price is skipped, ambiguity reported', () => {
  assert.equal(extractShelfPrice('ΣΟΚΟΛΑΤΑ\nΑρχική τιμή 2,10€\n1,59€').best, 1.59);
  const r = extractShelfPrice('ΡΥΖΙ 1,99 μπλα 2,49');
  assert.equal(r.ambiguous, true);
  assert.equal(r.candidates.length, 2);
  assert.equal(extractShelfPrice('ΧΩΡΙΣ ΤΙΜΗ 5201234567890').best, null);
});

test('last receipt price: fuzzy name match, newest wins, unit price', () => {
  const receipts = [
    { date: '2026-10-01', store: 'Μασούτης', items: [{ name: 'ΓΑΛΑ ΦΡΕΣΚΟ ΔΕΛΤΑ 1L', quantity: 1, unit: 'τεμ.', price: 1.79 }] },
    { date: '2026-10-15', store: 'Σκλαβενίτης', items: [{ name: 'ΓΑΛΑ ΦΡΕΣ ΔΕΛΤΑ 1L', quantity: 2, unit: 'τεμ.', price: 3.78 }, { name: 'ΝΤΟΜΑΤΕΣ', quantity: 1.25, unit: 'κιλά', price: 2.5 }] }
  ];
  const m = lastReceiptPrice(receipts, { name: 'Γάλα φρέσκο Δέλτα 1l' });
  assert.deepEqual([m.price, m.store, m.date], [1.89, 'Σκλαβενίτης', '2026-10-15']);
  assert.equal(lastReceiptPrice(receipts, { name: 'ντομάτες' }).unit, 'κιλά');
  assert.equal(lastReceiptPrice(receipts, { name: 'Γάλα σοκολατούχο' }), null);
  assert.equal(lastReceiptPrice(receipts, { name: '' }), null);
  assert.ok(nameScore('Φέτα ΠΟΠ', 'ΦΕΤΑ ΠΟΠ ΔΩΔΩΝΗ') >= 0.99);
});
