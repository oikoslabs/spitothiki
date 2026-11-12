// Home card «Τι άλλαξε αυτόν τον μήνα»: 1–3 short comparisons of this month so far
// against the same days of the previous month. Computed only from the user's local
// expenses — nothing is sent anywhere. Pure helpers (unit-tested).
import { shiftMonth } from './features.js';
import { billCountInfo } from './bills.js';
import { expenseCategories, purchaseShares } from './expense-cats.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const inRange = (date, from, to) => {
  const d = String(date || '').slice(0, 10);
  return DATE.test(d) && d >= from && d <= to;
};

export function daysInMonth(month) {
  const [y, m] = String(month || '').split('-').map(Number);
  if (!y || !m) return 0;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// today (YYYY-MM-DD, local) → current month-to-date and the same day-span last month
// (clamped if the previous month is shorter, e.g. 31 March vs 28 February).
export function monthToDateWindows(today) {
  if (!DATE.test(today)) return null;
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const prev = shiftMonth(month, -1);
  const prevDay = Math.min(day, daysInMonth(prev));
  return {
    current: { from: `${month}-01`, to: today, month },
    previous: { from: `${prev}-01`, to: `${prev}-${String(prevDay).padStart(2, '0')}`, month: prev }
  };
}

const CAT_META = {
  shopping: { id: 'shopping', label: 'Αγορές' },
  rent: { id: 'rent', label: 'Ενοίκιο / κοινόχρηστα' },
  bills: { id: 'bills', label: 'Λογαριασμοί' },
  tolls: { id: 'tolls', label: 'Διόδια' },
  transport: { id: 'transport', label: 'Μετακινήσεις' },
  extras: { id: 'extras', label: 'Μικροέξοδα' }
};

// Same accounting as the home / «Σύνολο εξόδων» month totals, but for an inclusive date range.
export function periodTotals(state = {}, from, to) {
  const purchases = state.purchases || [];
  const extras = state.extras || [];
  const transport = state.transport || [];
  const bills = state.bills || [];
  const cats = expenseCategories(state.expenseCategories || []);
  const valid = new Set(cats.map((c) => c.id));
  const own = new Map(cats.map((c) => [c.id, 0]));
  let shopping = 0, extrasLeft = 0, rent = 0, otherBills = 0, tolls = 0, transportLeft = 0;

  for (const p of purchases) {
    if (!inRange(p.date, from, to) || !Number.isFinite(Number(p.price))) continue;
    for (const s of purchaseShares(p, valid)) {
      if (s.category) own.set(s.category, r2(own.get(s.category) + s.amount));
      else shopping = r2(shopping + s.amount);
    }
  }
  for (const e of extras) {
    if (!inRange(e.date, from, to)) continue;
    const a = Number(e.amount) || 0;
    if (e.expenseCategory && valid.has(e.expenseCategory)) own.set(e.expenseCategory, r2(own.get(e.expenseCategory) + a));
    else extrasLeft = r2(extrasLeft + a);
  }
  for (const e of transport) {
    if (!inRange(e.date, from, to)) continue;
    const a = Number(e.amount) || 0;
    if (e.type === 'tolls') tolls = r2(tolls + a);
    else transportLeft = r2(transportLeft + a);
  }
  const info = billCountInfo(bills);
  for (const b of bills) {
    if (!b.paid) continue;
    const when = info.get(b)?.date || '';
    if (!inRange(when, from, to)) continue;
    if (b.type === 'rent') rent = r2(rent + (Number(b.amount) || 0));
    else otherBills = r2(otherBills + (Number(b.amount) || 0));
  }

  const rows = [
    { ...CAT_META.shopping, value: shopping },
    { ...CAT_META.rent, value: rent },
    { ...CAT_META.bills, value: otherBills },
    { ...CAT_META.tolls, value: tolls },
    { ...CAT_META.transport, value: transportLeft },
    { ...CAT_META.extras, value: extrasLeft },
    ...cats.map((c) => ({ id: c.id, label: c.name, value: own.get(c.id) || 0, own: true }))
  ];
  const total = r2(rows.reduce((s, r) => s + r.value, 0));
  return { from, to, total, rows };
}

const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);
const almostSame = (cur, prev) => Math.abs(cur - prev) < 1 || Math.abs(pct(cur, prev) || 0) < 1;

