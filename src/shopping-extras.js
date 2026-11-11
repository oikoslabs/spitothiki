// v1.9.22 (cache v122): shopping-list extras. Pure functions (unit-tested), no DOM, no network.
//  1. «Ειδοποίηση κοινής λίστας»: turns synced shopping rows saved by ANOTHER household member into short notices
//     («Μαρία πρόσθεσε γάλα»), batched so a burst of edits gives one notification. Uses only data the household
//     already syncs (the row and the uid in `by`); nothing new leaves the phone.
//  2. Quick suggestions: the names bought most often (past lists, receipts/ticked prices, recurring), on this device.
//  3. «Ξαναψώνισε τα ίδια»: the last completed list (kept in the synced `pastLists` kind, max 5) back on the list.
//  4. Note per row (brand/size): `note` on the shopping row, max NOTE_MAX characters.
import { createShoppingItem, normalizeSearch, normalizeUnit } from './domain.js';

export const NOTE_MAX = 60;
export const PAST_LISTS_MAX = 5;
const key = (name) => normalizeSearch(String(name ?? '').trim()).replace(/\s+/g, ' ');

export function cleanNote(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
}

// Sets (or clears, with '') the note of one row; returns a new list.
export function setRowNote(shopping = [], id, note) {
  const value = cleanNote(note);
  return shopping.map((row) => {
    if (row.id !== id) return row;
    const { note: _old, ...rest } = row;
    return value ? { ...rest, note: value } : rest;
  });
}

// ---------- 1. Notices for changes by other members ----------
// docs: sync rows { kind, id, data, deleted, by }; previous: shopping list before they were applied; me: own uid.
// Returns [{ by, type: 'add' | 'check' | 'edit', name }]. Deletions (e.g. «Καθάρισε τα αγορασμένα») and own
// changes (any of my devices) are never reported. Price-only/pantry bookkeeping changes are not edits.
export function shoppingChanges(previous = [], docs = [], me = '') {
  const before = new Map(previous.map((row) => [String(row.id), row]));
  const out = [];
  for (const doc of docs) {
    if (doc?.kind !== 'shopping' || doc.deleted || !doc.data || !doc.by || doc.by === me) continue;
    const row = doc.data;
    const name = String(row.name || '').trim();
    if (!name) continue;
    const old = before.get(String(doc.id));
    if (!old) { if (!row.checked) out.push({ by: doc.by, type: 'add', name }); continue; }
    if (!old.checked && row.checked) { out.push({ by: doc.by, type: 'check', name }); continue; }
    if (old.checked && !row.checked) { out.push({ by: doc.by, type: 'edit', name }); continue; }
    const changed = ['name', 'quantity', 'unit', 'note'].some((field) => String(old[field] ?? '') !== String(row[field] ?? ''));
    if (changed) out.push({ by: doc.by, type: 'edit', name });
  }
  return out;
}

const VERB = { add: '{who} πρόσθεσε {list}', check: '{who} πήρε {list}', edit: '{who} άλλαξε {list}' };
const LINE = { add: 'Πρόσθεσε: {list}', check: 'Πήρε: {list}', edit: 'Άλλαξε: {list}' };

function listOf(names, t, max = 3) {
  const seen = new Map();
  for (const n of names) if (!seen.has(key(n))) seen.set(key(n), n);
  const unique = [...seen.values()];
  const shown = unique.slice(0, max).join(', ');
  return unique.length > max ? `${shown}${t(' και {count} ακόμη', { count: unique.length - max })}` : shown;
}

// One notification for a batch: { title, body }. names: uid → display name.
export function listNoticeText(events = [], names = {}, t = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m))) {
  if (!events.length) return null;
  const who = (uid) => names[uid] || t('Ένα μέλος');
  const people = [...new Set(events.map((e) => e.by))];
  const types = ['add', 'check', 'edit'];
  const byType = (list, type) => list.filter((e) => e.type === type).map((e) => e.name);
  if (people.length === 1) {
    const mine = events;
    const present = types.filter((type) => byType(mine, type).length);
    if (present.length === 1) return { title: t(VERB[present[0]], { who: who(people[0]), list: listOf(byType(mine, present[0]), t) }), body: t('Λίστα αγορών') };
    return { title: t('{who} άλλαξε τη λίστα αγορών', { who: who(people[0]) }), body: present.map((type) => t(LINE[type], { list: listOf(byType(mine, type), t) })).join(' · ') };
  }
  const body = people.map((uid) => {
    const mine = events.filter((e) => e.by === uid);
    return `${who(uid)}: ${types.filter((type) => byType(mine, type).length).map((type) => t(LINE[type], { list: listOf(byType(mine, type), t, 2) })).join(', ')}`;
  }).join(' · ');
  return { title: t('Αλλαγές στη λίστα αγορών'), body };
}

