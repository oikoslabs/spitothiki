// v1.6.8: the user's own expense categories (e.g. «👕 Ρούχα»), shared by receipt items and Μικροέξοδα.
// Separate from pantry categories (those are for the inventory). Pure functions (unit-tested).
// Data: state.expenseCategories = [{ id, name, emoji, createdAt, updatedAt }] (synced + backed up like every list).
// An expense points to a category with `expenseCategory` (purchase / small expense); a receipt recorded as one
// total purchase keeps per-item categories in `expenseSplit` ({ categoryId: amount }). Old data has neither field,
// so it simply stays under «Αγορές» / «Μικροέξοδα»; a deleted category's expenses fall back there the same way.
export const EXPENSE_CAT_DEFAULT_EMOJI = '🏷️';
export const NO_CATEGORY = '-'; // per-item choice «Αγορές» (overrides the receipt's category)

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const foldCat = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('el-GR');
function cleanEmoji(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const parts = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(s)].map((x) => x.segment) : [...s];
  return (parts[0] || '').slice(0, 16);
}
function makeId() {
  if (globalThis.crypto?.randomUUID) return `ec-${globalThis.crypto.randomUUID()}`;
  return `ec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Categories in a stable order (oldest first), ignoring broken records.
export function expenseCategories(stored = []) {
  return (Array.isArray(stored) ? stored : []).filter((c) => c && c.id && c.name)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.name.localeCompare(b.name));
}

// New category, or rename (input.id = existing). Name required, unique (accents/case ignored).
export function createExpenseCategory(input = {}, stored = [], now = new Date().toISOString()) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) throw new Error('Γράψε ένα όνομα κατηγορίας.');
  const id = input.id || makeId();
  if (expenseCategories(stored).some((c) => c.id !== id && foldCat(c.name) === foldCat(name))) throw new Error('Υπάρχει ήδη κατηγορία με αυτό το όνομα.');
  const old = stored.find((c) => c.id === id);
  const emoji = cleanEmoji(input.emoji) || old?.emoji || EXPENSE_CAT_DEFAULT_EMOJI;
  return { id, name, emoji, createdAt: old?.createdAt || now, updatedAt: now };
}
export function upsertExpenseCategory(stored = [], rec) {
  return stored.some((c) => c.id === rec.id) ? stored.map((c) => (c.id === rec.id ? rec : c)) : [...stored, rec];
}
// Deleting removes only the category; expenses keep their id and simply fall back (see shares below).
export const deleteExpenseCategory = (stored = [], id) => stored.filter((c) => c.id !== id);

// The category an item on a receipt ends up in: its own choice, «-» = none, '' = same as the receipt.
export function effectiveItemCategory(itemCategory, receiptCategory) {
  if (itemCategory === NO_CATEGORY) return '';
  return itemCategory || receiptCategory || '';
}

// How a purchase's price is shared: [{ category: id|'' , amount }]. Unknown (deleted) ids → ''.
export function purchaseShares(p, validIds) {
  const price = Number(p?.price);
  if (!Number.isFinite(price)) return [];
  const ok = (id) => Boolean(id) && validIds.has(id);
  const out = [];
  let left = r2(price);
  if (p.expenseSplit && typeof p.expenseSplit === 'object') {
    for (const [id, amount] of Object.entries(p.expenseSplit)) {
      if (!ok(id)) continue;
      const a = Math.min(left, Math.max(0, r2(amount)));
      if (a > 0) { out.push({ category: id, amount: a }); left = r2(left - a); }
    }
  }
  if (left !== 0 || !out.length) out.push({ category: ok(p.expenseCategory) ? p.expenseCategory : '', amount: left });
  return out;
}

// Month split for «Σύνολο εξόδων»: how much of purchases and small expenses moved to each custom category.
// shopping/extras = what stays in «Αγορές»/«Μικροέξοδα». Sum of everything = the old totals (no double counting).
export function expenseCategoryMonth({ purchases = [], extras = [], categories = [] } = {}, month) {
  const cats = expenseCategories(categories);
  const valid = new Set(cats.map((c) => c.id));
  const by = new Map(cats.map((c) => [c.id, 0]));
  let shopping = 0, extrasLeft = 0;
  for (const p of purchases) {
    if (!String(p.date || '').startsWith(`${month}-`) && String(p.date || '').slice(0, 7) !== month) continue;
    for (const s of purchaseShares(p, valid)) {
      if (s.category) by.set(s.category, r2(by.get(s.category) + s.amount)); else shopping = r2(shopping + s.amount);
    }
  }
  for (const e of extras) {
    if (!String(e.date || '').startsWith(`${month}-`)) continue;
    const a = Number(e.amount) || 0;
    if (e.expenseCategory && valid.has(e.expenseCategory)) by.set(e.expenseCategory, r2(by.get(e.expenseCategory) + a)); else extrasLeft = r2(extrasLeft + a);
  }
  return { shopping, extras: extrasLeft, rows: cats.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji || EXPENSE_CAT_DEFAULT_EMOJI, total: by.get(c.id) || 0 })) };
}

// Purchase fields for a receipt's single «total» purchase from its items' categories.
export function totalPurchaseCategory(items, receiptCategory) {
  if (!Array.isArray(items) || !items.length) return receiptCategory ? { expenseCategory: receiptCategory } : {};
  const split = {};
  for (const it of items) {
    if (!it.name || !(Number(it.price) > 0)) continue;
    const c = effectiveItemCategory(it.expenseCategory, receiptCategory);
    if (c) split[c] = r2((split[c] || 0) + Number(it.price));
  }
  const keys = Object.keys(split);
  const priced = items.filter((it) => it.name && Number(it.price) > 0);
  if (keys.length === 1 && priced.every((it) => effectiveItemCategory(it.expenseCategory, receiptCategory) === keys[0])) return { expenseCategory: keys[0] };
  return keys.length ? { expenseSplit: split } : {};
}

// v1.6.14: month rows to show: only categories with spending (> 0,00 €), biggest first; `limit` keeps the main
// screen short (the rest is counted in `more`). Never changes the totals: it only picks rows to display.
export function visibleSpendRows(rows = [], limit = Infinity) {
  const spent = rows.map((row, i) => ({ ...row, i })).filter((row) => Math.round(Number(row.value) * 100) > 0)
    .sort((a, b) => b.value - a.value || a.i - b.i).map(({ i, ...row }) => row);
  const shown = spent.slice(0, limit);
  return { rows: shown, more: spent.length - shown.length };
}
