// Indicative yearly target for electronic payments (Greek 30% rule, as a guide — not tax advice).
// Target = min(30% × income, €20.000). Formula is isolated so it can be changed in one place.
// Stored as a synced `epayTargets` list (same record shape as budgets) — no rules or backend changes.

import { periodTotals } from './month-insights.js';
import { parseEuro } from './budget.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}$/;

export const EPAY_ID = 'year';
export const EPAY_RATE = 0.3;
export const EPAY_TARGET_CAP = 20000;

// myDATA payment method types (AADE): 1 cash, 2 cheque, 3 on credit — not electronic.
const CASH_MYDATA = new Set([1, 2, 3]);
// UN/ECE 4461 codes used in EN16931 / UBL PaymentMeansCode.
const CASH_UBL = new Set(['10', '20', '21']);
const CASH_NAMES = new Set([
  'cash', 'cheque', 'check', 'credit', 'oncredit', 'on-credit',
  'μετρητά', 'μετρητα', 'μετρητοίς', 'μετρητοις',
  'επιταγή', 'επιταγη', 'επί πιστώσει', 'επι πιστωσει'
]);
const CARD_NAMES = new Set([
  'card', 'electronic', 'pos', 'iris', 'bank', 'web', 'banking', 'transfer',
  'κάρτα', 'καρτα', 'ηλεκτρονικά', 'ηλεκτρονικα', 'τράπεζα', 'τραπεζα'
]);

export function electronicPaymentTarget(income) {
  const n = Number(income);
  if (!Number.isFinite(n) || n <= 0) return null;
  return r2(Math.min(n * EPAY_RATE, EPAY_TARGET_CAP));
}

