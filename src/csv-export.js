// «Εξαγωγή εξόδων (Excel)»: a local CSV of expense lines for Excel / an AI.
// Nothing is uploaded. Encoding is UTF-8 with BOM, ';' as the separator, and
// comma decimals so Greek Excel opens the file correctly.
// Accounting matches «Σύνολο εξόδων»: purchases, paid bills, transport, extras.

import { billCountInfo } from './bills.js';
import { expenseCategories, purchaseShares } from './expense-cats.js';
import { isMarkedCash } from './epayment-target.js';
import { daysInMonth } from './month-insights.js';
import { customProductTypes, typeName } from './product-types.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const inRange = (date, from, to) => {
  const d = String(date || '').slice(0, 10);
  return DATE.test(d) && d >= from && d <= to;
};

export const CSV_HEADERS = [
  'Ημερομηνία', 'Τύπος', 'Κατάστημα', 'Προϊόν', 'Ποσότητα', 'Μονάδα',
  'Ποσό €', 'Είδος προϊόντος', 'Κατηγορία εξόδου', 'Μετρητά', 'Πηγή'
];

export const EXPENSE_TYPE = {
  shopping: 'Αγορές',
  bill: 'Λογαριασμός',
  transport: 'Μετακίνηση',
  extra: 'Μικροέξοδο'
};

const TRANSPORT_NAMES = {
  fuel: 'Βενζίνη / καύσιμα',
  tolls: 'Διόδια',
  transit: 'ΜΜΜ (μετρό/λεωφορείο/τρένο)',
  taxi: 'Ταξί',
  parking: 'Στάθμευση',
  other: 'Άλλο'
};

const BILL_NAMES = {
  electricity: 'Ρεύμα',
  water: 'Νερό',
  gas: 'Φυσικό αέριο / θέρμανση',
  rent: 'Ενοίκιο / κοινόχρηστα',
  phone: 'Τηλέφωνο',
  internet: 'Internet',
  subscription: 'Συνδρομή',
  insurance: 'Ασφάλεια',
  tax: 'Φόροι / τέλη',
  gym: 'Γυμναστήριο / αθλητισμός',
  education: 'Φροντιστήριο / μαθήματα',
  childcare: 'Παιδικός σταθμός / νταντά',
  loan: 'Δόση δανείου',
  parking: 'Πάρκινγκ',
  other: 'Άλλο'
};

const TYPE_ORDER = {
  [EXPENSE_TYPE.shopping]: 1,
  [EXPENSE_TYPE.bill]: 2,
  [EXPENSE_TYPE.transport]: 3,
  [EXPENSE_TYPE.extra]: 4
};

export const CSV_EXPORT_EN = {
  'Εξαγωγή εξόδων (Excel)': 'Export expenses (Excel)',
  '📊 Εξαγωγή εξόδων (Excel)': '📊 Export expenses (Excel)',
  'Κατέβασε τα έξοδά σου σε αρχείο που ανοίγει στο Excel ή το δίνεις σε κάποιο AI. Μένει στη συσκευή σου, δεν ανεβαίνει πουθενά.': 'Download your expenses as a file that opens in Excel or that you can give to an AI. It stays on your device and is not uploaded anywhere.',
  'Διάλεξε περίοδο. Το αρχείο μένει στη συσκευή σου και δεν ανεβαίνει πουθενά.': 'Choose a period. The file stays on your device and is not uploaded anywhere.',
  'Αυτός ο μήνας': 'This month',
  'Αυτή η χρονιά': 'This year',
  'Όλα': 'All',
  'ΕΞΟΔΑ': 'EXPENSES',
  'Δεν υπάρχουν έξοδα σε αυτή την περίοδο.': 'There are no expenses in this period.',
  'Το αρχείο εξόδων κατέβηκε.': 'The expenses file was downloaded.',
  'Το αρχείο εξόδων στάλθηκε.': 'The expenses file was shared.',
  'Δεν ήταν δυνατή η δημιουργία του αρχείου.': 'The file could not be created.'
};

