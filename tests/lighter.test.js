// v1.9.12: lighter visits: cache-first SW, no double download on first install, sensible Cache-Control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.12 sw: cache-first, fresh copies only on update, firebase /__/ untouched', () => {
  const sw = read('sw.js');
  assert.match(sw, /cache: update \? 'reload' : 'default'/);
  assert.match(sw, /url\.pathname\.startsWith\('\/__\/'\)/);
  assert.match(sw, /const cached = await caches\.match\(request, \{ ignoreSearch: navigate \}\);\n\s+if \(cached\) return cached;/);
});

test('v1.9.12 firebase.json: sw.js never cached, html no-cache, js/css short, fonts long', () => {
  const headers = JSON.parse(read('firebase.json')).hosting.headers;
  const cc = (src) => headers.find((h) => h.source === src)?.headers.find((x) => x.key === 'Cache-Control')?.value;
  assert.equal(cc('**/*.@(html|webmanifest)'), 'no-cache');
  assert.equal(cc('**/*.@(js|css)'), 'public, max-age=600');
  assert.match(cc('/sw.js'), /no-store/);
  assert.ok(headers.findIndex((h) => h.source === '/sw.js') > headers.findIndex((h) => h.source === '**/*.@(js|css)'));
});
