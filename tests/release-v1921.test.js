import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('v1.9.21 release: version, cache bump and guide module precached', () => {
  assert.match(read('package.json'), /"version": "1\.9\.22"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.22</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v123';/);
  for (const f of ['guide', 'home-actions', 'tester-card', 'app']) assert.match(sw, new RegExp(`'\\./src/${f}\\.js'`));
});
