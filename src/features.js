// Pure helpers for the newer features (recurring items, voice add, expiry snapshot, ...).
import { createShoppingItem, normalizeSearch, normalizeUnit } from './domain.js';

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function addDays(dateKey, days) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// ---------- Recurring items ----------
export const RECURRING_INTERVALS = [7, 14, 30];

export function createRecurring(input = {}, today, now = new Date().toISOString()) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Χρειάζεται όνομα προϊόντος.');
  const quantity = Number(input.quantity ?? 1);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Η ποσότητα πρέπει να είναι μεγαλύτερη από μηδέν.');
  const everyDays = Math.round(Number(input.everyDays));
  if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 365) throw new Error('Διάλεξε κάθε πόσες ημέρες.');
  return { id: String(input.id || makeId('rec')), name, quantity, unit: normalizeUnit(input.unit), category: String(input.category || ''),
    everyDays, nextDue: /^\d{4}-\d{2}-\d{2}$/.test(String(input.nextDue || '')) ? input.nextDue : today, updatedAt: now };
}

// Adds due recurring items to the shopping list (unless already pending) and moves their next date forward.
// Shopping row ids are deterministic per due date, so two synced devices never add the same occurrence twice.
export function applyRecurring(recurring = [], shopping = [], today, now = new Date().toISOString()) {
  let changed = false;
  const nextShopping = [...shopping];
  const added = [];
  const nextRecurring = recurring.map((rule) => {
    if (!rule?.nextDue || rule.nextDue > today) return rule;
    changed = true;
    const pending = nextShopping.some((row) => !row.checked && (row.recurringId === rule.id || normalizeSearch(row.name) === normalizeSearch(rule.name)));
    const rowId = `rec-${rule.id}-${rule.nextDue}`;
    if (!pending && !nextShopping.some((row) => row.id === rowId)) {
      const row = { ...createShoppingItem({ name: rule.name, quantity: rule.quantity, unit: rule.unit }, now), id: rowId, recurringId: rule.id, ...(rule.category ? { category: rule.category } : {}) };
      nextShopping.push(row);
      added.push(row);
    }
    let nextDue = rule.nextDue;
    while (nextDue <= today) nextDue = addDays(nextDue, rule.everyDays);
    return { ...rule, nextDue, updatedAt: now };
  });
  return { recurring: nextRecurring, shopping: nextShopping, added, changed };
}

// ---------- Voice add ----------
const NUMBER_WORDS = {
  'ενα': 1, 'ένα': 1, 'μια': 1, 'μία': 1, 'ενας': 1, 'ένας': 1, 'δυο': 2, 'δύο': 2, 'τρια': 3, 'τρία': 3, 'τρεις': 3, 'τεσσερα': 4, 'τέσσερα': 4, 'τέσσερις': 4, 'πεντε': 5, 'πέντε': 5,
  'εξι': 6, 'έξι': 6, 'δεκα': 10, 'δέκα': 10, 'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'ten': 10, 'some': null
};

export function parseVoiceItems(text) {
  return String(text || '')
    .split(/\s*[,;]\s*|\.(?:\s+|$)|\s+(?:και|κι|and|plus|also|επίσης)\s+/i)
    .map((part) => part.trim().replace(/^(?:and|και|κι)\s+/i, ''))
    .filter(Boolean)
    .map((part) => {
      let quantity = 1;
      let name = part;
      const digits = part.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
      const word = part.match(/^(\S+)\s+(.+)$/);
      if (digits) { quantity = Number(digits[1].replace(',', '.')); name = digits[2]; }
      else if (word && Object.hasOwn(NUMBER_WORDS, word[1].toLowerCase())) { quantity = NUMBER_WORDS[word[1].toLowerCase()] ?? 1; name = word[2]; }
      name = name.trim();
      return { name: name.charAt(0).toLocaleUpperCase() + name.slice(1), quantity: Math.min(99999, quantity > 0 ? quantity : 1) };
    })
    .filter((item) => item.name.length > 0 && item.name.length <= 80);
}

// ---------- Expiry snapshot for the service worker (periodic background sync) ----------
export function expirySnapshot(items = [], { days, lang, lastNotified, titleOne, titleMany, more }) {
  return {
    days, lang, lastNotified: lastNotified || '', titleOne, titleMany, more,
    items: items.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item.expiry || ''))).map((item) => ({ name: item.name, expiry: item.expiry }))
  };
}

export function dueFromSnapshot(snapshot, today) {
  const limit = addDays(today, Number(snapshot?.days ?? 3));
  return (snapshot?.items || []).filter((item) => item.expiry >= today && item.expiry <= limit).sort((a, b) => a.expiry.localeCompare(b.expiry));
}

// ---------- Stores & aisles ----------
export const CATEGORIES = ['Φρούτα & λαχανικά', 'Κρέας & ψάρι', 'Γαλακτοκομικά', 'Ξηρά τρόφιμα', 'Κατεψυγμένα', 'Ροφήματα', 'Καθαριότητα', 'Άλλο'];

export function createStore(input = {}, now = new Date().toISOString()) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Γράψε όνομα καταστήματος.');
  if (name.length > 40) throw new Error('Το όνομα είναι πολύ μεγάλο.');
  return { id: String(input.id || makeId('store')), name, order: storeOrder(input.order), updatedAt: now };
}