function normName(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function methodIsElectronic(method) {
  if (method == null || method === '') return true;
  if (typeof method === 'boolean') return !method;
  if (typeof method === 'object') return methodIsElectronic(method.type ?? method.code ?? method.payment ?? method.paymentMethod);
  const raw = String(method).trim();
  if (CASH_UBL.has(raw)) return false;
  const n = Number(raw);
  // myDATA types are single-digit (1 cash, 2 cheque, 3 on credit). UBL codes are 10, 20, 30…
  if (Number.isFinite(n) && /^\d+$/.test(raw) && n < 10) return !CASH_MYDATA.has(n);
  const name = normName(raw);
  if (CASH_NAMES.has(name) || CASH_NAMES.has(raw.toLowerCase())) return false;
  if (CARD_NAMES.has(name) || CARD_NAMES.has(raw.toLowerCase())) return true;
  return true;
}

// Unknown method counts as electronic (card). Known cash / cheque / on-credit do not.
// paidCash is an explicit user mark: true = cash (out), false = not cash (counts), even if payment said otherwise.
export function isElectronicPayment(row, receiptsById) {
  if (row == null || row === '') return true;
  if (typeof row !== 'object') return methodIsElectronic(row);
  if (typeof row.paidCash === 'boolean') return !row.paidCash;
  if (row.payment != null && row.payment !== '') return methodIsElectronic(row.payment);
  if (row.paymentMethod != null && row.paymentMethod !== '') return methodIsElectronic(row.paymentMethod);
  if (Array.isArray(row.paymentMethods) && row.paymentMethods.length) {
    return row.paymentMethods.some(methodIsElectronic);
  }
  if (row.receiptId && receiptsById) {
    const receipt = receiptsById.get(String(row.receiptId));
    if (receipt) return isElectronicPayment(receipt, null);
  }
  return true;
}

// Checkbox state for a receipt: honour an explicit paidCash, else infer from payment methods.
export function isMarkedCash(row, receiptsById) {
  if (row == null || row === '') return false;
  if (typeof row === 'object' && typeof row.paidCash === 'boolean') return row.paidCash;
  return !isElectronicPayment(row, receiptsById);
}

// Field to write on a receipt when the user ticks or unticks «Πληρώθηκε με μετρητά».
// Unticking stores paidCash: false only when the record would otherwise count as cash.
export function paidCashWrite(checked, current = {}) {
  if (checked) return { paidCash: true };
  const probe = { ...current };
  delete probe.paidCash;
  return isElectronicPayment(probe) ? {} : { paidCash: false };
}

export function paymentFromMethods(methods) {
  const list = Array.isArray(methods) ? methods.filter(Boolean) : [];
  if (!list.length) return undefined;
  return list.some(methodIsElectronic) ? 'electronic' : 'cash';
}

export function createEpayTarget(input = {}, now = new Date().toISOString()) {
  const income = parseEuro(input.income);
  if (income == null) throw new Error('Βάλε το ετήσιο εισόδημά σου.');
  if (!(income > 0)) throw new Error('Το εισόδημα πρέπει να είναι μεγαλύτερο από 0.');
  return {
    id: input.id || EPAY_ID,
    income,
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function activeEpayTarget(list = []) {
  const rows = Array.isArray(list) ? list : [];
  return rows.find((row) => row && row.id === EPAY_ID) || rows[0] || null;
}

function receiptsIndex(receipts = []) {
  return new Map((Array.isArray(receipts) ? receipts : []).map((r) => [String(r.id), r]));
}

function keepElectronic(rows, receiptsById) {
  return (Array.isArray(rows) ? rows : []).filter((row) => isElectronicPayment(row, receiptsById));
}

export function yearElectronicSpend(state = {}, year) {
  const y = String(year || '');
  if (!YEAR.test(y)) return { year: '', from: '', to: '', total: 0, rows: [] };
  const from = `${y}-01-01`;
  const to = `${y}-12-31`;
  const receiptsById = receiptsIndex(state.receipts);
  const filtered = {
    ...state,
    purchases: keepElectronic(state.purchases, receiptsById),
    extras: keepElectronic(state.extras, receiptsById),
    transport: keepElectronic(state.transport, receiptsById),
    bills: (state.bills || []).filter((b) => !b.paid || isElectronicPayment(b, receiptsById))
  };
  const totals = periodTotals(filtered, from, to);
  return { year: y, from, to, total: totals.total, rows: totals.rows };
}

export function monthsLeftInYear(today) {
  if (!DATE.test(today || '')) return 0;
  const month = Number(today.slice(5, 7));
  if (month < 1 || month > 12) return 0;
  return 13 - month;
}

export function monthlyNeed(remaining, today) {
  const left = monthsLeftInYear(today);
  const amount = r2(Math.max(0, Number(remaining) || 0));
  if (!left || !(amount > 0)) return 0;
  return r2(amount / left);
}

export function epaymentReport({ income, state = {}, today } = {}) {
  if (!DATE.test(today || '')) return null;
  const year = today.slice(0, 4);
  const spent = yearElectronicSpend(state, year).total;
  const target = electronicPaymentTarget(income);
  if (target == null) {
    return { year, income: null, target: null, spent, remaining: null, monthsLeft: monthsLeftInYear(today), monthly: null, pct: 0, status: 'need-income' };
  }
  const remaining = r2(Math.max(0, target - spent));
  const monthsLeft = monthsLeftInYear(today);
  const monthly = monthlyNeed(remaining, today);
  const pct = Math.min(999, Math.round((spent / target) * 100));
  const status = spent >= target ? 'met' : 'ok';
  return { year, income: r2(income), target, spent, remaining, monthsLeft, monthly, pct, status };
}

export const EPAY_EN = {
  'Στόχος ηλεκτρονικών πληρωμών': 'Electronic payments target',
  'Για τον φόρο, μετράνε οι πληρωμές με κάρτα ή τράπεζα, περίπου στο 30% του εισοδήματος της χρονιάς (το πολύ 20.000 € στόχος). Ενδεικτικό· για ακρίβεια ρώτα τον λογιστή σου.': 'For tax, card or bank payments count, around 30% of this year’s income (the target is capped at €20,000). This is a guide; for accuracy ask your accountant.',
  'Ενδεικτικό· για ακρίβεια ρώτα τον λογιστή σου': 'This is a guide; for accuracy ask your accountant',
  'Ετήσιο εισόδημα (€)': 'Yearly income (€)',
  'π.χ. 18.000': 'e.g. 18,000',
  'Αποθήκευση εισοδήματος': 'Save income',
  'Άλλαξε το εισόδημα': 'Change the income',
  'Ξόδεψες {spent} από {target}': 'You spent {spent} of {target}',
  'Απομένουν {amount}': '{amount} left',
  'Έφτασες τον ενδεικτικό στόχο.': 'You have reached the indicative target.',
  'Χρειάζεσαι ~{amount} τον μήνα μέχρι τέλος χρονιάς': 'You need ~{amount} a month until the end of the year',
  '(όσα δεν ξέρουμε τρόπο πληρωμής μετράνε ως κάρτα)': '(amounts with an unknown payment method count as card)',
  '(όσα δεν ξέρουμε τρόπο πληρωμής μετράνε ως κάρτα· μπορείς να σημειώσεις «Πληρώθηκε με μετρητά» στην απόδειξη)': '(amounts with an unknown payment method count as card; you can mark a receipt as “Paid in cash”)',
  'Πληρώθηκε με μετρητά': 'Paid in cash',
  'δεν μετράει στον στόχο ηλεκτρονικών πληρωμών': 'it does not count toward the electronic payments target',
  'Σημειώθηκε ως μετρητά.': 'Marked as cash.',
  'Αφαιρέθηκε η σήμανση μετρητών.': 'The cash mark was removed.',
  'Βάλε το ετήσιο εισόδημά σου.': 'Enter your yearly income.',
  'Το εισόδημα πρέπει να είναι μεγαλύτερο από 0.': 'Income must be greater than 0.',
  'Το εισόδημα αποθηκεύτηκε.': 'The income was saved.',
  'Κάρτα στόχου ηλεκτρονικών πληρωμών': 'Electronic payments target card'
};
