import test from 'node:test';
import assert from 'node:assert/strict';
import { SHARED, memberNames, monthBalance, monthExpenses, payerOf, setPayer, settlementsFor, sharesFor, transfers } from '../src/whopaid.js';
import { SyncEngine } from '../src/sync-core.js';
import { parseBackup, loadState, saveState } from '../src/storage.js';

const G = 'uid-giannis'; const M = 'uid-maria';
const demo = () => ({
  items: [], shopping: [],
  purchases: [
    { id: 'pur-r1-0', name: 'Γάλα', category: 'Γαλακτοκομικά', price: 2.5, date: '2026-10-05', receiptId: 'r1', storeName: 'Σούπερ demo' },
    { id: 'pur-r1-1', name: 'Ψωμί', category: 'Άλλο', price: 1.5, date: '2026-10-05', receiptId: 'r1', storeName: 'Σούπερ demo' },
    { id: 'pur-t1-0', name: 'Ρύζι', category: 'Άλλο', price: 20, date: '2026-10-12', tripId: 't1', storeName: 'Σούπερ 2' },
    { id: 'pur-s1', name: 'Μπανάνες', category: 'Φρούτα', price: 6, date: '2026-10-20' },
    { id: 'pur-old', name: 'Παλιό', category: 'Άλλο', price: 99, date: '2026-09-20' }],
  bills: [{ id: 'b1', name: 'ΔΕΗ', type: 'electricity', amount: 149, due: '2026-10-22', paid: true, paidAt: '2026-10-18' },
    { id: 'b2', name: 'ΕΥΔΑΠ', type: 'water', amount: 105.41, due: '2026-09-28', paid: true, paidAt: '2026-10-05' },
    { id: 'b3', name: 'Internet', type: 'phone', amount: 62.93, due: '2026-10-30', paid: false }],
  transport: [{ id: 'tr1', type: 'fuel', amount: 50, date: '2026-10-08' }, { id: 'tr2', type: 'tolls', amount: 4.8, date: '2026-10-08' }],
  extras: [{ id: 'x1', category: 'coffee', amount: 3.5, qty: 1, date: '2026-10-09' }]
});
const writers = { 'purchases:pur-r1-0': M, 'purchases:pur-r1-1': M, 'purchases:pur-t1-0': G, 'purchases:pur-s1': G, 'bills:b1': G, 'bills:b2': M, 'transport:tr1': G, 'transport:tr2': G, 'extras:x1': M };

