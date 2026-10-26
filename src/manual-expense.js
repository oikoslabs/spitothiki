// v1.8.0: «＋ Έξοδο με το χέρι» — an expense typed by hand (butcher, λαϊκή, a thrown-away receipt, or a cash-register
// QR of the ΑΑΔΕ that carries no amount). Pure, unit-tested.
// No new data type: it is saved exactly like a receipt recorded «only the total» (since v1.3):
//   state.receipts  += { id, date, total, store, format: 'manual' | 'AADE', lines: 0, items: [], expenseCategory?, url?, importedAt }
//   state.purchases += { id: `pur-${id}`, rowId: '', name, category: 'Άλλο', price, date, receiptId: id, storeName?, expenseCategory?, updatedAt }
// so it counts in «Τα έξοδα του μήνα» / «Σύνολο εξόδων» (under «Αγορές» or the chosen category), shows in «🧾 Αποδείξεις»,
// can be edited (✎) and deleted there, and older app versions in the same household read, edit and delete it the same way.
const r2 = (n) => Math.round(n * 100) / 100;
export const MANUAL_MAX = 100000;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

export function parseAmount(value) {
  const s = String(value ?? '').trim().replace(/\s|€/g, '');
  if (!s) return NaN;
  // «12,50» and «1.234,50» (Greek) as well as «12.50».
  const normal = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return `manual-${globalThis.crypto.randomUUID()}`;
  return `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// input: { amount, store?, date?, expenseCategory?, id?, url?, format? } → { receipt, purchase }. Throws a Greek message.
export function createManualExpense(input = {}, today, now = new Date().toISOString()) {
  const amount = parseAmount(input.amount);
  if (!(amount > 0)) throw new Error('Γράψε ποσό μεγαλύτερο από 0.');
  if (amount > MANUAL_MAX) throw new Error('Το ποσό είναι πολύ μεγάλο.');
  const total = r2(amount);
  const store = String(input.store || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const date = isDate(input.date) ? input.date : today;
  if (!isDate(date)) throw new Error('Διάλεξε ημερομηνία.');
  const id = input.id || makeId();
  const cat = String(input.expenseCategory || '');
  const receipt = { id, date, total, store, issuerVat: '', format: input.format || 'manual', lines: 0, items: [], ...(cat ? { expenseCategory: cat } : {}), ...(input.url ? { url: input.url } : {}), importedAt: now };
  const purchase = { id: `pur-${id}`, rowId: '', name: store || 'Έξοδο', category: 'Άλλο', price: total, date, receiptId: id, ...(store ? { storeName: store } : {}), ...(cat ? { expenseCategory: cat } : {}), updatedAt: now };
  return { receipt, purchase };
}

// Adds it to the state lists (returns the new lists; never mutates).
export function addManualExpense(state, entry) {
  return { receipts: [...(state.receipts || []), entry.receipt], purchases: [...(state.purchases || []), entry.purchase] };
}

// A scanned receipt that has neither items nor an amount (e.g. ΑΑΔΕ cash-register QR): ask for the amount instead of saving 0 €.
export const needsAmount = (receipt) => Boolean(receipt) && !(receipt.lines || []).length && !(Number(receipt.total) > 0);
