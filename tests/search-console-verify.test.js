import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url));
const NAME = 'googlec9f0399d122996a3.html';
const BODY = Buffer.from('google-site-verification: googlec9f0399d122996a3.html');

test('Search Console HTML file is at the hosting root, exact bytes, and is deployed as-is', () => {
  const bytes = read(NAME);
  assert.deepEqual(bytes, BODY);
  assert.equal(bytes.length, 53);

  const { hosting } = JSON.parse(read('firebase.json').toString('utf8'));
  assert.equal(hosting.public, '.');
  assert.equal(hosting.cleanUrls, false);
  assert.ok(!hosting.rewrites, 'no SPA catch-all rewrites that could swallow the verification file');
  for (const pattern of hosting.ignore || []) {
    assert.ok(![NAME, '*.html', '**/*.html', 'google*.html'].includes(pattern), pattern);
  }
  assert.doesNotMatch(NAME, /^(tiktok|facebook|instagram|telegram|viber|reddit|pinterest|sofisstore|play)$/i);

  const sw = read('sw.js').toString('utf8');
  assert.doesNotMatch(sw, /googlec9f0399d122996a3/);
});
