import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_DOMAINS, allowedHost, isAllowedOrigin } from '../src/receipt-domains.js';
import worker, { ALLOWED_DOMAINS as PROXY_DOMAINS } from '../proxy/worker.js';

test('app and proxy use the very same provider list', () => {
  assert.equal(PROXY_DOMAINS, ALLOWED_DOMAINS);
  assert.ok(allowedHost('epsilondigital-sklavenitis.epsilonnet.gr'));
  assert.ok(allowedHost('e-invoicing.gr'));
  assert.ok(allowedHost('einvoice.impact.gr'));
  assert.ok(!allowedHost('receipts.demo-shop.example'));
  assert.ok(!allowedHost('epsilonnet.gr.evil.com'));
  assert.ok(!allowedHost('notepsilonnet.gr'));
  assert.ok(!allowedHost(''));
});

test('allowed origins: live, Firebase preview channels, local — nothing else', () => {
  assert.ok(isAllowedOrigin('https://spitothiki.web.app'));
  assert.ok(isAllowedOrigin('https://spitothiki--manual-expense-qjqnqtg6.web.app'));
  assert.ok(isAllowedOrigin('http://localhost:8080'));
  assert.ok(!isAllowedOrigin('https://spitothiki--x.web.app.evil.com'));
  assert.ok(!isAllowedOrigin('https://evil--x.web.app'));
  assert.ok(!isAllowedOrigin('http://spitothiki--x.web.app'));
  assert.ok(!isAllowedOrigin('https://spitothiki--x.firebaseapp.com.evil.com'));
  assert.ok(!isAllowedOrigin(''));
});

test('proxy answers a preview channel with its own CORS origin; unknown origins still refused', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ url, status: 200, headers: new Headers({ 'content-type': 'application/xml' }), arrayBuffer: async () => new TextEncoder().encode('<x/>').buffer });
  try {
    const req = (origin) => new Request(`https://proxy.test/?url=${encodeURIComponent('https://e-invoicing.gr/edocuments/ViewInvoice/-1/demo/myDATA')}`, { headers: { origin } });
    const preview = 'https://spitothiki--manual-expense-qjqnqtg6.web.app';
    const ok = await worker.fetch(req(preview));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), preview);
    assert.equal((await worker.fetch(req('https://evil--x.web.app'))).status, 403);
  } finally { globalThis.fetch = realFetch; }
});
