// Price comparison from the user's own scanned receipts: latest unit price per store for a product,
// and which store is cheapest for a whole shopping list (only products with known prices count).
import { nameScore } from './shelf-price.js';
import { normalizeSearch } from './domain.js';

const round2 = (n) => Math.round(n * 100) / 100;
const storeKey = (s) => normalizeSearch(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function comparePrices(receipts = [], name) {
  if (!String(name || '').trim()) return [];
  const byStore = new Map();
  for (const r of receipts) {
    if (!r.store) continue;
    for (const item of r.items || []) {
      if (!(Number(item.price) > 0) || nameScore(name, item.name) < 0.75) continue;
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      const entry = { store: r.store, price: round2(Number(item.price) / qty), date: r.date || '', line: item.name };
      const k = storeKey(r.store);
      const old = byStore.get(k);
      if (!old || entry.date > old.date) byStore.set(k, entry);
    }
  }
  return [...byStore.values()].sort((a, b) => a.price - b.price || a.store.localeCompare(b.store));
}

export function listComparison(receipts = [], names = []) {
  const products = names.map((name) => ({ name, stores: comparePrices(receipts, name) }));
  const totals = new Map();
  for (const p of products) for (const s of p.stores) {
    const k = storeKey(s.store);
    const t = totals.get(k) || { store: s.store, total: 0, covered: 0 };
    t.total = round2(t.total + s.price); t.covered += 1; totals.set(k, t);
  }
  const stores = [...totals.values()].sort((a, b) => b.covered - a.covered || a.total - b.total);
  // Fair "cheapest overall": compare stores only on products every candidate store has.
  const common = products.filter((p) => p.stores.length >= 2);
  let best = null;
  if (common.length) {
    const sums = new Map();
    for (const p of common) for (const s of p.stores) { const k = storeKey(s.store); const v = sums.get(k) || { store: s.store, total: 0, count: 0 }; v.total = round2(v.total + s.price); v.count += 1; sums.set(k, v); }
    const full = [...sums.values()].filter((v) => v.count === Math.max(...[...sums.values()].map((x) => x.count)));
    best = full.sort((a, b) => a.total - b.total)[0] || null;
  }
  return { products, stores, best, known: products.filter((p) => p.stores.length).length };
}
