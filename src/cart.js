// In-store cart ("Καλάθι"): a shopping trip with a running total, remembered prices per store, and a finish step
// that ticks the shopping list, fills the pantry and records spending once (a later receipt can replace it).
import { normalizeSearch, normalizeUnit, receiveShoppingItem } from './domain.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;
const norm = (s) => normalizeSearch(String(s || '')).trim();
const rid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function createTrip({ store = null, storeName = '', budget = '' } = {}, now = new Date().toISOString()) {
  const name = (store?.name || storeName || '').trim().slice(0, 40);
  const limit = Number(budget);
  return { id: rid('trip'), storeId: store?.id || '', storeName: name, budget: Number.isFinite(limit) && limit > 0 ? round2(limit) : 0, status: 'active', startedAt: now, date: now.slice(0, 10), items: [], total: 0, updatedAt: now };
}

export const lineTotal = (item) => round2(Number(item.price || 0) * Number(item.qty || 0));
export const cartTotal = (trip) => round2((trip?.items || []).reduce((sum, item) => sum + lineTotal(item), 0));
const withTotal = (trip, now) => ({ ...trip, total: cartTotal(trip), updatedAt: now });

// Same barcode (or same shopping-list row / name for items without barcode) adds up instead of duplicating.
export function addCartItem(trip, input, now = new Date().toISOString()) {
  const unit = normalizeUnit(input.unit) === 'κιλά' ? 'κιλά' : 'τεμ.';
  const qty = Math.max(0, round3(input.qty ?? 1)) || (unit === 'κιλά' ? 0 : 1);
  const price = Math.max(0, round2(input.price || 0));
  const name = String(input.name || '').trim().slice(0, 80);
  if (!name) throw new Error('Γράψε όνομα προϊόντος.');
  const same = trip.items.find((item) => (input.barcode && item.barcode === input.barcode) || (input.shoppingId && item.shoppingId === input.shoppingId) || (!input.barcode && !item.barcode && norm(item.name) === norm(name)));
  const items = !input.noMerge && same && unit === 'τεμ.' && same.unit === 'τεμ.'
    ? trip.items.map((item) => (item === same ? { ...item, qty: round3(item.qty + qty), price: price || item.price, shoppingId: item.shoppingId || input.shoppingId || '' } : item))
    : [...trip.items, { key: rid('ci'), barcode: input.barcode || '', name, unit, qty, price, category: input.category || 'Άλλο', shoppingId: input.shoppingId || '' }];
  return withTotal({ ...trip, items }, now);
}

export function updateCartItem(trip, key, changes, now = new Date().toISOString()) {
  const items = trip.items.map((item) => (item.key === key ? { ...item, ...changes, qty: Math.max(0, round3(changes.qty ?? item.qty)), price: Math.max(0, round2(changes.price ?? item.price)) } : item))
    .filter((item) => item.qty > 0 || item.unit === 'κιλά');
  return withTotal({ ...trip, items }, now);
}
export const removeCartItem = (trip, key, now = new Date().toISOString()) => withTotal({ ...trip, items: trip.items.filter((item) => item.key !== key) }, now);

export const budgetState = (trip) => (!trip.budget ? 'none' : trip.total > trip.budget ? 'over' : trip.total >= trip.budget * 0.9 ? 'near' : 'ok');

// ---------- Price memory (synced kind "prices") ----------
const storeKey = (trip) => (trip.storeId || norm(trip.storeName).replace(/[^\p{L}\p{N}]+/gu, '-') || 'any');
const productKey = (item) => item.barcode || `n-${norm(item.name).replace(/[^\p{L}\p{N}]+/gu, '-')}`;
export const priceId = (trip, item) => `price-${storeKey(trip)}-${productKey(item)}`;

// Last price for a product: this store first, otherwise the newest from any store (flagged).
export function lastPrice(prices = [], trip, item) {
  const key = productKey(item);
  const here = prices.find((p) => p.id === priceId(trip, item));
  if (here) return { price: here.price, unit: here.unit, sameStore: true, date: here.date };
  const other = prices.filter((p) => p.product === key).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  return other ? { price: other.price, unit: other.unit, sameStore: false, store: other.storeName, date: other.date } : null;
}

export function rememberPrices(prices = [], trip, now = new Date().toISOString()) {
  const byId = new Map(prices.map((p) => [p.id, p]));
  for (const item of trip.items) {
    if (!(item.price > 0)) continue;
    const id = priceId(trip, item);
    byId.set(id, { id, product: productKey(item), barcode: item.barcode || '', name: item.name, storeId: trip.storeId || '', storeName: trip.storeName || '', price: item.price, unit: item.unit, date: (trip.date || now.slice(0, 10)), updatedAt: now });
  }
  return [...byId.values()];
}

// Shopping-list rows not yet in the cart (linked by id, or same name).
export function remainingShopping(shopping = [], trip) {
  const ids = new Set(trip.items.map((item) => item.shoppingId).filter(Boolean));
  const names = new Set(trip.items.map((item) => norm(item.name)));
  return shopping.filter((row) => !row.checked && !ids.has(row.id) && !names.has(norm(row.name)));
}

// Finish: tick linked/matching list rows (which also adds them to the pantry), add the rest to the pantry,
// record one purchase per line (tagged with the trip), remember prices, close the trip.
export function finishTrip(data, trip, now = new Date().toISOString()) {
  let items = [...(data.items || [])];
  let shopping = [...(data.shopping || [])];
  const purchases = [...(data.purchases || [])];
  let bought = 0;
  trip.items.forEach((line, index) => {
    const row = shopping.find((r) => !r.checked && (r.id === line.shoppingId || norm(r.name) === norm(line.name)));
    const result = receiveShoppingItem(items, row ? { ...row, quantity: line.qty, unit: line.unit } : { id: '', name: line.name, quantity: line.qty, unit: line.unit }, now);
    items = result.items;
    if (line.barcode && result.row.itemId) items = items.map((item) => (item.id === result.row.itemId && !item.barcode ? { ...item, barcode: line.barcode } : item));
    if (row) { shopping = shopping.map((r) => (r.id === row.id ? { ...result.row, quantity: row.quantity, unit: row.unit } : r)); bought += 1; }
    const total = lineTotal(line);
    if (total > 0) purchases.push({ id: `pur-${trip.id}-${index}`, rowId: row?.id || '', name: line.name, category: line.category || 'Άλλο', price: total, date: trip.date, tripId: trip.id, ...(trip.storeName ? { storeName: trip.storeName } : {}), ...(trip.storeId ? { storeId: trip.storeId } : {}), updatedAt: now });
  });
  const done = { ...trip, status: 'done', finishedAt: now, total: cartTotal(trip), updatedAt: now };
  return { items, shopping, purchases, prices: rememberPrices(data.prices || [], trip, now), trip: done, bought };
}

// A finished trip that a receipt probably belongs to: same day (or next), not linked yet, store name compatible.
export function tripForReceipt(trips = [], receipt) {
  if (!receipt?.date) return null;
  const store = norm(receipt.issuerName);
  return trips.filter((trip) => trip.status === 'done' && !trip.receiptId && (trip.date === receipt.date || trip.date === dayBefore(receipt.date)))
    .filter((trip) => !store || !trip.storeName || norm(trip.storeName).split(/[^\p{L}\p{N}]+/u).some((word) => word.length >= 4 && store.includes(word)))
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))[0] || null;
}
function dayBefore(key) { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
