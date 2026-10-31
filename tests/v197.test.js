import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchReceipt, findRelatedReceipt, receiptId } from '../src/receipt.js';
import { deleteReceipt, isStaleReceipt } from '../src/receipts.js';

// v1.9.7: IMPACT restaurant order slip (ΔΠΑ) + retail receipt that references it. Sanitized fixtures.
const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const retail = fx('receipt-impact-retail.xml'), slip = fx('receipt-impact-order-slip.xml'), ubl = fx('receipt-impact-retail-ubl.xml');
const res = (status, body = '') => ({ ok: status < 300, status, text: async () => body });
const RECEIPT = 'https://einvoice.impact.gr/p/EL999999999/DEMODOC/DEMOKEY';
const SLIP = 'https://einvoice.impact.gr/p/EL999999999/DEMOSLIP/DEMOKEY2';
const serve = (my, en = '<html>') => async (u, opts) => { assert.equal(opts.cache, 'no-store'); return u.endsWith('/myDATA') ? res(200, my) : res(200, en); };
const record = async (r) => ({ id: await receiptId(r, r.sourceUrl), date: r.date, total: r.total, store: 'DEMO GRILL', issuerVat: r.issuerVat, format: r.format, mark: r.mark, series: r.series, number: r.number });

test('retail receipt scans on its own and carries its links to the order slip', async () => {
  const r = await fetchReceipt(RECEIPT, { fetchImpl: serve(retail, ubl) });
  assert.equal(r.lines.length, 4);
  assert.deepEqual(r.connectedMarks, ['400000000000000']);
  assert.deepEqual(r.related, ['ΔΠΑ 38258']);
  assert.equal(r.issuerName, 'DEMO GRILL');
  assert.equal(findRelatedReceipt(r, []), null);
});

test('receipt and order slip are different receipts (no false duplicate)', async () => {
  const r = await fetchReceipt(RECEIPT, { fetchImpl: serve(retail, ubl) });
  const s = await fetchReceipt(SLIP, { fetchImpl: serve(slip, '<html>') });
  assert.notEqual(await receiptId(r, r.sourceUrl), await receiptId(s, s.sourceUrl));
});

test('a saved order slip is found by mark, by «ΔΠΑ 38258», or (old records) by shop+day+total', async () => {
  const r = await fetchReceipt(RECEIPT, { fetchImpl: serve(retail, ubl) });
  const s = await record(await fetchReceipt(SLIP, { fetchImpl: serve(slip) }));
  assert.equal(findRelatedReceipt(r, [s])?.id, s.id);
  assert.equal(findRelatedReceipt(r, [{ ...s, mark: '' }])?.id, s.id);
  const old = { id: 'rcpt-old', date: s.date, total: s.total, issuerVat: s.issuerVat, format: 'myDATA' };
  assert.equal(findRelatedReceipt(r, [old])?.id, 'rcpt-old');
  assert.equal(findRelatedReceipt(r, [{ ...old, total: 10 }]), null);
  assert.equal(findRelatedReceipt(r, [{ ...s, issuerVat: '111111111' }]), null);
  assert.equal(findRelatedReceipt({ ...r, connectedMarks: [], related: [] }, [s]), null);
});

test('replacing the slip removes its expenses; deleting all expenses makes a receipt re-scannable', () => {
  const state = { receipts: [{ id: 'slip' }, { id: 'rc' }], purchases: [{ id: 'a', receiptId: 'slip' }, { id: 'b', receiptId: 'rc' }] };
  const next = deleteReceipt(state, 'slip');
  assert.deepEqual(next.receipts.map((r) => r.id), ['rc']);
  assert.deepEqual(next.purchases.map((p) => p.id), ['b']);
  assert.equal(isStaleReceipt({ id: 'rc' }, next), false);
  assert.equal(isStaleReceipt({ id: 'rc' }, { purchases: [] }), true);
  assert.equal(isStaleReceipt({ id: 'rc' }, { purchases: [], transport: [{ receiptId: 'rc' }] }), false);
});