// Collects events and flushes them as ONE batch: after `quiet` ms without new events (or `maxWait` ms after the
// first one), and never sooner than `gap` ms after the previous flush (later events wait and join the next batch).
export function createNoticeBatcher({ onFlush, quiet = 20_000, maxWait = 60_000, gap = 120_000, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let pending = [];
  let first = 0;
  let last = -Infinity;
  let timer = null;
  const schedule = () => {
    if (timer) clearTimer(timer);
    const at = Math.max(Math.min(now() + quiet, first + maxWait), last + gap);
    timer = setTimer(flush, Math.max(0, at - now()));
  };
  function flush() {
    timer = null;
    if (!pending.length) return;
    const batch = pending;
    pending = []; first = 0; last = now();
    onFlush?.(batch);
  }
  return {
    push(events = []) {
      if (!events.length) return;
      if (!pending.length) first = now();
      pending.push(...events);
      schedule();
    },
    cancel() { if (timer) clearTimer(timer); timer = null; pending = []; },
    get size() { return pending.length; },
    flushNow: flush
  };
}

// ---------- 2. Quick suggestions ----------
// The names this household buys most often, as one-tap chips. Sources (all already on the device): rows of past
// completed lists (weight 2), purchases with a product name (ticked prices, receipt lines, cart; not whole-receipt
// totals), recurring rules and ticked rows of the current list. Names already pending on the list are skipped.
// query: filter while typing (accent/case-insensitive, word prefix or contained).
export function quickSuggestions(state = {}, { query = '', limit = 8 } = {}) {
  const tally = new Map();
  const add = (row, weight, at = '') => {
    const name = String(row?.name || '').trim();
    const k = key(name);
    if (!k || k.length < 2) return;
    const entry = tally.get(k) || { name, score: 0, at: '', unit: '', quantity: 1, category: '', note: '', itemId: '' };
    entry.score += weight;
    if (String(at) >= entry.at) {
      Object.assign(entry, { name, at: String(at) });
      if (row.unit) entry.unit = normalizeUnit(row.unit);
      if (Number(row.quantity) > 0 && row.quantity !== undefined) entry.quantity = Number(row.quantity);
      if (row.category) entry.category = row.category;
      if (row.note) entry.note = row.note;
      if (row.itemId) entry.itemId = row.itemId;
    }
    tally.set(k, entry);
  };
  for (const list of state.pastLists || []) for (const row of list.rows || []) add(row, 2, list.at);
  for (const p of state.purchases || []) {
    if (p.receiptId && p.id === `pur-${p.receiptId}`) continue; // whole-receipt total: the name is the store
    add({ name: p.name, category: p.category }, 1, p.date);
  }
  for (const rule of state.recurring || []) add(rule, 1, '');
  for (const row of state.shopping || []) if (row.checked) add(row, 1, row.createdAt);
  const pending = new Set((state.shopping || []).filter((row) => !row.checked).map((row) => key(row.name)));
  const q = key(query);
  return [...tally.entries()]
    .filter(([k]) => !pending.has(k) && (!q || k.startsWith(q) || k.includes(` ${q}`) || (q.length >= 3 && k.includes(q))))
    .sort((a, b) => b[1].score - a[1].score || String(b[1].at).localeCompare(String(a[1].at)) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([, e]) => ({ name: e.name, quantity: e.quantity, unit: e.unit || 'τεμ.', ...(e.category ? { category: e.category } : {}), ...(e.note ? { note: e.note } : {}), ...(e.itemId ? { itemId: e.itemId } : {}) }));
}

// ---------- 3. «Ξαναψώνισε τα ίδια» ----------
const pastRow = (row) => ({ name: String(row.name), quantity: Number(row.quantity) || 1, unit: normalizeUnit(row.unit), ...(row.category ? { category: row.category } : {}), ...(row.note ? { note: cleanNote(row.note) } : {}), ...(row.itemId ? { itemId: String(row.itemId) } : {}) });

// Remembers the ticked rows as a completed list (newest first, at most PAST_LISTS_MAX). Returns the new pastLists.
export function archiveChecked(pastLists = [], shopping = [], now = new Date().toISOString()) {
  const rows = shopping.filter((row) => row.checked && String(row.name || '').trim()).map(pastRow);
  if (!rows.length) return pastLists;
  const id = `list-${now.replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(16).slice(2, 6)}`;
  return [{ id, at: now, rows }, ...pastLists].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, PAST_LISTS_MAX);
}

