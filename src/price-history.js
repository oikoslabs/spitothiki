// Last paid prices for a product, derived from data already on the device
// (scanned receipt lines, remembered cart prices, and purchases that are not
// already covered by a receipt). No new collection and no network.
import { normalizeSearch } from './domain.js';
import { nameScore } from './shelf-price.js';

export const PRICE_HISTORY_LIMIT = 10;
export const PRICE_HISTORY_EN = {
  '📈 Τελευταίες τιμές': '📈 Latest prices',
  'Τελευταίες τιμές': 'Latest prices',
  'Τελευταίες τιμές για {name}': 'Latest prices for {name}',
  'Δεν υπάρχουν ακόμα τιμές. Σκάναρε αποδείξεις και θα εμφανιστούν εδώ.': 'No prices yet. Scan receipts and they will show up here.',
  'Χαμηλότερη τιμή: {price} στο {store}': 'Lowest price: {price} at {store}',
  'Φθηνότερα στο {store}': 'Cheapest at {store}',
  '{price} / κιλό': '{price} / kg',
};

const round2 = (n) => Math.round(n * 100) / 100;
const nameKey = (s) => normalizeSearch(s).replace(/\s+/g, ' ').trim();
const storeKey = (s) => nameKey(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function unitOf(item, qty) {
  return item.unit === 'κιλά' || item.unit === 'kg' || (qty && !Number.isInteger(qty)) ? 'κιλά' : (item.unit || 'τεμ.');
}

export function matchesProduct(query = {}, item = {}) {
  const barcode = String(query.barcode || '').trim();
  if (barcode && item.barcode && barcode === String(item.barcode)) return true;
  const q = nameKey(query.name);
  const n = nameKey(item.name);
  if (!q || !n) return false;
  if (q === n) return true;
  // Same threshold as «Σύγκριση τιμών»: accent/case-insensitive tokens, not only exact text.
  return nameScore(query.name, item.name) >= 0.75;
}

function storeName(entry, stores = []) {
  const direct = String(entry.storeName || entry.store || '').trim();
  if (direct) return direct;
  if (entry.storeId) {
    const known = stores.find((s) => s.id === entry.storeId);
    if (known?.name) return String(known.name).trim();
  }
  return '';
}

function pushEntry(out, entry) {
  if (!(Number(entry.price) > 0)) return;
  out.push({
    date: entry.date || '',
    store: entry.store || '',
    price: round2(Number(entry.price)),
    unit: entry.unit || 'τεμ.',
    qty: entry.qty || 1,
    source: entry.source,
    receiptId: entry.receiptId || '',
    sort: entry.sort || `${entry.date || ''}`,
  });
}

function sameEvent(a, b) {
  const sameDay = (a.date || '') === (b.date || '');
  const sameStore = storeKey(a.store) === storeKey(b.store);
  const samePrice = a.price === b.price && a.unit === b.unit;
  if (a.receiptId && b.receiptId && a.receiptId === b.receiptId && samePrice) return true;
  return sameDay && sameStore && samePrice;
}

export function productPriceHistory(state = {}, query = {}, limit = PRICE_HISTORY_LIMIT) {
  const receipts = state.receipts || [];
  const purchases = state.purchases || [];
  const prices = state.prices || [];
  const stores = state.stores || [];
  const cap = Math.max(0, Number(limit) || PRICE_HISTORY_LIMIT);
  const collected = [];

  for (const r of receipts) {
    for (const item of r.items || []) {
      if (!matchesProduct(query, item) || !(Number(item.price) > 0)) continue;
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      pushEntry(collected, {
        date: r.date || '',
        store: String(r.store || '').trim(),
        price: Number(item.price) / qty,
        unit: unitOf(item, qty),
        qty,
        source: 'receipt',
        receiptId: r.id || '',
        sort: `${r.date || ''}|${r.importedAt || ''}`,
      });
    }
  }

  const receiptsWithItems = new Set(receipts.filter((r) => (r.items || []).length).map((r) => r.id));
  const seenTrip = new Set();

  for (const p of prices) {
    if (!matchesProduct(query, p) || !(Number(p.price) > 0)) continue;
    const store = storeName(p, stores);
    const date = p.date || '';
    seenTrip.add(`${date}|${storeKey(store)}|${nameKey(p.name)}`);
    if (collected.some((e) => sameEvent(e, { date, store, price: round2(Number(p.price)), unit: unitOf(p, 1), receiptId: '' }))) continue;
    pushEntry(collected, {
      date,
      store,
      price: Number(p.price),
      unit: unitOf(p, 1),
      qty: 1,
      source: 'price',
      sort: `${date}|${p.updatedAt || ''}`,
    });
  }

  for (const p of purchases) {
    if (p.receiptId && receiptsWithItems.has(p.receiptId)) continue;
    if (!matchesProduct(query, p) || !(Number(p.price) > 0)) continue;
    const store = storeName(p, stores);
    const date = p.date || '';
    if (p.tripId && seenTrip.has(`${date}|${storeKey(store)}|${nameKey(p.name)}`)) continue;
    const cand = { date, store, price: round2(Number(p.price)), unit: p.unit ? unitOf(p, 1) : 'τεμ.', receiptId: p.receiptId || '' };
    if (collected.some((e) => sameEvent(e, cand))) continue;
    pushEntry(collected, {
      ...cand,
      qty: 1,
      source: 'purchase',
      sort: `${date}|${p.updatedAt || ''}`,
    });
  }

  collected.sort((a, b) => (a.sort < b.sort ? 1 : a.sort > b.sort ? -1 : a.price - b.price));
  const uniqueStores = [...new Map(collected.filter((e) => storeKey(e.store)).map((e) => [storeKey(e.store), e.store])).values()];
  const cheapest = collected.length
    ? collected.reduce((best, e) => (e.price < best.price || (e.price === best.price && e.sort > best.sort) ? e : best))
    : null;
  const entries = collected.slice(0, cap).map(({ sort, source, receiptId, ...row }) => row);
  return { entries, cheapest: cheapest ? { date: cheapest.date, store: cheapest.store, price: cheapest.price, unit: cheapest.unit } : null, stores: uniqueStores };
}
