import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, SOURCE_KEY, cleanUrl, initSource, isStatsOrigin, parseSource, sendEvent, sourceSignup, validEvent } from '../src/source.js';
import worker, { allowedOrigin } from '../stats/worker.js';

const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test('source: allowlist, case, utm_source=sofisstore, unknown -> other, none -> direct', () => {
  assert.deepEqual(SOURCES, ['tiktok', 'facebook', 'instagram', 'telegram', 'viber', 'reddit', 'pinterest', 'sofisstore']);
  for (const s of SOURCES) assert.equal(parseSource(`?src=${s}`), s);
  assert.equal(parseSource('?src=TikTok'), 'tiktok');
  assert.equal(parseSource('?utm_source=sofisstore&utm_medium=link'), 'sofisstore');
  assert.equal(parseSource('?src=myspace'), 'other');
  assert.equal(parseSource('?src=<script>'), 'other');
  assert.equal(parseSource('?src='), 'direct');
  assert.equal(parseSource(''), 'direct');
  assert.equal(parseSource('?share=1'), 'direct');
});

test('source: clean address keeps path, other params and #view', () => {
  assert.equal(cleanUrl('https://spitothiki.web.app/?src=tiktok#bills'), '/#bills');
  assert.equal(cleanUrl('https://spitothiki.web.app/?utm_source=sofisstore&utm_campaign=x&share=1'), '/?share=1');
  assert.equal(cleanUrl('https://spitothiki.web.app/#overview'), null);
});

test('source: event validation and origins (live + previews only)', () => {
  assert.ok(validEvent('visit', 'tiktok') && validEvent('signup', 'direct') && validEvent('visit', 'other'));
  assert.ok(!validEvent('visit', 'myspace') && !validEvent('click', 'tiktok') && !validEvent('visit', ''));
  for (const ok of [isStatsOrigin, allowedOrigin]) {
    assert.ok(ok('https://spitothiki.web.app') && ok('https://spitothiki--stats-abc123.web.app'));
    assert.ok(!ok('http://localhost:8080') && !ok('https://evil.web.app') && !ok('https://spitothiki.web.app.evil.com') && !ok(''));
  }
});

test('source: first open sends one visit with only the word, then strips ?src', async () => {
  const storage = memory(); const sent = []; const replaced = [];
  const loc = { href: 'https://spitothiki.web.app/?src=tiktok#pantry', search: '?src=tiktok' };
  const hist = { state: null, replaceState: (_s, _t, url) => replaced.push(url) };
  const send = async (type, src) => { sent.push([type, src]); return true; };
  await initSource({ storage, loc, hist, send });
  await initSource({ storage, loc: { href: 'https://spitothiki.web.app/?src=facebook', search: '?src=facebook' }, hist, send });
  assert.deepEqual(sent, [['visit', 'tiktok']]);
  assert.deepEqual(replaced, ['/#pantry', '/']);
  assert.deepEqual(JSON.parse(storage.getItem(SOURCE_KEY)), { src: 'tiktok', visit: true });
  await sourceSignup({ storage, send }); await sourceSignup({ storage, send });
  assert.deepEqual(sent, [['visit', 'tiktok'], ['signup', 'tiktok']]);
});

test('source: offline -> retried on a later open; devices used before are "existing" and send no visit', async () => {
  const storage = memory(); const sent = []; let up = false;
  const send = async (type, src) => { if (!up) return false; sent.push([type, src]); return true; };
  const loc = { href: 'https://spitothiki.web.app/', search: '' };
  await initSource({ storage, loc, send });
  up = true; await initSource({ storage, loc, send });
  assert.deepEqual(sent, [['visit', 'direct']]);
  const old = memory(); const sent2 = [];
  await initSource({ storage: old, loc, hasData: true, send: async (...a) => { sent2.push(a); return true; } });
  await sourceSignup({ storage: old, send: async (...a) => { sent2.push(a); return true; } });
  assert.deepEqual(sent2, [['signup', 'existing']]);
});

