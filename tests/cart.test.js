import test from 'node:test';
import assert from 'node:assert/strict';
import { addCartItem, budgetState, cartTotal, createTrip, finishTrip, lastPrice, remainingShopping, rememberPrices, removeCartItem, tripForReceipt, updateCartItem } from '../src/cart.js';

const now = '2026-10-18T09:00:00.000Z';
const store = { id: 'store-ab', name: 'ΑΒ Βασιλόπουλος' };

test('cart: add, merge same barcode, weigh, update, remove, totals and budget', () => {
  let trip = createTrip({ store, budget: '20' }, now);
  trip = addCartItem(trip, { barcode: '5201', name: 'Γάλα', price: 1.89 }, now);
  trip = addCartItem(trip, { barcode: '5201', name: 'Γάλα', price: 1.89 }, now);
  trip = addCartItem(trip, { name: 'Ντομάτες', unit: 'κιλά', qty: 1.25, price: 2.4 }, now);
  assert.equal(trip.items.length, 2);
  assert.equal(trip.items[0].qty, 2);
  assert.equal(trip.total, 6.78);
  assert.equal(budgetState(trip), 'ok');
  trip = updateCartItem(trip, trip.items[0].key, { qty: 10 }, now);
  assert.equal(trip.total, 21.9);
  assert.equal(budgetState(trip), 'over');
  trip = updateCartItem(trip, trip.items[0].key, { qty: 0 }, now);
  assert.equal(trip.items.length, 1);
  trip = removeCartItem(trip, trip.items[0].key, now);
  assert.equal(cartTotal(trip), 0);
  assert.throws(() => addCartItem(trip, { name: ' ' }, now));
});

test('cart: price memory per store with fallback to other stores', () => {
  let trip = createTrip({ store }, now);
  trip = addCartItem(trip, { barcode: '5201', name: 'Γάλα', price: 1.89 }, now);
  trip = addCartItem(trip, { name: 'Ψωμί χωριάτικο', price: 1.2 }, now);
  const prices = rememberPrices([], trip, now);
  assert.equal(prices.length, 2);
  assert.deepEqual(lastPrice(prices, createTrip({ store }, now), { barcode: '5201' }).price, 1.89);
  assert.equal(lastPrice(prices, createTrip({ store }, now), { name: 'ψωμί  Χωριάτικο' }).price, 1.2);
  const other = lastPrice(prices, createTrip({ storeName: 'Lidl' }, now), { barcode: '5201' });
  assert.deepEqual([other.price, other.sameStore, other.store], [1.89, false, 'ΑΒ Βασιλόπουλος']);
  assert.equal(lastPrice(prices, trip, { barcode: '999' }), null);
});

test('cart: finish ticks the list, fills the pantry, records spending; remaining list', () => {
  const shopping = [{ id: 's1', name: 'Γάλα', quantity: 1, unit: 'τεμ.', checked: false }, { id: 's2', name: 'Ρύζι', quantity: 1, unit: 'πακέτα', checked: false }];
  const items = [{ id: 'i1', name: 'Γάλα', quantity: 1, unit: 'τεμ.', minimum: 0, category: 'Γαλακτοκομικά' }];
  let trip = createTrip({ store }, now);
  trip = addCartItem(trip, { barcode: '5201', name: 'Γάλα', price: 1.89, shoppingId: 's1' }, now);
  trip = addCartItem(trip, { barcode: '5202', name: 'Φέτα', price: 4.5, category: 'Γαλακτοκομικά' }, now);
  assert.deepEqual(remainingShopping(shopping, trip).map((r) => r.id), ['s2']);
  const out = finishTrip({ items, shopping, purchases: [], prices: [] }, trip, now);
  assert.equal(out.shopping.find((r) => r.id === 's1').checked, true);
  assert.equal(out.shopping.find((r) => r.id === 's2').checked, false);
  assert.equal(out.items.find((i) => i.id === 'i1').quantity, 2);
  assert.equal(out.items.find((i) => i.name === 'Φέτα').barcode, '5202');
  assert.deepEqual(out.purchases.map((p) => [p.price, p.tripId, p.storeName]), [[1.89, trip.id, 'ΑΒ Βασιλόπουλος'], [4.5, trip.id, 'ΑΒ Βασιλόπουλος']]);
  assert.equal(out.trip.status, 'done');
  assert.equal(out.prices.length, 2);
  assert.equal(out.bought, 1);
});

test('cart: receipt is matched to the same-day finished trip of a compatible store', () => {
  const trip = { id: 't1', status: 'done', date: '2026-10-18', storeName: 'ΑΒ Βασιλόπουλος', finishedAt: now };
  assert.equal(tripForReceipt([trip], { date: '2026-10-18', issuerName: 'ΑΛΦΑ-ΒΗΤΑ ΒΑΣΙΛΟΠΟΥΛΟΣ ΑΕ' }).id, 't1');
  assert.equal(tripForReceipt([trip], { date: '2026-10-19', issuerName: '' }).id, 't1');
  assert.equal(tripForReceipt([{ ...trip, storeName: 'Σκλαβενίτης' }], { date: '2026-10-18', issuerName: 'ΕΛΛΗΝΙΚΕΣ ΥΠΕΡΑΓΟΡΕΣ ΣΚΛΑΒΕΝΙΤΗΣ' }).id, 't1');
  assert.equal(tripForReceipt([{ ...trip, storeName: 'Lidl' }], { date: '2026-10-18', issuerName: 'ΕΛΛΗΝΙΚΕΣ ΥΠΕΡΑΓΟΡΕΣ ΣΚΛΑΒΕΝΙΤΗΣ' }), null);
  assert.equal(tripForReceipt([{ ...trip, receiptId: 'r' }], { date: '2026-10-18' }), null);
  assert.equal(tripForReceipt([trip], { date: '2026-10-25' }), null);
});
