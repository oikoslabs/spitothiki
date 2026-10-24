import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../proxy/worker.js';

test('proxy forwards only allowlisted https provider URLs and adds CORS', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => { seen.push(url); return { url, status: 200, headers: new Headers({ 'content-type': 'application/xml' }), arrayBuffer: async () => new TextEncoder().encode('<x/>').buffer }; };
  try {
    const req = (u, origin = 'https://spitothiki.web.app', method = 'GET') => new Request(`https://proxy.test/?url=${encodeURIComponent(u)}`, { method, headers: { origin } });
    const ok = await worker.fetch(req('https://epsilondigital-x.epsilonnet.gr/fd/abc:1/myDATA'));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://spitothiki.web.app');
    assert.equal((await worker.fetch(req('https://evil.example.com/x'))).status, 403);
    assert.equal((await worker.fetch(req('https://epsilonnet.gr.evil.com/x'))).status, 403);
    assert.equal((await worker.fetch(req('http://a.epsilonnet.gr/x'))).status, 400);
    assert.equal((await worker.fetch(req('https://a.epsilonnet.gr/x', 'https://other.site'))).status, 403);
    assert.equal((await worker.fetch(req('https://a.epsilonnet.gr/x', undefined, 'POST'))).status, 405);
    assert.deepEqual(seen, ['https://epsilondigital-x.epsilonnet.gr/fd/abc:1/myDATA']);
  } finally { globalThis.fetch = realFetch; }
});

test('proxy allows Entersoft / Retail Link receipts on e-invoicing.gr (e.g. Leroy Merlin)', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({ url, status: 200, headers: new Headers({ 'content-type': 'application/xml' }), arrayBuffer: async () => new TextEncoder().encode('<x/>').buffer });
  try {
    const req = (u) => new Request(`https://proxy.test/?url=${encodeURIComponent(u)}`, { headers: { origin: 'https://spitothiki.web.app' } });
    assert.equal((await worker.fetch(req('https://e-invoicing.gr/edocuments/ViewInvoice/-1/00000000-demo_1/myDATA'))).status, 200);
    assert.equal((await worker.fetch(req('https://e-invoicing.gr.evil.com/x'))).status, 403);
  } finally { globalThis.fetch = realFetch; }
});
