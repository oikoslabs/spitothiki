// Saved receipts («🧾 Αποδείξεις»): pure helpers for the list, month filter and details. Unit-tested.
const linked = (r, purchases) => (purchases || []).filter((p) => p.receiptId === r.id);

export function receiptCategory(r, purchases = []) {
  if (r.category) return r.category;
  if (r.format === 'transport') return 'Μετακινήσεις';
  const sums = new Map();
  for (const p of linked(r, purchases)) sums.set(p.category || 'Άλλο', (sums.get(p.category || 'Άλλο') || 0) + (Number(p.price) || 0));
  const top = [...sums].sort((a, b) => b[1] - a[1])[0];
  return top && top[0] !== 'Άλλο' ? top[0] : 'Αγορές';
}

export function receiptItems(r, purchases = []) {
  if (Array.isArray(r.items) && r.items.length) return r.items;
  return linked(r, purchases).filter((p) => p.name).map((p) => ({ name: p.name, price: Number(p.price) || 0 }));
}

const when = (r) => `${r.date || ''}|${r.importedAt || ''}`;
export function receiptMonths(receipts = []) {
  return [...new Set(receipts.map((r) => String(r.date || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))].sort().reverse();
}
export function listReceipts(receipts = [], month = '') {
  return receipts.filter((r) => !month || String(r.date || '').startsWith(month)).sort((a, b) => (when(a) < when(b) ? 1 : when(a) > when(b) ? -1 : 0));
}
export function deleteReceipt(state, id) {
  return { receipts: (state.receipts || []).filter((r) => r.id !== id), purchases: (state.purchases || []).filter((p) => p.receiptId !== id) };
}
