import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup, readBackup, isEncryptedBackup } from '../src/backup-crypto.js';
import { applyReceiptEdit } from '../src/receipt-edit.js';
import { enqueue, dequeue, backupReminderDue, isNetworkError, hasData, loadQueue, saveQueue } from '../src/offline.js';

const state = { items: [{ id: 'i1', name: 'Γάλα' }], shopping: [], receipts: [] };

test('encrypted backup: roundtrip', async () => {
  const text = await encryptBackup(state, 'μυστικό-123', { iterations: 1000 });
  assert.ok(isEncryptedBackup(text));
  assert.ok(!text.includes('Γάλα'));
  const back = await decryptBackup(text, 'μυστικό-123');
  assert.equal(back.items[0].name, 'Γάλα');
});

test('encrypted backup: wrong password gives Greek error', async () => {
  const text = await encryptBackup(state, 'σωστός', { iterations: 1000 });
  await assert.rejects(decryptBackup(text, 'λάθος'), /Λάθος κωδικός/);
});

test('readBackup: legacy plain JSON still imports without asking', async () => {
  let asked = false;
  const out = await readBackup(JSON.stringify(state), async () => { asked = true; return 'x'; });
  assert.equal(asked, false);
  assert.equal(out.items.length, 1);
  const enc = await encryptBackup(state, 'pw', { iterations: 1000 });
  assert.equal((await readBackup(enc, async () => 'pw')).items.length, 1);
  assert.equal(await readBackup(enc, async () => null), null);
});

const base = {
  items: [], shopping: [],
  receipts: [{ id: 'r', store: 'Μάρκετ', date: '2026-10-01', total: 5, items: [{ name: 'Ψωμί', quantity: 1, price: 2 }, { name: 'Γάλα', quantity: 1, price: 3 }] }],
  purchases: [{ id: 'pur-r-0', receiptId: 'r', name: 'Ψωμί', price: 2, date: '2026-10-01', storeName: 'Μάρκετ', category: 'Άλλο' }, { id: 'pur-r-1', receiptId: 'r', name: 'Γάλα', price: 3, date: '2026-10-01', storeName: 'Μάρκετ', category: 'Άλλο' }, { id: 'x', name: 'άλλο', price: 9 }]
};

test('receipt edit: prices, total, date and store stay consistent', () => {
  const out = applyReceiptEdit(base, 'r', { store: 'Σκλαβενίτης', date: '2026-10-02', items: [{ name: 'Ψωμί ολικής', quantity: 1, price: 2.5 }, { name: 'Γάλα', quantity: 2, price: 3.4 }] }, 'now');
  const r = out.receipts[0];
  assert.equal(r.total, 5.9);
  assert.equal(r.store, 'Σκλαβενίτης');
  const ps = out.purchases.filter((p) => p.receiptId === 'r');
  assert.deepEqual(ps.map((p) => [p.name, p.price, p.date, p.storeName]), [['Ψωμί ολικής', 2.5, '2026-10-02', 'Σκλαβενίτης'], ['Γάλα', 3.4, '2026-10-02', 'Σκλαβενίτης']]);
  assert.equal(out.purchases.find((p) => p.id === 'x').price, 9);
});

test('receipt edit: removed line drops its expense; total-only receipt updates amount', () => {
  const out = applyReceiptEdit(base, 'r', { items: [{ name: '', price: 0 }, { name: 'Γάλα', price: 3 }] });
  assert.equal(out.receipts[0].total, 3);
  assert.deepEqual(out.purchases.filter((p) => p.receiptId === 'r').map((p) => p.id), ['pur-r-1']);
  const totalOnly = { items: [], shopping: [], receipts: [{ id: 't', store: 'Φούρνος', date: '2026-10-01', total: 4 }], purchases: [{ id: 'pur-t', receiptId: 't', name: 'Φούρνος', price: 4 }] };
  const o2 = applyReceiptEdit(totalOnly, 't', { store: 'Φούρνος Νίκος', total: '4.80' });
  assert.equal(o2.receipts[0].total, 4.8);
  assert.equal(o2.purchases[0].price, 4.8);
  assert.equal(o2.purchases[0].name, 'Φούρνος Νίκος');
});

test('offline queue and reminders', () => {
  let q = enqueue([], 'https://e.gr/a', 't');
  q = enqueue(q, 'https://e.gr/a');
  assert.equal(q.length, 1);
  assert.equal(dequeue(q, 'https://e.gr/a').length, 0);
  const mem = new Map(); const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveQueue(q, storage); assert.equal(loadQueue(storage)[0].link, 'https://e.gr/a');
  const now = Date.parse('2026-10-22');
  assert.equal(backupReminderDue({ signedIn: false, hasData: true, now }), true);
  assert.equal(backupReminderDue({ signedIn: true, hasData: true, now }), false);
  assert.equal(backupReminderDue({ signedIn: false, hasData: false, now }), false);
  assert.equal(backupReminderDue({ signedIn: false, hasData: true, lastBackup: now - 5 * 864e5, now }), false);
  assert.equal(backupReminderDue({ signedIn: false, hasData: true, lastBackup: now - 31 * 864e5, now }), true);
  assert.equal(backupReminderDue({ signedIn: false, hasData: true, snoozeUntil: now + 1, now }), false);
  assert.equal(isNetworkError(new TypeError('Failed to fetch'), true), true);
  assert.equal(isNetworkError(new Error('x'), false), true);
  assert.equal(isNetworkError(Object.assign(new Error('Failed to fetch'), { cors: true }), true), false);
  assert.equal(hasData({ items: [] }), false);
});
