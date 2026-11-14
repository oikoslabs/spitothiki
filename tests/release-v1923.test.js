import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('v1.9.23 release: version, cache bump and on-device scan counts', () => {
  assert.match(read('package.json'), /"version": "1\.9\.28"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.28</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v134';/);
  assert.match(read('src/source.js'), /reportScan/);
  assert.match(read('src/receipt-store.js'), /classifyStore/);
  for (const f of ['shopping-extras', 'guide', 'sync-core', 'app', 'source', 'receipt-store']) assert.match(sw, new RegExp(`'\\./src/${f}\\.js'`));
});