test('month expenses = exactly the money of «Σύνολο εξόδων μήνα» (receipt/trip grouped, bills by count month, unpaid out)', () => {
  const ex = monthExpenses(demo(), '2026-10', writers);
  const total = Math.round(ex.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  assert.equal(total, 4 + 20 + 6 + 149 + 105.41 + 50 + 4.8 + 3.5); // 342,71
  assert.deepEqual(ex.find((e) => e.key === 'receipt:r1'), { ...ex.find((e) => e.key === 'receipt:r1'), amount: 4, count: 2, writer: M, label: 'Σούπερ demo' });
  assert.ok(!ex.some((e) => e.key === 'bill:b3' || e.key === 'purchase:pur-old'));
  assert.equal(ex.find((e) => e.key === 'bill:b2').writer, M);
});

test('balance: equal split, «Μαρία χρωστάει σε Γιάννη», shared/unknown buckets, settlement resets', () => {
  const members = [G, M];
  const state = demo();
  const expenses = monthExpenses(state, '2026-10', writers);
  let b = monthBalance({ expenses, members, month: '2026-10' });
  // Γιάννης: 20 + 6 + 149 + 50 + 4,8 = 229,80 · Μαρία: 4 + 105,41 + 3,5 = 112,91 · total 342,71 → each 171,355
  assert.deepEqual(b.paid, { [G]: 229.8, [M]: 112.91 });
  assert.equal(b.counted, 342.71);
  assert.deepEqual(b.transfers, [{ from: M, to: G, amount: 58.44 }]);
  assert.equal(Math.round((b.owed[G] + b.owed[M]) * 100) / 100, 342.71); // no cent lost
  // The coffee goes to the shared fund, the fuel has no known payer.
  let payers = setPayer([], 'extra:x1', SHARED);
  b = monthBalance({ expenses: monthExpenses(state, '2026-10', { ...writers, 'transport:tr1': 'uid-old-device' }), payers, members, month: '2026-10' });
  assert.equal(b.shared, 3.5); assert.equal(b.unknown, 50); assert.equal(b.counted, 342.71 - 3.5 - 50);
  // Explicit payer wins over who entered it; '' resets to default.
  payers = setPayer(payers, 'bill:b1', M);
  assert.equal(payerOf(expenses.find((e) => e.key === 'bill:b1'), payers, members), M);
  assert.equal(payerOf(expenses.find((e) => e.key === 'bill:b1'), setPayer(payers, 'bill:b1', ''), members), G);
  // Settlement: Μαρία gives 58,44 → even; the expenses and their total don't change.
  b = monthBalance({ expenses, members, month: '2026-10' });
  const settled = settlementsFor(b, '2026-10-25');
  assert.equal(settled.length, 1); assert.deepEqual([settled[0].from, settled[0].to, settled[0].amount, settled[0].month], [M, G, 58.44, '2026-10']);
  const after = monthBalance({ expenses, members, settlements: settled, month: '2026-10' });
  assert.deepEqual(after.transfers, []); assert.equal(after.counted, 342.71);
  // A settlement of another month doesn't touch October.
  assert.deepEqual(monthBalance({ expenses, members, settlements: settled.map((s) => ({ ...s, month: '2026-09' })), month: '2026-10' }).transfers, b.transfers);
});

test('custom shares (60/40), normalised; names never fall back to an email', () => {
  assert.deepEqual(sharesFor([G, M]), { [G]: 50, [M]: 50 });
  assert.deepEqual(sharesFor([G, M], { shares: { [G]: 3, [M]: 2 } }), { [G]: 60, [M]: 40 });
  assert.deepEqual(sharesFor([G, M], { shares: { [G]: 0, [M]: 0 } }), { [G]: 50, [M]: 50 });
  const b = monthBalance({ expenses: [{ key: 'a', amount: 100, writer: G }], members: [G, M], split: { shares: { [G]: 60, [M]: 40 } }, month: 'x' });
  assert.deepEqual(b.transfers, [{ from: M, to: G, amount: 40 }]);
  assert.deepEqual(memberNames([G, M], [{ id: G, name: 'Γιάννης' }]), { [G]: 'Γιάννης', [M]: 'Μέλος 2' });
  assert.deepEqual(transfers({ a: -1000, b: 600, c: 400 }), [{ from: 'a', to: 'b', amount: 6 }, { from: 'a', to: 'c', amount: 4 }]);
});

test('sync: remembers who saved each record (from the rows, local meta only), never sends it', async () => {
  let meta = null; const written = [];
  let state = { items: [], shopping: [], bills: [] };
  const engine = new SyncEngine({ backend: { subscribe: () => () => {}, write: async (docs) => { written.push(...docs); } }, getState: () => state, setState: (s) => { state = s; }, store: { load: () => meta, save: (v) => { meta = structuredClone(v); } }, now: () => 100, uid: () => G });
  engine.start();
  await engine.receive([{ kind: 'bills', id: 'b2', data: { id: 'b2', name: 'ΕΥΔΑΠ', amount: 1 }, deleted: false, ts: 5, by: M }]);
  assert.equal(engine.writers['bills:b2'], M);
  state = { ...state, bills: [...state.bills, { id: 'b1', name: 'ΔΕΗ', amount: 2 }] };
  await engine.push();
  assert.equal(engine.writers['bills:b1'], G);
  assert.ok(written.every((d) => !('by' in d) && !('writers' in (d.data || {}))));
  assert.deepEqual(meta.writers, { 'bills:b2': M, 'bills:b1': G });
  // An older remote copy of a record changed here later doesn't steal the writer.
  await engine.receive([{ kind: 'bills', id: 'b1', data: { id: 'b1', name: 'ΔΕΗ', amount: 1 }, deleted: false, ts: 50, by: M }]);
  assert.equal(engine.writers['bills:b1'], G);
  await engine.receive([{ kind: 'bills', id: 'b2', data: null, deleted: true, ts: 200, by: M }]);
  assert.equal('bills:b2' in engine.writers, false);
  // Old meta without writers still loads.
  const old = new SyncEngine({ backend: { subscribe: () => () => {}, write: async () => {} }, getState: () => state, setState: () => {}, store: { load: () => ({ snapshot: null, times: {} }), save: () => {} } });
  assert.deepEqual(old.writers, {});
});

test('new lists survive save/load and backups; old backups (without them) still restore', () => {
  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = { items: [], shopping: [], bills: [{ id: 'b1', amount: 1 }], people: [{ id: G, name: 'Γιάννης' }], payers: [{ id: 'bill:b1', who: M }], settlements: [{ id: 'st1', month: '2026-10', from: M, to: G, amount: 5, date: '2026-10-25' }], paySplit: [{ id: 'split', shares: { [G]: 60, [M]: 40 } }] };
  saveState(s, storage);
  assert.deepEqual(loadState(storage), s);
  assert.deepEqual(parseBackup(JSON.stringify(s)), s);
  const oldBackup = { items: [{ id: 'i1', name: 'Γάλα' }], shopping: [], bills: [{ id: 'b0', amount: 3 }] };
  assert.deepEqual(parseBackup(JSON.stringify(oldBackup)), oldBackup);
});

test('records are never rewritten: computing who paid leaves the state untouched', () => {
  const state = demo(); const before = JSON.stringify(state);
  monthBalance({ expenses: monthExpenses(state, '2026-10', writers), members: [G, M], month: '2026-10' });
  assert.equal(JSON.stringify(state), before);
});

test('an app that does not know a list (like 1.6.16 with «payers») ignores it and keeps its data', async () => {
  let state = { items: [{ id: 'i1', name: 'Γάλα' }], shopping: [] };
  const engine = new SyncEngine({ backend: { subscribe: () => () => {}, write: async () => {} }, getState: () => state, setState: (s) => { state = s; }, store: { load: () => null, save: () => {} } });
  engine.start();
  await engine.receive([{ kind: 'futureKind', id: 'x', data: { id: 'x' }, deleted: false, ts: 5, by: M }]);
  assert.deepEqual(state.items, [{ id: 'i1', name: 'Γάλα' }]);
  assert.equal('futureKind' in state, false);
});
