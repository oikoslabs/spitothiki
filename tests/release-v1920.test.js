import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('v1.9.20 release: version, cache bump and product-types module precached', () => {
  assert.match(read('package.json'), /"version": "1\.9\.22"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.22</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v124';/);
  for (const f of ['product-types', 'home-actions', 'storage', 'app']) assert.match(sw, new RegExp(`'\\./src/${f}\\.js'`));
});
