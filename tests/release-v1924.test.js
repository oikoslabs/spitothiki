import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('v1.9.24 release: version, cache bump, About links, insights and PDF export', () => {
  assert.match(read('package.json'), /"version": "1\.9\.25"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.25</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v131';/);
  assert.match(read('src/app.js'), /id="about"/);
  assert.match(read('src/app.js'), /https:\/\/www\.facebook\.com\/people\/SpitoThiki\/61596458362898\//);
  assert.match(read('src/app.js'), /https:\/\/t\.me\/spitothiki/);
  assert.match(read('src/app.js'), /https:\/\/www\.tiktok\.com\/@spitothikiapp/);
  assert.match(read('src/app.js'), /Τι άλλαξε αυτόν τον μήνα/);
  assert.match(read('styles.css'), /\.suggest-chip[^}]*background: var\(--surface\)/);
  for (const f of ['month-insights', 'receipt-pdf', 'pdf-doc', 'shopping-extras', 'guide', 'app']) {
    assert.match(sw, new RegExp(`'\\./src/${f}\\.js'`));
  }
  assert.match(sw, /pdf-sans-el\.ttf/);
});
