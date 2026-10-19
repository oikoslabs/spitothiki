// Small daily expenses ("Μικροέξοδα"): coffee, snacks, tobacco… Pure functions (unit-tested).
// Buttons are the user's own: typing an item once (name + price) creates a button; one tap then re-uses the last price.
// v1 had five fixed default categories. They survive only if they have entries (migration, see extraCategories).
export const LEGACY_EXTRA_CATEGORIES = [
  { id: 'coffee', name: 'Καφές', emoji: '☕' },
  { id: 'snack', name: 'Σάντουιτς / φαγητό στο πόδι', emoji: '🥪' },
  { id: 'tobacco', name: 'Καπνός', emoji: '🚬' },
  { id: 'papers', name: 'Χαρτάκια', emoji: '📄' },
  { id: 'filters', name: 'Φιλτράκια', emoji: '🔘' }
];
export const DEFAULT_EXTRA_CATEGORIES = LEGACY_EXTRA_CATEGORIES; // kept for older imports
// Faint suggestion chips shown while the user has no buttons; tapping one asks the price and creates it.
export const EXTRA_SUGGESTIONS = [
  { id: 'coffee', name: 'Καφές', emoji: '☕' },
  { id: 'snack', name: 'Σνακ', emoji: '🥪' },
  { id: 'tobacco', name: 'Καπνός', emoji: '🚬' },
  { id: 'newspaper', name: 'Εφημερίδα', emoji: '📰' }
];
export const EXTRA_DEFAULT_EMOJI = '🧾';
const FIXED_IDS = new Set([...LEGACY_EXTRA_CATEGORIES, ...EXTRA_SUGGESTIONS].map((c) => c.id));

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export const foldName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('el-GR');
// First grapheme (an emoji can be several code points).
function cleanEmoji(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const parts = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(s)].map((x) => x.segment) : [...s];
  return (parts[0] || '').slice(0, 16);
}

// Emoji guess from the item name (Greek or English); '' when nothing fits.
const EMOJI_HINTS = [
  [/καφ|φρεντο|freddo|espresso|εσπρεσ|καπουτσ|cappuc|latte|coffee|nescaf|φραπε|frappe/, '☕'],
  [/τσαι|tea\b/, '🍵'],
  [/σαντουιτσ|sandwich|τοστ|toast|κουλουρ|πιτα|σουβλακ|σνακ|snack|μπουγατσ|τυροπιτ|σπανακοπ|κρουασαν|croissant|μπαγκετ/, '🥪'],
  [/τσιγαρ|καπν|tobacco|cigar|στριφτ/, '🚬'],
  [/χαρτακ|rolling|papers/, '📄'],
  [/φιλτρ|filter/, '🔘'],
  [/εφημερ|περιοδικ|newspaper|magazine/, '📰'],
  [/νερο|water/, '💧'],
  [/μπυρ|beer/, '🍺'],
  [/κρασ|wine/, '🍷'],
  [/αναψυκ|cola|κοκα|soda|πορτοκαλαδ|ενεργειακ|energy|red ?bull|monster/, '🥤'],
  [/χυμ|juice/, '🧃'],
  [/λαχει|λοττο|lotto|τζοκερ|joker|ξυστ|στοιχημ|bet/, '🎟️'],
  [/σοκολατ|chocolate|γκοφρετ|μπαρα/, '🍫'],
  [/παγωτ|ice ?cream/, '🍦'],
  [/τσιχλ|gum|καραμελ|candy|γλυκ|sweet/, '🍬'],
  [/πατατακ|chips|γαριδακ/, '🍟'],
  [/παρκινγκ|parking|σταθμευσ/, '🅿️'],
  [/εισιτηρ|ticket|μετρο|λεωφορ|metro|bus/, '🎫']
];
export function suggestEmoji(name) {
  const n = foldName(name);
  if (!n) return '';
  for (const [re, emoji] of EMOJI_HINTS) if (re.test(n)) return emoji;
  return '';
}

// Visible buttons: the user's stored categories plus, for users of v1, any old default category that
// already has entries (unless they deleted it). Sorted by how often they are used, then most recently used.
export function extraCategories(stored = [], entries = []) {
  const byId = new Map(stored.map((c) => [c.id, c]));
  const uses = new Map();
  for (const e of entries) {
    const u = uses.get(e.category) || { count: 0, last: '' };
    u.count += 1;
    const at = `${e.date}|${e.createdAt || ''}`;
    if (at > u.last) u.last = at;
    uses.set(e.category, u);
  }
  const out = [];
  for (const c of stored) if (!c.hidden && c.name) out.push({ id: c.id, name: c.name, emoji: c.emoji || '', createdAt: c.createdAt || '', legacy: false });
  for (const d of LEGACY_EXTRA_CATEGORIES) {
    if (byId.has(d.id) || !uses.has(d.id)) continue; // stored (renamed/hidden) or never used → not shown
    out.push({ id: d.id, name: d.name, emoji: d.emoji, createdAt: '', legacy: true });
  }
  for (const c of out) { const u = uses.get(c.id); c.uses = u?.count || 0; c.lastUsed = u?.last || ''; }
  return out.sort((a, b) => b.uses - a.uses || b.lastUsed.localeCompare(a.lastUsed) || String(a.createdAt).localeCompare(String(b.createdAt)) || a.name.localeCompare(b.name));
}

// Finds a visible button by name (accents/case ignored).
export const findExtraCategory = (categories, name) => categories.find((c) => foldName(c.name) === foldName(name)) || null;

// New button, or rename (input.id = an existing button). The emoji falls back to a guess from the name.
export function createExtraCategory(input = {}, stored = [], now = new Date().toISOString(), entries = []) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) throw new Error('Γράψε ένα όνομα κατηγορίας.');
  const id = input.id || makeId('xc');
  if (extraCategories(stored, entries).some((c) => c.id !== id && foldName(c.name) === foldName(name))) throw new Error('Υπάρχει ήδη κατηγορία με αυτό το όνομα.');
  const old = stored.find((c) => c.id === id);
  const emoji = input.emoji === undefined || String(input.emoji).trim() === '' ? (input.keepEmptyEmoji ? '' : suggestEmoji(name)) : cleanEmoji(input.emoji);
  return { id, name, emoji, createdAt: (old && !old.hidden && old.createdAt) || input.createdAt || now, updatedAt: now };
}

// Next stored list after deleting a button. Ids that could come back on their own (old defaults with
// entries, suggestion ids) are kept as a hidden marker so they stay deleted on every synced device.
export function deleteExtraCategory(stored = [], id, now = new Date().toISOString()) {
  const rest = stored.filter((c) => c.id !== id);
  return FIXED_IDS.has(id) ? [...rest, { id, hidden: true, createdAt: now, updatedAt: now }] : rest;
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
