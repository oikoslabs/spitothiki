// v1.4: edit a saved receipt; keeps the receipt record and its linked purchases consistent. Unit-tested.
// v1.6.8: optional expense category for the whole receipt (edits.expenseCategory) and per item (items[i].expenseCategory:
// '' = same as the receipt, '-' = none). Omitted fields keep what the receipt already had.
import { effectiveItemCategory, totalPurchaseCategory } from './expense-cats.js';
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// edits: { store, date, total?, expenseCategory?, items: [{ name, quantity, price, expenseCategory? }] } (items index = original line index)
export function applyReceiptEdit(state, id, edits, now = new Date().toISOString()) {
  const receipt = (state.receipts || []).find((r) => r.id === id);
  if (!receipt) return state;
  const store = String(edits.store ?? receipt.store ?? '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(edits.date || '')) ? edits.date : receipt.date;
  const receiptCat = edits.expenseCategory !== undefined ? String(edits.expenseCategory || '') : String(receipt.expenseCategory || '');
  const oldItems = Array.isArray(receipt.items) ? receipt.items : [];
  const items = Array.isArray(edits.items) ? edits.items.map((it, i) => {
    const cat = it.expenseCategory !== undefined ? String(it.expenseCategory || '') : String(oldItems[i]?.expenseCategory || '');
    return { name: String(it.name || '').trim(), quantity: Math.max(0, Number(it.quantity) || 0), unit: it.unit, price: Math.max(0, r2(it.price)), ...(cat ? { expenseCategory: cat } : {}) };
  }) : null;
  const catItems = items || oldItems;
  const withCat = (p, fields) => { const out = { ...p }; delete out.expenseCategory; delete out.expenseSplit; return { ...out, ...fields }; };
  const sum = items ? r2(items.reduce((s, it) => s + (it.name ? it.price : 0), 0)) : 0;
  const total = edits.total != null && edits.total !== '' ? Math.max(0, r2(edits.total)) : (items && items.length ? sum : r2(receipt.total));
  const linked = (state.purchases || []).filter((p) => p.receiptId === id);
  const linePurchases = linked.some((p) => p.id.startsWith(`pur-${id}-`));
  const purchases = [];
  for (const p of state.purchases || []) {
    if (p.receiptId !== id) { purchases.push(p); continue; }
    const base = { ...p, date, storeName: store || p.storeName, updatedAt: now };
    if (!store) delete base.storeName;
    if (p.id === `pur-${id}`) { purchases.push(withCat({ ...base, price: total, ...(p.name === receipt.store || !p.name ? { name: store || p.name } : {}) }, totalPurchaseCategory(catItems, receiptCat))); continue; }
    const index = Number(p.id.slice(`pur-${id}-`.length));
    const it = items && Number.isInteger(index) ? items[index] : null;
    if (items && (!it || !it.name || !it.price)) continue; // removed line or no price → no expense
    const lineCat = effectiveItemCategory(catItems[index]?.expenseCategory, receiptCat);
    purchases.push(withCat(it ? { ...base, name: it.name, price: it.price } : base, lineCat ? { expenseCategory: lineCat } : {}));
  }
  // Lines that got a price now but had no purchase before (only when the receipt was recorded per line).
  if (items && linePurchases) {
    const tmpl = linked.find((p) => p.id.startsWith(`pur-${id}-`));
    items.forEach((it, index) => {
      const pid = `pur-${id}-${index}`;
      const lineCat = effectiveItemCategory(it.expenseCategory, receiptCat);
      if (it.name && it.price && !purchases.some((p) => p.id === pid)) purchases.push(withCat({ ...tmpl, id: pid, name: it.name, price: it.price, date, ...(store ? { storeName: store } : {}), updatedAt: now }, lineCat ? { expenseCategory: lineCat } : {}));
    });
  }
  const receipts = state.receipts.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, store, date, total, ...(items ? { items: items.filter((it) => it.name) } : {}), editedAt: now };
    if (receiptCat) next.expenseCategory = receiptCat; else delete next.expenseCategory;
    return next;
  });
  return { ...state, receipts, purchases };
}
