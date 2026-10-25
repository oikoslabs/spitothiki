// «Ποιος πλήρωσε τι» (v1.7.0): who paid what in a shared household, per month. Pure functions (unit-tested).
// Purely additive: nothing here changes an existing expense record or a monthly total. Data it uses:
//  - writers: Map/obj 'kind:id' → uid of the member whose device last saved that record (from sync, not stored in it)
//  - payers:    records { id: '<expense key>', who: uid | 'shared' } — a member's choice, overrides the default
//  - settlements: records { id, month, from, to, amount, date } — money given back; NOT an expense, never in totals
//  - paySplit:  one record { id: 'split', shares: { uid: percent } } — optional; equal split otherwise
//  - people:    records { id: uid, name } — display names
import { billsMonthList } from './bills.js';

export const SHARED = 'shared';
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const cents = (n) => Math.round(Number(n) * 100);
const monthOf = (d) => String(d || '').slice(0, 7);
const writerOf = (writers, kind, id) => (writers instanceof Map ? writers.get(`${kind}:${id}`) : writers?.[`${kind}:${id}`]) || '';

// Every expense of the month, exactly the money in «Σύνολο εξόδων μήνα»: purchases (one per receipt / per cart trip /
// per single purchase), paid bills (same month rule as the totals), transport + tolls, small expenses.
export function monthExpenses(state = {}, month, writers = {}) {
  const out = [];
  const groups = new Map();
  for (const p of state.purchases || []) {
    if (monthOf(p.date) !== month || !Number.isFinite(Number(p.price))) continue;
    const key = p.receiptId ? `receipt:${p.receiptId}` : p.tripId ? `trip:${p.tripId}` : `purchase:${p.id}`;
    const g = groups.get(key) || { key, kind: key.split(':')[0], amount: 0, date: p.date, label: p.receiptId || p.tripId ? (p.storeName || '') : p.name, count: 0,
      writer: writerOf(writers, 'purchases', p.id) || (p.receiptId ? writerOf(writers, 'receipts', p.receiptId) : p.tripId ? writerOf(writers, 'trips', p.tripId) : '') };
    g.amount += Number(p.price); g.count += 1;
    groups.set(key, g);
  }
  for (const g of groups.values()) out.push({ ...g, amount: round2(g.amount) });
  for (const b of billsMonthList(state.bills || [], month)) out.push({ key: `bill:${b.id}`, kind: 'bill', amount: round2(b.amount), date: b.countDate, label: b.name, writer: writerOf(writers, 'bills', b.id) });
  for (const e of state.transport || []) if (String(e.date).startsWith(`${month}-`)) out.push({ key: `transport:${e.id}`, kind: 'transport', type: e.type, amount: round2(e.amount), date: e.date, label: e.note || '', writer: writerOf(writers, 'transport', e.id) });
  for (const e of state.extras || []) if (String(e.date).startsWith(`${month}-`)) out.push({ key: `extra:${e.id}`, kind: 'extra', category: e.category, amount: round2(e.amount), date: e.date, label: e.note || '', writer: writerOf(writers, 'extras', e.id) });
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amount - a.amount);
}

// Who paid an expense: the member's explicit choice, else whoever entered it; '' = unknown («Χωρίς πληρωτή»).
export function payerOf(expense, payers = [], members = []) {
  const set = payers.find((p) => p.id === expense.key)?.who;
  if (set === SHARED || members.includes(set)) return set;
  return members.includes(expense.writer) ? expense.writer : '';
}

// Shares in % per member: the saved split if it covers someone with > 0, normalised to 100; else equal.
export function sharesFor(members = [], split = null) {
  const raw = split?.shares || {};
  const vals = members.map((m) => Math.max(0, Number(raw[m]) || 0));
  const sum = vals.reduce((a, b) => a + b, 0);
  const out = {};
  members.forEach((m, i) => { out[m] = sum > 0 ? (vals[i] / sum) * 100 : 100 / members.length; });
  return out;
}

// Month balance: paid per member, each one's share of the counted expenses, settlements, and who owes whom.
export function monthBalance({ expenses = [], payers = [], members = [], split = null, settlements = [], month } = {}) {
  const paid = Object.fromEntries(members.map((m) => [m, 0]));
  let shared = 0; let unknown = 0;
  for (const e of expenses) {
    const who = payerOf(e, payers, members);
    if (who === SHARED) shared += cents(e.amount); else if (!who) unknown += cents(e.amount); else paid[who] += cents(e.amount);
  }
  const counted = Object.values(paid).reduce((a, b) => a + b, 0);
  const shares = sharesFor(members, split);
  const owed = {}; let given = 0;
  members.forEach((m, i) => { owed[m] = i === members.length - 1 ? counted - given : Math.round((counted * shares[m]) / 100); given += owed[m]; });
  const net = Object.fromEntries(members.map((m) => [m, paid[m] - owed[m]])); // > 0: should get money back
  const done = settlements.filter((s) => s.month === month && members.includes(s.from) && members.includes(s.to));
  for (const s of done) { net[s.from] += cents(s.amount); net[s.to] -= cents(s.amount); }
  return { month, members, shares, paid: map(paid), owed: map(owed), net: map(net), shared: shared / 100, unknown: unknown / 100, counted: counted / 100, settlements: done, transfers: transfers(net) };
}
const map = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / 100]));

// Fewest simple transfers that bring everyone to 0 (in cents; nothing under 1 cent).
export function transfers(netCents) {
  const debt = Object.entries(netCents).filter(([, v]) => v < 0).map(([m, v]) => ({ m, v: -v })).sort((a, b) => b.v - a.v);
  const cred = Object.entries(netCents).filter(([, v]) => v > 0).map(([m, v]) => ({ m, v })).sort((a, b) => b.v - a.v);
  const out = [];
  let i = 0; let j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i].v, cred[j].v);
    if (x >= 1) out.push({ from: debt[i].m, to: cred[j].m, amount: x / 100 });
    debt[i].v -= x; cred[j].v -= x;
    if (!debt[i].v) i += 1;
    if (!cred[j].v) j += 1;
  }
  return out;
}

const makeId = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
// «Εξοφλήθηκε»: one settlement record per suggested transfer (money given, not an expense).
export const settlementsFor = (balance, date, now = new Date().toISOString()) => balance.transfers.map((t) => ({ id: makeId('st'), month: balance.month, from: t.from, to: t.to, amount: round2(t.amount), date, createdAt: now, updatedAt: now }));

export function setPayer(payers = [], key, who, now = new Date().toISOString()) {
  const rest = payers.filter((p) => p.id !== key);
  return who ? [...rest, { id: key, who: String(who).slice(0, 128), updatedAt: now }] : rest;
}

// Display names: saved name, else «Μέλος N» (never an email).
export function memberNames(members = [], people = [], fallback = (n) => `Μέλος ${n}`) {
  const out = {};
  members.forEach((m, i) => { const name = String(people.find((p) => p.id === m)?.name || '').trim(); out[m] = name || fallback(i + 1); });
  return out;
}
export const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 30);