// 1–3 insights, or [] when there is not enough to compare (no spending this period or last).
export function monthInsights(state, today, { limit = 3 } = {}) {
  const win = monthToDateWindows(today);
  if (!win) return [];
  const current = periodTotals(state, win.current.from, win.current.to);
  const previous = periodTotals(state, win.previous.from, win.previous.to);
  if (!(current.total > 0) || !(previous.total > 0)) return [];

  const out = [];
  const overallPct = pct(current.total, previous.total);
  const overall = almostSame(current.total, previous.total)
    ? { id: 'total-same', kind: 'total', dir: 'same', percent: 0, current: current.total, previous: previous.total }
    : { id: overallPct > 0 ? 'total-up' : 'total-down', kind: 'total', dir: overallPct > 0 ? 'up' : 'down', percent: Math.abs(overallPct), current: current.total, previous: previous.total };

  const changes = current.rows.map((row, i) => {
    const prev = previous.rows[i]?.value || 0;
    const cur = row.value || 0;
    if (!(cur > 0) && !(prev > 0)) return null;
    const change = r2(cur - prev);
    const percent = prev > 0 ? pct(cur, prev) : (cur > 0 ? 100 : 0);
    return { ...row, previous: prev, current: cur, change, percent, dir: almostSame(cur, prev) ? 'same' : (change > 0 ? 'up' : 'down') };
  }).filter(Boolean);

  // Prefer a category that really moved (and is not almost the whole total, which would repeat the headline).
  const meaningful = changes.filter((c) => c.dir !== 'same' && Math.abs(c.change) >= 1);
  meaningful.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || Math.abs(b.percent) - Math.abs(a.percent));
  const dominant = (c) => current.total > 0 && c.current / current.total >= 0.85 && c.dir === overall.dir;

  for (const c of meaningful) {
    if (out.length >= limit) break;
    if (dominant(c) && overall.dir !== 'same') continue;
    out.push({
      id: `cat-${c.dir}-${c.id}`,
      kind: 'category',
      dir: c.dir,
      percent: Math.abs(c.percent || 0),
      categoryId: c.id,
      label: c.label,
      current: c.current,
      previous: c.previous
    });
  }

  // Overall first when it moved, or when we have no category line yet.
  if (overall.dir !== 'same' || !out.length) {
    const room = out.length < limit;
    if (room) out.unshift(overall);
    else if (overall.dir !== 'same') { out.pop(); out.unshift(overall); }
  }

  return out.slice(0, limit);
}

export const MONTH_INSIGHTS_EN = {
  'Τι άλλαξε αυτόν τον μήνα': 'What changed this month',
  'Σύγκριση με το ίδιο διάστημα του προηγούμενου μήνα': 'Compared with the same period last month',
  'Ξόδεψες {percent}% περισσότερα από τον προηγούμενο μήνα στο ίδιο διάστημα ({current} αντί για {previous}).': 'You spent {percent}% more than last month over the same period ({current} vs {previous}).',
  'Ξόδεψες {percent}% λιγότερα από τον προηγούμενο μήνα στο ίδιο διάστημα ({current} αντί για {previous}).': 'You spent {percent}% less than last month over the same period ({current} vs {previous}).',
  'Ξόδεψες περίπου τα ίδια με τον προηγούμενο μήνα στο ίδιο διάστημα ({current}).': 'You spent about the same as last month over the same period ({current}).',
  'Ξόδεψες {percent}% περισσότερα στα «{category}» από τον προηγούμενο μήνα στο ίδιο διάστημα ({current} αντί για {previous}).': 'You spent {percent}% more on “{category}” than last month over the same period ({current} vs {previous}).',
  'Ξόδεψες {percent}% λιγότερα στα «{category}» από τον προηγούμενο μήνα στο ίδιο διάστημα ({current} αντί για {previous}).': 'You spent {percent}% less on “{category}” than last month over the same period ({current} vs {previous}).',
  'Κάρτα «Τι άλλαξε αυτόν τον μήνα»': '“What changed this month” card',
  'Φαίνεται στην αρχική όταν υπάρχουν αρκετά έξοδα για σύγκριση με τον προηγούμενο μήνα. Υπολογίζεται μόνο στη συσκευή σου.': 'Shown on the home screen when there is enough spending to compare with last month. It is calculated only on your device.'
};

const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p && k in p ? p[k] : `{${k}}`));
export function insightText(insight, { t = fill, money = (n) => String(n), categoryLabel = (s) => s } = {}) {
  const current = money(insight.current);
  const previous = money(insight.previous);
  if (insight.kind === 'total' && insight.dir === 'up') {
    return t('Ξόδεψες {percent}% περισσότερα από τον προηγούμενο μήνα στο ίδιο διάστημα ({current} αντί για {previous}).', { percent: insight.percent, current, previous });
  }
  if (insight.kind === 'total' && insight.dir === 'down') {
    return t('Ξόδεψες {percent}% λιγότερα από τον προηγούμενο μήνα στο ίδιο διάστημα ({current} αντί για {previous}).', { percent: insight.percent, current, previous });
  }
  if (insight.kind === 'total') {
    return t('Ξόδεψες περίπου τα ίδια με τον προηγούμενο μήνα στο ίδιο διάστημα ({current}).', { current });
  }
  const category = categoryLabel(insight.label);
  if (insight.dir === 'up') {
    return t('Ξόδεψες {percent}% περισσότερα στα «{category}» από τον προηγούμενο μήνα στο ίδιο διάστημα ({current} αντί για {previous}).', { percent: insight.percent, category, current, previous });
  }
  return t('Ξόδεψες {percent}% λιγότερα στα «{category}» από τον προηγούμενο μήνα στο ίδιο διάστημα ({current} αντί για {previous}).', { percent: insight.percent, category, current, previous });
}