export function csvField(value) {
  const s = value == null ? '' : String(value);
  if (/[;"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvNumber(value, { decimals } = {}) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (decimals != null) return n.toFixed(decimals).replace('.', ',');
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

// period: 'month' | 'year' | 'all'. today is YYYY-MM-DD (local).
export function expensePeriod(period, today) {
  const d = String(today || '').slice(0, 10);
  if (!DATE.test(d)) return null;
  if (period === 'month') {
    const month = d.slice(0, 7);
    const last = daysInMonth(month);
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, filename: `spitothiki-exoda-${month}.csv` };
  }
  if (period === 'year') {
    const year = d.slice(0, 4);
    return { from: `${year}-01-01`, to: `${year}-12-31`, filename: `spitothiki-exoda-${year}.csv` };
  }
  if (period === 'all') return { from: '0000-01-01', to: '9999-12-31', filename: 'spitothiki-exoda-ola.csv' };
  return null;
}

export function expenseSource(receipt) {
  if (!receipt) return 'χειροκίνητα';
  if (receipt.format === 'photo') return 'φωτογραφία';
  if (receipt.format === 'myDATA' || receipt.format === 'EN16931' || receipt.format === 'AADE') return 'QR';
  if (receipt.format === 'transport') return 'QR';
  if (receipt.url || receipt.sourceUrl) return 'QR';
  return 'χειροκίνητα';
}

function cashLabel(row, receiptsById) {
  return isMarkedCash(row, receiptsById) ? 'Ναι' : 'Όχι';
}

function catName(id, cats) {
  if (!id) return '';
  const c = cats.find((x) => x.id === id);
  return c ? `${c.emoji || ''} ${c.name}`.trim() : '';
}

function qtyOf(purchase, receipt) {
  const items = Array.isArray(receipt?.items) ? receipt.items : [];
  const m = String(purchase.id || '').match(/^pur-(.+)-(\d+)$/);
  if (m && receipt && m[1] === String(receipt.id) && items[Number(m[2])]) {
    return { quantity: items[Number(m[2])].quantity, unit: items[Number(m[2])].unit };
  }
  const byName = items.find((it) => String(it.name || '') === String(purchase.name || ''));
  if (byName) return { quantity: byName.quantity, unit: byName.unit };
  if (purchase.quantity != null && purchase.quantity !== '') return { quantity: purchase.quantity, unit: purchase.unit };
  return { quantity: '', unit: '' };
}

function isTotalOnly(purchase, receipt) {
  return Boolean(receipt && purchase.id === `pur-${receipt.id}` && !(receipt.items || []).length);
}

function row({ date, type, store, item, quantity, unit, amount, productType, expenseCategory, cash, source }) {
  return {
    date: DATE.test(String(date || '').slice(0, 10)) ? String(date).slice(0, 10) : '',
    type: type || '',
    store: store || '',
    item: item || '',
    quantity: quantity === '' || quantity == null ? '' : quantity,
    unit: unit || '',
    amount: r2(amount),
    productType: productType || '',
    expenseCategory: expenseCategory || '',
    cash: cash || 'Όχι',
    source: source || 'χειροκίνητα'
  };
}

export function expenseRows(state = {}, from, to, { translate = (s) => s } = {}) {
  const receiptsById = new Map((state.receipts || []).map((r) => [String(r.id), r]));
  const cats = expenseCategories(state.expenseCategories || []);
  const valid = new Set(cats.map((c) => c.id));
  const types = customProductTypes(state.productTypes || []);
  const productTypeOf = (value) => typeName(value, translate, types);
  const rows = [];

  for (const p of state.purchases || []) {
    if (!inRange(p.date, from, to) || !Number.isFinite(Number(p.price))) continue;
    const receipt = p.receiptId ? receiptsById.get(String(p.receiptId)) : null;
    const totalOnly = isTotalOnly(p, receipt);
    const qty = totalOnly ? { quantity: '', unit: '' } : qtyOf(p, receipt);
    const shares = purchaseShares(p, valid);
    const cashRow = receipt || p;
    shares.forEach((s, i) => {
      rows.push(row({
        date: p.date,
        type: EXPENSE_TYPE.shopping,
        store: p.storeName || receipt?.store || '',
        item: totalOnly ? '' : (p.name || ''),
        quantity: i === 0 ? qty.quantity : '',
        unit: i === 0 ? qty.unit : '',
        amount: s.amount,
        productType: totalOnly ? '' : productTypeOf(p.category),
        expenseCategory: s.category ? catName(s.category, cats) : EXPENSE_TYPE.shopping,
        cash: cashLabel(cashRow, receiptsById),
        source: expenseSource(receipt)
      }));
    });
  }

  const billInfo = billCountInfo(state.bills || []);
  for (const b of state.bills || []) {
    if (!b.paid) continue;
    const when = billInfo.get(b)?.date || '';
    if (!inRange(when, from, to)) continue;
    rows.push(row({
      date: when,
      type: EXPENSE_TYPE.bill,
      store: b.name || '',
      item: '',
      amount: b.amount,
      expenseCategory: translate(BILL_NAMES[b.type] || b.type || 'Άλλο'),
      cash: cashLabel(b, receiptsById),
      source: 'χειροκίνητα'
    }));
  }

  for (const e of state.transport || []) {
    if (!inRange(e.date, from, to) || !Number.isFinite(Number(e.amount))) continue;
    const receipt = e.receiptId ? receiptsById.get(String(e.receiptId)) : null;
    const fuel = e.type === 'fuel' && Number(e.liters) > 0;
    rows.push(row({
      date: e.date,
      type: EXPENSE_TYPE.transport,
      store: receipt?.store || e.note || e.vehicle || '',
      item: translate(TRANSPORT_NAMES[e.type] || e.type || 'Άλλο'),
      quantity: fuel ? e.liters : '',
      unit: fuel ? 'λίτρα' : '',
      amount: e.amount,
      expenseCategory: e.type === 'tolls' ? 'Διόδια' : 'Μετακινήσεις',
      cash: cashLabel(receipt || e, receiptsById),
      source: expenseSource(receipt)
    }));
  }

  for (const e of state.extras || []) {
    if (!inRange(e.date, from, to) || !Number.isFinite(Number(e.amount))) continue;
    const own = e.expenseCategory && valid.has(e.expenseCategory) ? catName(e.expenseCategory, cats) : 'Μικροέξοδα';
    rows.push(row({
      date: e.date,
      type: EXPENSE_TYPE.extra,
      store: '',
      item: e.note || e.category || '',
      quantity: e.qty || 1,
      unit: 'τεμ.',
      amount: e.amount,
      expenseCategory: own,
      cash: cashLabel(e, receiptsById),
      source: 'χειροκίνητα'
    }));
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || (TYPE_ORDER[a.type] || 9) - (TYPE_ORDER[b.type] || 9) || a.store.localeCompare(b.store, 'el') || a.item.localeCompare(b.item, 'el'));
  return rows;
}

export function rowsToCsv(rows = []) {
  const lines = [
    CSV_HEADERS.map(csvField).join(';'),
    ...rows.map((r) => [
      csvField(r.date),
      csvField(r.type),
      csvField(r.store),
      csvField(r.item),
      csvField(r.quantity === '' ? '' : csvNumber(r.quantity)),
      csvField(r.unit),
      csvField(csvNumber(r.amount, { decimals: 2 })),
      csvField(r.productType),
      csvField(r.expenseCategory),
      csvField(r.cash),
      csvField(r.source)
    ].join(';'))
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function buildExpenseCsv(state = {}, { period = 'month', today, translate } = {}) {
  const bounds = expensePeriod(period, today);
  if (!bounds) throw new Error('Διάλεξε περίοδο.');
  const rows = expenseRows(state, bounds.from, bounds.to, { translate });
  return { ...bounds, rows, count: rows.length, csv: rowsToCsv(rows), filename: bounds.filename };
}
