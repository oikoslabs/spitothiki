// House chores («Δουλειές σπιτιού»): every-N-days tasks with last/next dates, who did it and a history. Pure functions (unit-tested).
export const CHORE_SUGGESTIONS = [
  { name: 'Σκούπισμα', emoji: '🧹', every: 3 }, { name: 'Σφουγγάρισμα', emoji: '🪣', every: 7 }, { name: 'Ξεσκόνισμα', emoji: '🪶', every: 7 },
  { name: 'Πότισμα φυτών', emoji: '🌿', every: 2 }, { name: 'Αλλαγή σεντονιών', emoji: '🛏️', every: 14 }, { name: 'Καθαρισμός ψυγείου', emoji: '🧊', every: 30 },
  { name: 'Μπάνιο', emoji: '🚽', every: 7 }, { name: 'Σκουπίδια', emoji: '🗑️', every: 2 }, { name: 'Πλυντήριο', emoji: '🧺', every: 3 }
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const makeId = () => globalThis.crypto?.randomUUID?.() || `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clean = (s, n) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, n);

export function createChore(input = {}, today, now = new Date().toISOString()) {
  const name = clean(input.name, 50);
  if (!name) throw new Error('Γράψε τι δουλειά είναι.');
  const every = Math.round(Number(String(input.every ?? '').replace(',', '.')));
  if (!Number.isFinite(every) || every < 1 || every > 365) throw new Error('Διάλεξε κάθε πόσες μέρες (1 έως 365).');
  const sugg = CHORE_SUGGESTIONS.find((s) => s.name === name);
  const chore = { id: input.id || makeId(), name, emoji: clean(input.emoji, 8) || sugg?.emoji || '🧽', every, remind: input.remind !== false && input.remind !== 'off', assignee: clean(input.assignee, 30),
    history: Array.isArray(input.history) ? input.history.slice(-100) : [], start: DATE.test(input.start || '') ? input.start : today, createdAt: input.createdAt || now, updatedAt: now };
  return chore;
}

export const lastDone = (chore) => chore.history?.length ? chore.history[chore.history.length - 1].date : '';
export const nextDue = (chore) => { const last = lastDone(chore); return last ? addDays(last, chore.every) : chore.start; };

// late (red) / today (orange) / ok (green)
export function choreStatus(chore, today) {
  const next = nextDue(chore);
  return next < today ? 'late' : next === today ? 'today' : 'ok';
}

export function sortChores(chores = [], today) {
  const rank = { late: 0, today: 1, ok: 2 };
  return [...chores].sort((a, b) => rank[choreStatus(a, today)] - rank[choreStatus(b, today)] || nextDue(a).localeCompare(nextDue(b)) || a.name.localeCompare(b.name));
}

export function choresSummary(chores = [], today) {
  const out = { late: 0, today: 0, ok: 0 };
  for (const c of chores) out[choreStatus(c, today)] += 1;
  return out;
}

export function markDone(chore, { date, by = '' }, now = new Date().toISOString()) {
  if (!DATE.test(date || '')) throw new Error('Διάλεξε ημερομηνία.');
  const history = [...(chore.history || []), { date, by: clean(by, 30), at: now }].sort((a, b) => a.date.localeCompare(b.date) || String(a.at).localeCompare(String(b.at))).slice(-100);
  return { ...chore, history, updatedAt: now };
}

// Undo the most recently tapped ✓ (by tap time, not by date).
export function undoDone(chore, now = new Date().toISOString()) {
  const h = [...(chore.history || [])];
  if (!h.length) return chore;
  let idx = 0; h.forEach((e, i) => { if (String(e.at) >= String(h[idx].at)) idx = i; });
  h.splice(idx, 1);
  return { ...chore, history: h, updatedAt: now };
}

export function historyCounts(chore, today, days = 30) {
  const since = addDays(today, -days);
  const rows = (chore.history || []).filter((e) => e.date > since);
  const by = {};
  for (const e of rows) { const k = e.by || ''; by[k] = (by[k] || 0) + 1; }
  return { total: rows.length, by: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) };
}

export function choreMembers(chores = [], extra = []) {
  const set = new Set();
  for (const n of extra) if (clean(n, 30)) set.add(clean(n, 30));
  for (const c of chores) { if (c.assignee) set.add(c.assignee); for (const e of c.history || []) if (e.by) set.add(e.by); }
  return [...set].slice(0, 12);
}

// Chores with reminder on that are due or late today (for the one daily reminder).
export const choresDueToday = (chores = [], today) => sortChores(chores.filter((c) => c.remind && nextDue(c) <= today), today);

// Push wake-up dates (today … +90). v1.6.11: a chore keeps reminding EVERY morning from its due day until it is
// marked done (before, a late chore got only the day of the last app open, so the phone went quiet after day one).
// A Set, so never more than one wake-up per day; the service worker then shows one combined chores notification.
export function choreDates(chores = [], today) {
  const end = addDays(today, 90); const out = new Set();
  for (const c of chores) {
    if (!c.remind) continue;
    const n = nextDue(c);
    for (let d = n < today ? today : n; d <= end && out.size < 91; d = addDays(d, 1)) out.add(d);
  }
  return [...out].sort();
}

// The one daily chores notification (app open or service worker): title with up to 4 names, or null if nothing is
// due / it was already shown today (`last` = the day it was last shown).
export function choreNotice(chores = [], today, last = '') {
  const due = choresDueToday(chores, today);
  if (!due.length || last === today) return null;
  return { names: due.slice(0, 4).map((c) => c.name), more: due.length > 4, count: due.length };
}
