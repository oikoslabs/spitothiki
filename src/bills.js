// Household bills: amount, due date, recurrence, paid/unpaid, reminders and stats. Synced as kind "bills".
export const BILL_TYPES = ['electricity', 'water', 'gas', 'rent', 'phone', 'internet', 'subscription', 'insurance', 'tax', 'gym', 'education', 'childcare', 'loan', 'parking', 'other'];
export const BILL_ICONS = { electricity: '💡', water: '💧', gas: '🔥', rent: '🏠', phone: '📱', internet: '🌐', subscription: '📺', insurance: '🛡️', tax: '🏛️', gym: '🏋️', education: '🎓', childcare: '🧸', loan: '🏦', parking: '🅿️', other: '📄' };
export const BILL_PERIODS = [0, 1, 2, 3, 4, 6, 12]; // months; 0 = one-off

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const newId = () => `bill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function addMonths(key, months) {
  const [y, m, d] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12); const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
const addDays = (key, days) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

const TYPE_WORDS = [
  ['electricity', /ΔΕΗ|DEI|ΡΕΥΜ|ΗΛΕΚΤΡ|HERON|PROTERGIA|ELPEDISON|WATT|ZENITH|NRG|VOLTON|ΗΡΩΝ/],
  ['water', /ΕΥΔΑΠ|EYDAP|ΕΥΑΘ|ΔΕΥΑ|ΝΕΡΟ|ΥΔΡΕΥΣ/],
  ['gas', /ΑΕΡΙΟ|ΕΠΑ|ΦΥΣΙΚ|GAS|ΠΕΤΡΕΛΑΙ/],
  ['rent', /ΕΝΟΙΚ|RENT|ΚΟΙΝΟΧΡΗΣΤ/],
  ['internet', /INTERNET|ΙΝΤΕΡΝΕΤ|FIBER|FIBRE|ΟΠΤΙΚ/],
  ['phone', /COSMOTE|VODAFONE|NOVA|WIND|ΚΙΝΗΤ|ΤΗΛΕΦ|ΟΤΕ/],
  ['subscription', /NETFLIX|SPOTIFY|DISNEY|YOUTUBE|HBO|APPLE|ICLOUD|GOOGLE ONE|AMAZON|PRIME|ΣΥΝΔΡΟΜ|ΓΥΜΝΑΣΤ|GYM/],
  ['insurance', /ΑΣΦΑΛ|INSURANCE|INTERAMERICAN|ΕΘΝΙΚΗ ΑΣΦ|ERGO|ALLIANZ|GENERALI/],
  ['tax', /ΕΝΦΙΑ|ΕΦΟΡΙ|ΑΑΔΕ|AADE|ΤΕΛΗ ΚΥΚΛ|ΦΟΡΟ|ΕΦΚΑ|ΔΗΜΟΣ/]
];
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('el-GR');
export function guessBillType(name) {
  const text = plain(name);
  return (TYPE_WORDS.find(([, re]) => re.test(text)) || ['other'])[0];
}

export function createBill(input = {}, now = new Date().toISOString()) {
  const name = String(input.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Γράψε όνομα λογαριασμού.');
  const amount = round2(input.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) throw new Error('Το ποσό πρέπει να είναι από 0 έως 100.000 €.');
  const due = String(input.due || '');
  if (!DATE.test(due)) throw new Error('Διάλεξε ημερομηνία λήξης.');
  const period = BILL_PERIODS.includes(Number(input.period)) ? Number(input.period) : 0;
  const remind = Math.min(30, Math.max(0, Math.round(Number(input.remind ?? 3)) || 0));
  const type = BILL_TYPES.includes(input.type) ? input.type : guessBillType(name);
  return {
    id: input.id || newId(), name, type, amount, due, period, remind,
    reference: String(input.reference || '').replace(/\s+/g, '').slice(0, 40),
    paid: Boolean(input.paid), paidAt: input.paid ? String(input.paidAt || '') : '',
    billingFrom: DATE.test(String(input.billingFrom || '')) ? input.billingFrom : '', billingTo: DATE.test(String(input.billingTo || '')) ? input.billingTo : '',
    autoPay: Boolean(input.autoPay),
    ...(input.presetId ? { presetId: String(input.presetId).slice(0, 20) } : {}),
    seriesId: input.seriesId || input.id || '', updatedAt: now
  };
}

// Marks a bill paid; a recurring one gets its next instance (once), with the same amount as a starting guess.
export function payBill(bills = [], id, today, now = new Date().toISOString()) {
  const bill = bills.find((b) => b.id === id);
  if (!bill || bill.paid) return { bills, next: null };
  const series = bill.seriesId || bill.id;
  const paid = { ...bill, paid: true, paidAt: today, seriesId: series, updatedAt: now };
  let next = null;
  if (bill.period) {
    const due = addMonths(bill.due, bill.period);
    if (!bills.some((b) => (b.seriesId || b.id) === series && b.due === due)) {
      next = { ...bill, id: `${series}-${due}`, due, paid: false, paidAt: '', billingFrom: '', billingTo: '', seriesId: series, updatedAt: now };
    }
  }
  return { bills: [...bills.map((b) => (b.id === id ? paid : b)), ...(next ? [next] : [])], next };
}

export function unpayBill(bills = [], id, now = new Date().toISOString()) {
  return bills.map((b) => (b.id === id ? { ...b, paid: false, paidAt: '', updatedAt: now } : b));
}

// Unpaid bills to remind about: overdue, or within each bill's own reminder window.
export function billsDue(bills = [], today) {
  return bills.filter((b) => !b.paid && !b.autoPay && DATE.test(b.due) && addDays(today, Number(b.remind ?? 3)) >= b.due)
    .map((b) => ({ ...b, days: daysBetween(today, b.due), overdue: b.due < today }))
    .sort((a, b) => a.due.localeCompare(b.due));
}

// A bill counts only once it is paid (v1.6.11), and it counts in the month it BELONGS to: its due date (v1.6.12).
// v1.6.11 used the day «Πληρώθηκε» was pressed, so past months' bills entered and ticked in October all piled up in
// October. Unpaid bills (also not-yet-run direct debits) are never in the totals; they are shown apart.
// The bill's own dates win: due date, else the end of its billing period; the payment day only as a last resort.
// Never the day it was scanned or ticked when the bill has a date of its own.
export const billSpentDate = (b) => {
  if (!b?.paid) return '';
  for (const d of [b.due, b.billingTo, b.billingFrom, b.paidAt]) if (DATE.test(String(d || ''))) return d;
  return '';
};

// Monthly totals for a year (paid bills, by due month) and totals per type; unpaid ones of the year apart.
export function billStats(bills = [], year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, total: 0, paid: 0 }));
  const byType = {}; const pending = { count: 0, total: 0 };
  for (const b of bills) {
    if (!b.paid) { if (String(b.due).startsWith(`${year}-`)) { pending.count += 1; pending.total = round2(pending.total + b.amount); } continue; }
    const when = billSpentDate(b);
    if (!when.startsWith(`${year}-`)) continue;
    const row = months[Number(when.slice(5, 7)) - 1];
    row.total = round2(row.total + b.amount); row.paid = row.total;
    byType[b.type] = round2((byType[b.type] || 0) + b.amount);
  }
  const total = round2(months.reduce((s, m) => s + m.total, 0));
  return { months, total, pending, byType: Object.entries(byType).map(([type, value]) => ({ type, total: value })).sort((a, b) => b.total - a.total) };
}

// ---------- Scanning codes on bills ----------
// RF creditor reference (ISO 11649), e.g. the 25-character "Κωδικός πληρωμής RF" on Greek bills.
export function validRf(code) {
  const c = String(code || '').replace(/\s+/g, '').toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(c)) return false;
  const moved = (c.slice(4) + c.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let rem = 0; for (const digit of moved) rem = (rem * 10 + Number(digit)) % 97;
  return rem === 1;
}

// Scanned text -> what we can prefill. Understands EPC/SEPA QR ("BCD"), RF references anywhere in the text,
// and otherwise keeps a long numeric barcode as the payment reference.
export function parseBillCode(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lines = raw.split(/\r?\n/);
  if (lines[0] === 'BCD' && lines.length >= 7) {
    const amountMatch = (lines[7] || '').match(/^EUR(\d+(?:\.\d{1,2})?)$/);
    const ref = (lines[9] || '').trim() || (lines[10] || '').trim();
    return { kind: 'epc', name: (lines[5] || '').trim(), iban: (lines[6] || '').trim(), amount: amountMatch ? Number(amountMatch[1]) : null, reference: ref.replace(/\s+/g, ''), rfValid: validRf(ref) };
  }
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  const rf = compact.match(/RF\d{2}[A-Z0-9]{1,21}/);
  if (rf) {
    // Codes are often embedded in longer barcodes; take the longest prefix that validates.
    for (let len = rf[0].length; len >= 5; len--) { const candidate = rf[0].slice(0, len); if (validRf(candidate)) return { kind: 'rf', reference: candidate, rfValid: true, amount: null, name: '' }; }
    return { kind: 'rf', reference: rf[0], rfValid: false, amount: null, name: '' };
  }
  if (/^\d{10,40}$/.test(compact)) return { kind: 'barcode', reference: compact, rfValid: false, amount: null, name: '' };
  if (/^https?:\/\//i.test(raw)) return { kind: 'url', reference: '', url: raw, amount: null, name: '' };
  return { kind: 'text', reference: compact.slice(0, 40), rfValid: false, amount: null, name: '' };
}

// Unpaid bills, overdue first then by due date (overdue ones are simply the earliest due dates).
export const unpaidBills = (bills = []) => bills.filter((b) => !b.paid && !b.autoPay).sort((a, b) => String(a.due).localeCompare(String(b.due)) || String(a.name).localeCompare(String(b.name)));

// Paid history: filter ('' | 'type:<type>' | 'name:<provider>'), newest first, grouped by paid month, paged by limit.
export function paidHistory(bills = [], { filter = '', limit = 10 } = {}) {
  const all = bills.filter((b) => b.paid);
  const [field, ...rest] = String(filter).split(':');
  const value = rest.join(':');
  const matches = (b) => !filter || (field === 'type' ? b.type === value : field === 'name' ? String(b.name).trim().toLocaleLowerCase('el-GR') === value.toLocaleLowerCase('el-GR') : true);
  // v1.6.12: grouped by the month the bill belongs to (due date), same as the totals; newest payment first inside.
  const when = (b) => String(b.due || '');
  const list = all.filter(matches).sort((a, b) => when(b).localeCompare(when(a)) || String(b.paidAt || '').localeCompare(String(a.paidAt || '')));
  const shown = list.slice(0, Math.max(1, limit));
  const groups = [];
  for (const bill of shown) {
    const month = when(bill).slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.month !== month) groups.push(group = { month, bills: [], total: 0 });
    group.bills.push(bill);
    group.total = Math.round((group.total + Number(bill.amount || 0)) * 100) / 100;
  }
  const types = [...new Set(all.map((b) => b.type))].sort();
  const names = [...new Map(all.map((b) => [String(b.name).trim().toLocaleLowerCase('el-GR'), String(b.name).trim()])).values()].sort((a, b) => a.localeCompare(b, 'el'));
  return { count: all.length, matched: list.length, shown: shown.length, more: list.length - shown.length, groups, types, names };
}

// ---------- Direct debit («Πληρώνεται με πάγια εντολή») ----------
// Not "to pay", no due/overdue warnings; on the due date they are marked paid automatically (a recurring one
// gets its next instance, like a manual payment). Totals count each bill once, by due month, as before.
export const scheduledDebits = (bills = []) => bills.filter((b) => !b.paid && b.autoPay).sort((a, b) => String(a.due).localeCompare(String(b.due)));
export function applyAutoPay(bills = [], today, now = new Date().toISOString()) {
  let out = bills; const paid = [];
  for (let guard = 0; guard < 500; guard++) {
    const bill = out.find((b) => !b.paid && b.autoPay && DATE.test(b.due) && b.due <= today);
    if (!bill) break;
    out = payBill(out, bill.id, bill.due, now).bills;
    paid.push(bill.id);
  }
  return { bills: out, paid };
}
// Remembered per provider: the latest bill with the same name decides the default for a new one.
export function autoPayFor(bills = [], name) {
  const key = plain(name).replace(/[^A-ZΑ-Ω0-9]/g, '');
  if (!key) return false;
  const same = bills.filter((b) => plain(b.name).replace(/[^A-ZΑ-Ω0-9]/g, '') === key).sort((a, b) => String(b.due).localeCompare(String(a.due)));
  return Boolean(same[0]?.autoPay);
}

// Bills due in a month, with rent/common charges split out so they show as their own expense row.
// v1.6.12: what makes up a month's bills figure (paid, by due month), biggest first, so anyone can check the number.
export function billsMonthList(bills = [], month) {
  return bills.filter((b) => billSpentDate(b).startsWith(`${month}-`))
    .map((b) => ({ id: b.id, name: b.name, type: b.type, amount: round2(b.amount), due: b.due, paidAt: DATE.test(String(b.paidAt || '')) ? b.paidAt : '', autoPay: Boolean(b.autoPay) }))
    .sort((a, b) => b.amount - a.amount || a.due.localeCompare(b.due));
}
export function billsMonthSplit(bills = [], month) {
  let rent = 0; let other = 0; let pending = 0; let pendingCount = 0;
  for (const b of bills) {
    if (!b.paid) { if (String(b.due).startsWith(`${month}-`)) { pending += b.amount; pendingCount += 1; } continue; }
    if (!billSpentDate(b).startsWith(`${month}-`)) continue;
    if (b.type === 'rent') rent += b.amount; else other += b.amount;
  }
  return { rent: round2(rent), other: round2(other), pending: round2(pending), pendingCount };
}
