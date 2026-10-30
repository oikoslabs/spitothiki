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

test('v1.9.3: proxy never contacts a host outside the allow-list, even through redirects', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  const routes = {
    'https://a.epsilonnet.gr/evil': { status: 302, location: 'http://169.254.169.254/latest/meta-data' },
    'https://a.epsilonnet.gr/evil2': { status: 301, location: 'https://evil.example.com/steal' },
    'https://a.epsilonnet.gr/good': { status: 302, location: '/fd/final' },
    'https://a.epsilonnet.gr/fd/final': { status: 200 },
    'https://a.epsilonnet.gr/loop': { status: 302, location: '/loop' }
  };
  globalThis.fetch = async (url, init) => {
    seen.push(url); assert.equal(init.redirect, 'manual');
    const r = routes[url] || { status: 404 };
    return { url, status: r.status, headers: new Headers(r.location ? { location: r.location } : { 'content-type': 'application/xml' }), arrayBuffer: async () => new TextEncoder().encode('<x/>').buffer };
  };
  try {
    const req = (u) => new Request(`https://proxy.test/?url=${encodeURIComponent(u)}`, { headers: { origin: 'https://spitothiki.web.app' } });
    assert.equal((await worker.fetch(req('https://a.epsilonnet.gr/evil'))).status, 403);
    assert.equal((await worker.fetch(req('https://a.epsilonnet.gr/evil2'))).status, 403);
    assert.equal((await worker.fetch(req('https://a.epsilonnet.gr/good'))).status, 200);
    assert.equal((await worker.fetch(req('https://a.epsilonnet.gr/loop'))).status, 502);
    assert.ok(seen.every((u) => new URL(u).hostname === 'a.epsilonnet.gr'), 'only allow-listed hosts were contacted');
  } finally { globalThis.fetch = realFetch; }
});
