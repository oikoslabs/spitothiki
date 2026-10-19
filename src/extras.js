// Small daily expenses ("Μικροέξοδα"): coffee, snacks, tobacco… Pure functions (unit-tested).
// Default categories are virtual; a stored record with the same id overrides (rename) or hides (delete) it,
// so two synced devices never duplicate them.
export const DEFAULT_EXTRA_CATEGORIES = [
  { id: 'coffee', name: 'Καφές', emoji: '☕' },
  { id: 'snack', name: 'Σάντουιτς / φαγητό στο πόδι', emoji: '🥪' },
  { id: 'tobacco', name: 'Καπνός', emoji: '🚬' },
  { id: 'papers', name: 'Χαρτάκια', emoji: '📄' },
  { id: 'filters', name: 'Φιλτράκια', emoji: '🔘' }
];
export const EXTRA_DEFAULT_EMOJI = '🧾';

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('el-GR');
// First grapheme (an emoji can be several code points).
function cleanEmoji(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const parts = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(s)].map((x) => x.segment) : [...s];
  return (parts[0] || '').slice(0, 16);
}

// Visible categories: defaults (possibly renamed/hidden) followed by custom ones in creation order.
export function extraCategories(stored = []) {
  const byId = new Map(stored.map((c) => [c.id, c]));
  const out = [];
  for (const d of DEFAULT_EXTRA_CATEGORIES) {
    const s = byId.get(d.id);
    if (s?.hidden) continue;
    out.push({ id: d.id, name: s?.name || d.name, emoji: s ? (s.emoji ?? d.emoji) : d.emoji, builtin: true, renamed: Boolean(s?.name && s.name !== d.name) });
  }
  const custom = stored.filter((c) => !c.hidden && !DEFAULT_EXTRA_CATEGORIES.some((d) => d.id === c.id))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const c of custom) out.push({ id: c.id, name: c.name, emoji: c.emoji || '', builtin: false, renamed: false });
  return out;
}

// New custom category, or rename (existing = the stored record or a default's id).
export function createExtraCategory(input = {}, stored = [], now = new Date().toISOString()) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) throw new Error('Γράψε ένα όνομα κατηγορίας.');
  const id = input.id || makeId('xc');
  if (extraCategories(stored).some((c) => c.id !== id && fold(c.name) === fold(name))) throw new Error('Υπάρχει ήδη κατηγορία με αυτό το όνομα.');
  const old = stored.find((c) => c.id === id);
  return { id, name, emoji: cleanEmoji(input.emoji), createdAt: old?.createdAt || input.createdAt || now, updatedAt: now };
}

// Returns the next stored list after deleting a category (defaults are hidden, custom ones removed).
export function deleteExtraCategory(stored = [], id, now = new Date().toISOString()) {
  if (DEFAULT_EXTRA_CATEGORIES.some((d) => d.id === id)) {
    const rest = stored.filter((c) => c.id !== id);
    return [...rest, { id, hidden: true, createdAt: now, updatedAt: now }];
  }
  return stored.filter((c) => c.id !== id);
}

export function createExtra(input = {}, now = new Date().toISOString()) {
  const amount = num(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw new Error('Γράψε ένα έγκυρο ποσό.');
  if (!isDate(input.date)) throw new Error('Διάλεξε ημερομηνία.');
  if (!input.category) throw new Error('Διάλεξε κατηγορία.');
  const qty = input.qty === undefined || input.qty === '' ? 1 : Math.round(num(input.qty));
  if (!Number.isFinite(qty) || qty < 1 || qty > 99) throw new Error('Η ποσότητα πρέπει να είναι από 1 έως 99.');
  return { id: input.id || makeId('xe'), category: String(input.category), amount: round2(amount), qty, date: input.date, note: String(input.note || '').trim().slice(0, 80), createdAt: input.createdAt || now, updatedAt: now };
}

export const unitPrice = (entry) => round2(entry.amount / (entry.qty || 1));

// Price per piece of the most recent entry of a category (null if never used).
export function lastUnitPrice(entries = [], category) {
  let best = null;
  for (const e of entries) {
    if (e.category !== category) continue;
    if (!best || e.date > best.date || (e.date === best.date && String(e.createdAt) > String(best.createdAt))) best = e;
  }
  return best ? unitPrice(best) : null;
}

// One-tap entry for today with the last price; null when the price is unknown (ask the user).
export function quickExtra(entries, category, today, now = new Date().toISOString(), price = lastUnitPrice(entries, category)) {
  if (!price) return null;
  return createExtra({ category, amount: price, qty: 1, date: today }, now);
}

// Changes the quantity keeping the price per piece.
export function setExtraQty(entry, qty, now = new Date().toISOString()) {
  const q = Math.min(99, Math.max(1, Math.round(Number(qty) || 1)));
  return createExtra({ ...entry, qty: q, amount: unitPrice(entry) * q }, now);
}

// Monday of the week that contains `date` (YYYY-MM-DD).
export function weekStartOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };

export function extrasMonth(entries = [], month, categories = []) {
  const by = new Map();
  let total = 0, count = 0;
  for (const e of entries) {
    if (!String(e.date).startsWith(`${month}-`)) continue;
    total += e.amount; count += e.qty || 1;
    const row = by.get(e.category) || { category: e.category, total: 0, count: 0 };
    row.total = round2(row.total + e.amount); row.count += e.qty || 1;
    by.set(e.category, row);
  }
  const order = new Map(categories.map((c, i) => [c.id, i]));
  return { total: round2(total), count, byCategory: [...by.values()].sort((a, b) => b.total - a.total || (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99)) };
}

// Today / this week (Mon–Sun) / this month for the date `today`.
export function extrasSummary(entries = [], today) {
  const from = weekStartOf(today), to = addDays(from, 6), month = today.slice(0, 7);
  let day = 0, week = 0, monthTotal = 0;
  for (const e of entries) {
    if (e.date === today) day += e.amount;
    if (e.date >= from && e.date <= to) week += e.amount;
    if (e.date.startsWith(`${month}-`)) monthTotal += e.amount;
  }
  return { today: round2(day), week: round2(week), month: round2(monthTotal), weekFrom: from, weekTo: to };
}
