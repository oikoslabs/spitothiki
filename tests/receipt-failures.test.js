import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECEIPT_MESSAGES, fetchReceipt, receiptFailure } from '../src/receipt.js';

// v1.8.0: what the user is told when a receipt link can't be read.
const myData = readFileSync(new URL('./fixtures/receipt-mydata.xml', import.meta.url), 'utf8');
const res = (status, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body });
const corsBlocked = (proxyAnswer) => async (url) => { if (!url.startsWith('https://proxy.test')) throw new TypeError('Failed to fetch'); return proxyAnswer(url); };
const opts = (fetchImpl) => ({ fetchImpl, proxy: 'https://proxy.test' });

test('refused domain (proxy 403) → «not supported yet», not «no items» / «try later»', async () => {
  await assert.rejects(fetchReceipt('https://receipts.demo-shop.example/v/123', opts(corsBlocked(() => res(403, 'Domain not allowed')))), (e) => {
    assert.equal(e.message, RECEIPT_MESSAGES.unsupported); assert.equal(e.unsupported, true); assert.equal(e.kind, 'unsupported'); assert.ok(!e.cors); return true;
  });
});

test('unknown layout: HTML page instead of receipt data, or 404/500 → «not supported yet»', async () => {
  const html = async () => res(200, '<!DOCTYPE html><html><body>Error 404</body></html>');
  await assert.rejects(fetchReceipt('https://e-invoicing.gr/edocuments/ViewInvoice/-1/demo', { fetchImpl: html }), (e) => e.unsupported === true && e.message === RECEIPT_MESSAGES.unsupported);
  await assert.rejects(fetchReceipt('https://einvoice.impact.gr/v/EL000-demo/', { fetchImpl: async () => res(500, '<html>') }), (e) => e.kind === 'unsupported');
  await assert.rejects(fetchReceipt('https://a.epsilonnet.gr/fd/demo', { fetchImpl: async () => res(404) }), (e) => e.kind === 'unsupported');
  // valid XML but no items and no amount is also «unsupported», never a 0 € receipt
  const empty = '<InvoicesDoc><invoice><invoiceHeader><issueDate>2026-10-10</issueDate></invoiceHeader></invoice></InvoicesDoc>';
  await assert.rejects(fetchReceipt('https://a.epsilonnet.gr/fd/empty', { fetchImpl: async (u) => res(200, u.endsWith('/myDATA') ? empty : '<html>') }), (e) => e.kind === 'unsupported');
});

test('genuine network trouble / timeouts / overload keep the «try again» messages', async () => {
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(fetchReceipt('https://a.epsilonnet.gr/fd/x', opts(offline)), (e) => { assert.equal(e.kind, 'network'); assert.equal(e.message, RECEIPT_MESSAGES.network); assert.equal(e.cors, true); assert.ok(!e.status); return true; });
  const timeout = async () => { const err = new Error('timed out'); err.name = 'TimeoutError'; throw err; };
  await assert.rejects(fetchReceipt('https://a.epsilonnet.gr/fd/x', opts(timeout)), (e) => e.kind === 'network');
  await assert.rejects(fetchReceipt('https://a.epsilonnet.gr/fd/x', opts(corsBlocked(() => res(504)))), (e) => e.kind === 'temporary' && e.message === RECEIPT_MESSAGES.temporary && e.status === 504);
  await assert.rejects(fetchReceipt('https://a.epsilonnet.gr/fd/x', opts(corsBlocked(() => res(429)))), (e) => e.kind === 'busy' && /Πολλές αναζητήσεις/.test(e.message));
});

test('receiptFailure classification', () => {
  assert.equal(receiptFailure(null), 'unsupported');
  assert.equal(receiptFailure(Object.assign(new Error('x'), { status: 403 })), 'unsupported');
  assert.equal(receiptFailure(Object.assign(new Error('x'), { status: 500 })), 'unsupported');
  assert.equal(receiptFailure(Object.assign(new Error('x'), { status: 526 })), 'unsupported');
  assert.equal(receiptFailure(Object.assign(new Error('x'), { status: 503 })), 'temporary');
  assert.equal(receiptFailure(Object.assign(new Error('x'), { status: 524 })), 'temporary');
  assert.equal(receiptFailure(new TypeError('Failed to fetch')), 'network');
});

test('a supported receipt still opens (direct, or via the proxy after a CORS block)', async () => {
  const r = await fetchReceipt('https://a.epsilonnet.gr/fd/ok', { fetchImpl: async (u) => res(200, u.endsWith('/myDATA') ? myData : '<html>') });
  assert.equal(r.lines.length, 8);
  const p = await fetchReceipt('https://b.epsilonnet.gr/fd/ok', opts(corsBlocked((u) => res(200, u.includes('myDATA') ? myData : '<html>'))));
  assert.equal(p.total, 19.87);
});