test('source: sendEvent body is only {type, src}; skips offline, localhost and bad words; never throws', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push([url, opts]); return { ok: true }; };
  assert.equal(await sendEvent('visit', 'tiktok', { fetchImpl, online: true, origin: 'https://spitothiki.web.app' }), true);
  assert.deepEqual(JSON.parse(calls[0][1].body), { type: 'visit', src: 'tiktok' });
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(await sendEvent('visit', 'tiktok', { fetchImpl, online: false, origin: 'https://spitothiki.web.app' }), false);
  assert.equal(await sendEvent('visit', 'tiktok', { fetchImpl, online: true, origin: 'http://localhost:8080' }), false);
  assert.equal(await sendEvent('visit', 'evil', { fetchImpl, online: true, origin: 'https://spitothiki.web.app' }), false);
  assert.equal(await sendEvent('visit', 'tiktok', { fetchImpl: async () => { throw new Error('net'); }, online: true, origin: 'https://spitothiki.web.app' }), false);
  assert.equal(calls.length, 1);
});

test('stats worker: writes only [type, src]; refuses other origins and words', async () => {
  const points = []; const env = { SOURCES: { writeDataPoint: (p) => points.push(p) } };
  const req = (origin, body, method = 'POST', path = '/e') => new Request(`https://spitothiki-stats.example${path}`, { method, headers: origin ? { Origin: origin, 'CF-Connecting-IP': '1.2.3.4' } : {}, body: method === 'POST' ? body : undefined });
  let r = await worker.fetch(req('https://spitothiki.web.app', '{"type":"visit","src":"tiktok","uid":"x"}'), env);
  assert.equal(r.status, 204); assert.equal(r.headers.get('access-control-allow-origin'), 'https://spitothiki.web.app');
  assert.deepEqual(points, [{ indexes: ['tiktok'], blobs: ['visit', 'tiktok'] }]);
  assert.equal((await worker.fetch(req('https://evil.example', '{"type":"visit","src":"tiktok"}'), env)).status, 403);
  assert.equal((await worker.fetch(req('', '{"type":"visit","src":"tiktok"}'), env)).status, 403);
  assert.equal((await worker.fetch(req('https://spitothiki.web.app', '{"type":"visit","src":"myspace"}'), env)).status, 400);
  assert.equal((await worker.fetch(req('https://spitothiki.web.app', 'not json'), env)).status, 400);
  assert.equal((await worker.fetch(req('https://spitothiki--pr-1.web.app', null, 'OPTIONS'), env)).status, 204);
  assert.equal((await worker.fetch(req('https://spitothiki.web.app', '{}', 'POST', '/other'), env)).status, 404);
  assert.equal(points.length, 1);
});

test('v1.8.3 short links: /tiktok, /TikTok/, /TIKTOK count like ?src and the address becomes /', async () => {
  const { SHORT_PATH } = await import('../src/source.js');
  assert.equal(parseSource('', '/tiktok'), 'tiktok');
  assert.equal(parseSource('', '/TikTok/'), 'tiktok');
  assert.equal(parseSource('', '/SOFISSTORE'), 'sofisstore');
  assert.equal(parseSource('', '/'), 'direct');
  assert.equal(parseSource('', '/tiktokx'), 'direct');
  assert.equal(parseSource('', '/src/app.js'), 'direct');
  assert.equal(parseSource('?src=facebook', '/tiktok'), 'facebook');
  assert.equal(cleanUrl('https://spitothiki.web.app/TikTok/'), '/');
  assert.equal(cleanUrl('https://spitothiki.web.app/viber#bills'), '/#bills');
  assert.ok(!SHORT_PATH.test('/tiktok/x') && !SHORT_PATH.test('/index.html'));
  const storage = memory(); const sent = []; const replaced = [];
  await initSource({ storage, loc: { href: 'https://spitothiki.web.app/TIKTOK', search: '', pathname: '/TIKTOK' }, hist: { replaceState: (_s, _t, u) => replaced.push(u) }, send: async (...a) => { sent.push(a); return true; } });
  assert.deepEqual(sent, [['visit', 'tiktok']]); assert.deepEqual(replaced, ['/']);
});

test('v1.8.3 short links: hosting redirect (302) and service worker use the same list', async () => {
  const { readFileSync } = await import('node:fs');
  const fb = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url)));
  const rule = fb.hosting.redirects.find((r) => r.destination === '/?src=:src');
  assert.equal(rule.type, 302);
  assert.ok(rule.regex.includes(`(?P<src>${SOURCES.join('|')})`) && rule.regex.includes('(?i)'));
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.ok(sw.includes(`/^\\/(${SOURCES.join('|')})\\/?$/i`));
  for (const f of SOURCES) assert.throws(() => readFileSync(new URL(`../${f}`, import.meta.url)), 'no file or folder clashes with a short link');
});
