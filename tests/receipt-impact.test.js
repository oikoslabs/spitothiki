import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECEIPT_MESSAGES, classifyReceiptUrl, fetchReceipt } from '../src/receipt.js';
import { routeCode } from '../src/scan-router.js';

// v1.9.6: IMPACT restaurant retail receipt (Απόδειξη λιανικής, /p/<issuer>/<doc>/<key>). Sanitized fixture.
const xml = readFileSync(new URL('./fixtures/receipt-impact-retail.xml', import.meta.url), 'utf8');
const LINK = 'https://einvoice.impact.gr/p/EL999999999/DEMO0000000000000000000000000000000DOC/DEMOKEY0000000000000000000000000';
const res = (status, body = '', type = 'text/xml') => ({ ok: status >= 200 && status < 300, status, text: async () => body, type });

test('IMPACT /p/ link routes as a receipt and keeps its key', () => {
  assert.equal(routeCode(LINK).route, 'receipt');
  assert.deepEqual(classifyReceiptUrl(`${LINK}/`), { kind: 'provider', url: LINK, host: 'einvoice.impact.gr' });
});

test('IMPACT retail receipt: items and total', async () => {
  const seen = [];
  const r = await fetchReceipt(LINK, { fetchImpl: async (u) => { seen.push(u); return u.endsWith('/myDATA') ? res(200, xml) : res(200, '<html>'); } });
  assert.equal(seen[0], `${LINK}/myDATA`);
  assert.equal(r.total, 32.5);
  assert.equal(r.date, '2026-10-31');
  assert.equal(r.lines.length, 4);
  const byName = Object.fromEntries(r.lines.map((l) => [l.rawName.replace(/\s+/g, ' '), l]));
  assert.equal(byName['CAESARS BURGER'].quantity, 2);
  assert.equal(byName['CAESARS BURGER'].price, 20.4);
  assert.equal(byName['KEISER'].price, 3.6);
  assert.equal(byName['ΝΕΡΟ 500ml'].price, 0.5);
  assert.equal(r.lines.reduce((s, l) => s + l.price, 0).toFixed(2), '32.50');
});

test('IMPACT receipt scanned before it is published → «try again shortly», not «not supported»', async () => {
  const notYet = async () => res(400, 'Document DEMO for issuer EL999999999 was not found', 'text/plain');
  await assert.rejects(fetchReceipt(LINK, { fetchImpl: notYet }), (e) => {
    assert.equal(e.kind, 'pending'); assert.equal(e.message, RECEIPT_MESSAGES.pending); assert.ok(!e.unsupported); return true;
  });
  // through the proxy (CORS blocked direct) the same answer is passed on
  const viaProxy = async (u) => { if (!u.startsWith('https://proxy.test')) throw new TypeError('Failed to fetch'); return notYet(); };
  await assert.rejects(fetchReceipt(LINK, { fetchImpl: viaProxy, proxy: 'https://proxy.test' }), (e) => e.kind === 'pending');
  // a plain 404/500 without that text stays «unsupported»
  await assert.rejects(fetchReceipt(LINK, { fetchImpl: async () => res(500, '<html>') }), (e) => e.kind === 'unsupported');
});
