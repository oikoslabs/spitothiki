import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.31 release: version, cache bump, anonymous t=1 owner/preview flag', () => {
  assert.match(read('package.json'), /"version": "1\.9\.34"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.34</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v142';/);
  assert.match(sw, /src\/owner\.js/);
  const owner = read('src/owner.js');
  assert.match(owner, /export async function isOwnerEmail/);
  assert.equal(owner.includes('@'), false);
  const source = read('src/source.js');
  assert.match(source, /setOwnerTestFlag/);
  assert.match(source, /t: 1/);
  assert.match(read('src/app.js'), /refreshOwnerTestFlag/);
  assert.match(read('src/receipt.js'), /isStatsTest/);
});
