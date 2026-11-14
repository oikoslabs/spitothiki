// Monthly household budget (free). Uses the same month spending as «Σύνολο εξόδων μήνα».
// Stored as a synced `budgets` list (existing record shape) — no rules or backend changes.

import { monthlySpending } from './features.js';
import { transportMonth } from './transport.js';
import { extrasMonth } from './extras.js';
import { billsMonthSplit } from './bills.js';
import { expenseCategoryMonth } from './expense-cats.js';
import { daysInMonth } from './month-insights.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

export const BUDGET_ID = 'month';
export const NOTICE_KEY = 'spitothiki:budget-notice';
export const WARN_AT = 0.8;

export const BUDGET_CATEGORIES = [
  { id: 'shopping', label: 'Αγορές', emoji: '🛒' },
  { id: 'rent', label: 'Ενοίκιο / κοινόχρηστα', emoji: '🏠' },
  { id: 'bills', label: 'Λογαριασμοί', emoji: '📄' },
  { id: 'tolls', label: 'Διόδια', emoji: '🛣️' },
  { id: 'transport', label: 'Μετακινήσεις', emoji: '🚗' },
  { id: 'extras', label: 'Μικροέξοδα', emoji: '☕' }
];

export function parseEuro(raw) {
  let s = String(raw ?? '').trim().replace(/[€\s]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastComma > lastDot) {
    const dec = s.length - lastComma - 1;
    if (dec === 3 && lastDot < 0) s = s.replace(/,/g, '');
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    const dec = s.length - lastDot - 1;
    if (lastComma >= 0) s = s.replace(/,/g, '');
    else if (dec === 3) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error('Το ποσό του προϋπολογισμού δεν είναι έγκυρο.');
  return r2(n);
}

export function createBudget(input = {}, now = new Date().toISOString()) {
  const total = input.total == null || input.total === '' ? null : parseEuro(input.total);
  if (total === 0) throw new Error('Το συνολικό όριο πρέπει να είναι μεγαλύτερο από 0, ή άδειο.');
  const categories = [];
  const seen = new Set();
  for (const row of Array.isArray(input.categories) ? input.categories : []) {
    const id = String(row?.id || '').trim().slice(0, 40);
    if (!id || seen.has(id)) continue;
    const amount = row.amount == null || row.amount === '' ? null : parseEuro(row.amount);
    if (amount == null) continue;
    if (amount === 0) continue;
    seen.add(id);
    categories.push({ id, amount });
  }
  if (total == null && !categories.length) throw new Error('Βάλε συνολικό όριο ή τουλάχιστον ένα όριο κατηγορίας.');
  return {
    id: input.id || BUDGET_ID,
    total,
    categories,
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function activeBudget(list = []) {
  const rows = Array.isArray(list) ? list : [];
  return rows.find((b) => b && b.id === BUDGET_ID) || rows[0] || null;
}

export function hasBudget(budget) {
  return Boolean(budget && (Number(budget.total) > 0 || (budget.categories || []).some((c) => Number(c.amount) > 0)));
}

// Same accounting as app.js monthTotals: purchases + paid bills + transport + extras,
// with custom expense categories taken out of «Αγορές» / «Μικροέξοδα» (no double counting).
export function monthSpend(state = {}, month) {
  if (!MONTH.test(String(month || ''))) return { month: '', total: 0, pending: { count: 0, total: 0 }, rows: [] };
  const shoppingAll = monthlySpending(state.purchases || [], month).total;
  const tm = transportMonth(state.transport || [], month);
  const tolls = tm.byType.find((x) => x.type === 'tolls')?.total || 0;
  const transport = r2(tm.total - tolls);
  const extrasAll = extrasMonth(state.extras || [], month).total;
  const split = billsMonthSplit(state.bills || [], month);
  const bills = r2(split.rent + split.other);
  const own = expenseCategoryMonth({ purchases: state.purchases || [], extras: state.extras || [], categories: state.expenseCategories || [] }, month);
  const builtin = BUDGET_CATEGORIES.map((c) => {
    const value = c.id === 'shopping' ? own.shopping
      : c.id === 'rent' ? split.rent
      : c.id === 'bills' ? split.other
      : c.id === 'tolls' ? tolls
      : c.id === 'transport' ? transport
      : own.extras;
    return { id: c.id, label: c.label, emoji: c.emoji, value: r2(value) };
  });
  const custom = own.rows.map((c) => ({ id: c.id, label: c.name, emoji: c.emoji, value: r2(c.total), own: true }));
  const total = r2(shoppingAll + tolls + transport + extrasAll + bills);
  return { month, total, pending: { count: split.pendingCount, total: split.pending }, rows: [...builtin, ...custom] };
}

export function budgetStatus(spent, limit) {
  if (!(Number(limit) > 0)) return 'none';
  const ratio = Number(spent) / Number(limit);
  if (ratio >= 1) return 'over';
  if (ratio >= WARN_AT) return 'warn';
  return 'ok';
}

export function daysLeftInMonth(month, today) {
  if (!MONTH.test(month) || !DATE.test(today)) return 0;
  const days = daysInMonth(month);
  if (today.slice(0, 7) < month) return days;
  if (today.slice(0, 7) > month) return 0;
  return Math.max(0, days - Number(today.slice(8, 10)));
}

export function monthProjection(spent, month, today) {
  if (!MONTH.test(month) || !DATE.test(today)) return null;
  const days = daysInMonth(month);
  if (!days) return null;
  if (today.slice(0, 7) > month) return r2(spent);
  if (today.slice(0, 7) < month) return null;
  const elapsed = Math.max(1, Number(today.slice(8, 10)));
  return r2((Number(spent) / elapsed) * days);
}

export function lineProgress({ spent = 0, limit = 0, month, today }) {
  const status = budgetStatus(spent, limit);
  const remaining = Number(limit) > 0 ? r2(limit - spent) : null;
  const daysLeft = daysLeftInMonth(month, today);
  const projection = Number(limit) > 0 ? monthProjection(spent, month, today) : null;
  const pct = Number(limit) > 0 ? Math.min(999, Math.round((Number(spent) / Number(limit)) * 100)) : 0;
  return { spent: r2(spent), limit: Number(limit) > 0 ? r2(limit) : 0, remaining, daysLeft, projection, status, pct };
}

export function budgetReport(budget, spend, { today } = {}) {
  if (!hasBudget(budget) || !spend) return null;
  const limits = new Map((budget.categories || []).map((c) => [c.id, c.amount]));
  const total = lineProgress({ spent: spend.total, limit: budget.total, month: spend.month, today });
  const categories = (spend.rows || [])
    .filter((row) => limits.has(row.id))
    .map((row) => ({ ...row, ...lineProgress({ spent: row.value, limit: limits.get(row.id), month: spend.month, today }) }));
  const worst = [total.status, ...categories.map((c) => c.status)].includes('over') ? 'over'
    : [total.status, ...categories.map((c) => c.status)].includes('warn') ? 'warn'
    : total.status === 'none' && !categories.length ? 'none'
    : 'ok';
  return { month: spend.month, total, categories, pending: spend.pending, status: worst };
}

// Notify at 80% and again if later exceeded. Per device / month (not closed-app push).
export function shouldNotify(prev, { month, level }) {
  if (!level || (level !== 'warn' && level !== 'over') || !MONTH.test(month || '')) return false;
  if (!prev || prev.month !== month) return true;
  const rank = { warn: 1, over: 2 };
  return (rank[level] || 0) > (rank[prev.level] || 0);
}

export const BUDGET_EN = {
  'Προϋπολογισμός μήνα': 'Monthly budget',
  'Βάλε ένα συνολικό όριο και, αν θέλεις, όρια ανά κατηγορία. Μετράνε τα ίδια έξοδα με το «Σύνολο εξόδων μήνα».': 'Set an overall limit and, if you want, per-category limits. The same spending as «Monthly totals» counts.',
  'Συνολικό όριο μήνα (€)': 'Overall monthly limit (€)',
  'π.χ. 1.200': 'e.g. 1,200',
  'Όρια ανά κατηγορία (προαιρετικά)': 'Per-category limits (optional)',
  'Ξόδεψες {spent} από {limit}': 'You spent {spent} of {limit}',
  'Απομένουν {amount}': '{amount} left',
  'Ξεπέρασες το όριο κατά {amount}': 'You went over the limit by {amount}',
  'Απομένουν {count} ημέρες αυτόν τον μήνα': '{count} days left this month',
  'Απομένει 1 ημέρα αυτόν τον μήνα': '1 day left this month',
  'Αν συνεχίσεις έτσι: {amount} στο τέλος του μήνα': 'At this pace: {amount} by the end of the month',
  'Πλησιάζεις το όριο του προϋπολογισμού (80%).': 'You are approaching the budget limit (80%).',
  'Ξεπέρασες τον προϋπολογισμό του μήνα.': 'You have exceeded this month’s budget.',
  'Βάλε προϋπολογισμό μήνα': 'Set a monthly budget',
  'Αποθήκευση προϋπολογισμού': 'Save budget',
  'Αφαίρεση ορίων': 'Remove limits',
  'Ο προϋπολογισμός αποθηκεύτηκε.': 'The budget was saved.',
  'Ο προϋπολογισμός αφαιρέθηκε.': 'The budget was removed.',
  'Το ποσό του προϋπολογισμού δεν είναι έγκυρο.': 'The budget amount is not valid.',
  'Το συνολικό όριο πρέπει να είναι μεγαλύτερο από 0, ή άδειο.': 'The overall limit must be greater than 0, or empty.',
  'Βάλε συνολικό όριο ή τουλάχιστον ένα όριο κατηγορίας.': 'Enter an overall limit or at least one category limit.',
  'Κάρτα προϋπολογισμού μήνα': 'Monthly budget card',
  'Φαίνεται στην αρχική όταν έχεις βάλει όριο. Μετράει τα ίδια έξοδα με το «Σύνολο εξόδων».': 'Shown on the home screen when you have set a limit. It uses the same spending as «Monthly totals».',
  'Σφάλμα': 'Error'
};