// Full walking order: saved order first (known categories only), then any missing categories.
export function storeOrder(order = []) {
  const known = (Array.isArray(order) ? order : []).filter((c, i, a) => CATEGORIES.includes(c) && a.indexOf(c) === i);
  return [...known, ...CATEGORIES.filter((c) => !known.includes(c))];
}

export function moveCategory(store, category, direction, now = new Date().toISOString()) {
  const order = storeOrder(store.order);
  const from = order.indexOf(category);
  const to = from + (direction < 0 ? -1 : 1);
  if (from < 0 || to < 0 || to >= order.length) return store;
  [order[from], order[to]] = [order[to], order[from]];
  return { ...store, order, updatedAt: now };
}

// Category of a shopping row: its own, the linked pantry item's, a same-name pantry item's, else 'Άλλο'.
export function rowCategory(row, items = []) {
  if (row.category && CATEGORIES.includes(row.category)) return row.category;
  const linked = row.itemId && items.find((item) => item.id === row.itemId);
  const same = linked || items.find((item) => normalizeSearch(item.name).trim() === normalizeSearch(row.name).trim());
  return same?.category && CATEGORIES.includes(same.category) ? same.category : 'Άλλο';
}

// Groups rows in the store's walking order: [{ category, aisle, rows }].
export function groupByStore(rows, store, items = []) {
  const order = storeOrder(store?.order);
  const groups = new Map(order.map((category) => [category, []]));
  for (const row of rows) groups.get(rowCategory(row, items)).push(row);
  return order.map((category, index) => ({ category, aisle: index + 1, rows: groups.get(category) })).filter((group) => group.rows.length);
}

// ---------- Prices & spending ----------
export const monthKey = (dateKey) => String(dateKey || '').slice(0, 7);

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function purchaseFor(row, price, { items = [], date, storeId = '', now = new Date().toISOString() } = {}) {
  const value = Number(String(price ?? '').replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error('Η τιμή δεν είναι σωστή.');
  return { id: `pur-${row.id}`, rowId: row.id, name: row.name, category: rowCategory(row, items), price: Math.round(value * 100) / 100, date, ...(storeId ? { storeId } : {}), updatedAt: now };
}

export function monthlySpending(purchases = [], month) {
  const rows = purchases.filter((p) => monthKey(p.date) === month && Number.isFinite(Number(p.price)));
  const byCategory = new Map();
  for (const p of rows) byCategory.set(p.category || 'Άλλο', (byCategory.get(p.category || 'Άλλο') || 0) + Number(p.price));
  const round = (n) => Math.round(n * 100) / 100;
  return { month, total: round(rows.reduce((sum, p) => sum + Number(p.price), 0)), count: rows.length,
    byCategory: [...byCategory].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total) };
}

// ---------- Food waste ----------
export const WASTE_REASONS = ['expired', 'spoiled', 'leftover', 'other'];

export function createWaste(item, input = {}, date, now = new Date().toISOString()) {
  const quantity = Number(input.quantity ?? item.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Η ποσότητα πρέπει να είναι μεγαλύτερη από μηδέν.');
  const reason = WASTE_REASONS.includes(input.reason) ? input.reason : 'other';
  return { id: String(input.id || makeId('waste')), itemId: item.id, name: item.name, category: item.category || 'Άλλο', quantity: Math.min(quantity, 99999), unit: normalizeUnit(item.unit), reason, date, updatedAt: now };
}

// Applies a waste record to the pantry: lowers the quantity; removes the item when nothing is left and no minimum is set.
export function applyWaste(items = [], waste, now = new Date().toISOString()) {
  return items.flatMap((item) => {
    if (item.id !== waste.itemId) return [item];
    const quantity = Math.max(0, Math.round((Number(item.quantity) - Number(waste.quantity)) * 1000) / 1000);
    if (quantity === 0 && !(Number(item.minimum) > 0)) return [];
    return [{ ...item, quantity, updatedAt: now }];
  });
}

export function wasteStats(waste = [], month) {
  const rows = waste.filter((w) => monthKey(w.date) === month);
  const byReason = Object.fromEntries(WASTE_REASONS.map((r) => [r, 0]));
  const byName = new Map();
  for (const w of rows) {
    byReason[WASTE_REASONS.includes(w.reason) ? w.reason : 'other'] += 1;
    const key = normalizeSearch(w.name).trim();
    const entry = byName.get(key) || { name: w.name, count: 0 };
    entry.count += 1; byName.set(key, entry);
  }
  return { month, count: rows.length, byReason, top: [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5) };
}

// Home "sign in so you don't lose your data" card: only when sync is set up but nobody is signed in,
// and not within `days` of the user dismissing it. dismissedAt / now are ms timestamps.
export const SIGNIN_CARD_SNOOZE_DAYS = 14;
export function showSigninCard(status = {}, dismissedAt = 0, now = Date.now(), days = SIGNIN_CARD_SNOOZE_DAYS) {
  const signedOut = status.state === 'signed-out' || (status.state === 'error' && !status.user);
  if (!signedOut || status.user) return false;
  const at = Number(dismissedAt) || 0;
  return !(at && now >= at && now - at < days * 86_400_000);
}
