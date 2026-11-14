import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('v1.9.22 release: version, cache bump and shopping-extras module precached', () => {
  assert.match(read('package.json'), /"version": "1\.9\.32"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.32</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v141-preview';/);
  for (const f of ['shopping-extras', 'guide', 'sync-core', 'app']) assert.match(sw, new RegExp(`'\\./src/${f}\\.js(\\?[^']*)?'`));
});