export const lastList = (pastLists = []) => [...pastLists].sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null;

// What «Ξαναψώνισε τα ίδια» would bring back: the ticked rows of the current list if there are any (the trip just
// finished), else the last completed list. { source: 'checked' | 'last' | '', rows }.
export function reshopSource(shopping = [], pastLists = []) {
  const checked = shopping.filter((row) => row.checked);
  if (checked.length) return { source: 'checked', rows: checked.map(pastRow) };
  const last = lastList(pastLists);
  return last?.rows?.length ? { source: 'last', rows: last.rows } : { source: '', rows: [] };
}

// Puts the rows back on the list as new pending rows (names already pending are skipped). With source 'checked'
// the ticked rows are archived first and removed, so the pantry/prices they recorded stay as they are.
export function reshop(state = {}, now = new Date().toISOString()) {
  const shopping = state.shopping || [];
  const { source, rows } = reshopSource(shopping, state.pastLists || []);
  if (!source) return { shopping, pastLists: state.pastLists || [], added: 0, source };
  const pastLists = source === 'checked' ? archiveChecked(state.pastLists || [], shopping, now) : (state.pastLists || []);
  const kept = source === 'checked' ? shopping.filter((row) => !row.checked) : [...shopping];
  const pending = new Set(kept.filter((row) => !row.checked).map((row) => key(row.name)));
  let added = 0;
  for (const row of rows) {
    const k = key(row.name);
    if (!k || pending.has(k)) continue;
    pending.add(k);
    const fresh = createShoppingItem({ name: row.name, quantity: row.quantity, unit: row.unit, itemId: row.itemId }, now);
    kept.push({ ...fresh, ...(row.category ? { category: row.category } : {}), ...(row.note ? { note: cleanNote(row.note) } : {}) });
    added += 1;
  }
  return { shopping: kept, pastLists, added, source };
}

// English for every Greek string of these features (merged into i18n.js).
export const SHOPPING_EXTRAS_EN = {
  'Προστέθηκε: {name}': 'Added: {name}',
  'Πρόσθεσε σημείωση': 'Add a note',
  'Σημείωση για {name}': 'Note for {name}',
  'Αλλαγή σημείωσης για {name}': 'Change the note for {name}',
  'π.χ. Barilla 500 γρ., χωρίς λακτόζη': 'e.g. Barilla 500 g, lactose-free',
  'Ταιριάζουν:': 'Matches:',
  'Συχνά:': 'Often:',
  'Πρόσθεσε {name} στη λίστα': 'Add {name} to the list',
  'Ξαναψώνισε τα ίδια': 'Buy the same again',
  'Σημείωση: μάρκα, μέγεθος (προαιρετικά)': 'Note: brand, size (optional)',
  'Γρήγορες προτάσεις': 'Quick suggestions',
  'Ξαναμπήκαν στη λίστα: {count}': 'Back on the list: {count}',
  'Όλα είναι ήδη στη λίστα.': 'Everything is already on the list.',
  'Η σημείωση αποθηκεύτηκε.': 'Note saved.',
  'Η σημείωση αφαιρέθηκε.': 'Note removed.',
  'Ειδοποίηση όταν άλλο μέλος αλλάζει την κοινή λίστα αγορών': 'Notify me when another member changes the shared shopping list',
  'Μόνο σε κοινό σπίτι. Έρχεται όσο η εφαρμογή είναι ανοιχτή ή στο παρασκήνιο, μαζεμένα (το πολύ μία κάθε 2 λεπτά). Ποτέ για δικές σου αλλαγές.': 'Shared household only. It arrives while the app is open or in the background, grouped (at most one every 2 minutes). Never for your own changes.',
  'Οι ειδοποιήσεις κοινής λίστας ενεργοποιήθηκαν.': 'Shared-list notifications turned on.',
  'Οι ειδοποιήσεις κοινής λίστας απενεργοποιήθηκαν.': 'Shared-list notifications turned off.',
  '{who} πρόσθεσε {list}': '{who} added {list}',
  '{who} πήρε {list}': '{who} bought {list}',
  '{who} άλλαξε {list}': '{who} changed {list}',
  'Πρόσθεσε: {list}': 'Added: {list}',
  'Πήρε: {list}': 'Bought: {list}',
  'Άλλαξε: {list}': 'Changed: {list}',
  'Ένα μέλος': 'A member',
  '{who} άλλαξε τη λίστα αγορών': '{who} changed the shopping list',
  'Αλλαγές στη λίστα αγορών': 'Changes to the shopping list'
};
