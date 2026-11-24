import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS, searchGuide } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.39 release: version, cache v147, expense category on scanned receipt review', () => {
  assert.match(read('package.json'), /"version": "1\.9\.48"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.48</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=168/);
  assert.match(html, /src\/app\.js\?v=168/);
  assert.doesNotMatch(html, /v=168-preview/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v168';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v147-preview'/);
  assert.match(sw, /styles\.css\?v=168'/);
  assert.match(sw, /src\/app\.js\?v=168'/);
  const app = read('src/app.js');
  assert.match(app, /function receiptReviewExpCatFields\(/);
  assert.match(app, /id="review-expcat"/);
  assert.match(app, /name="toSpending" checked> <span>Κατέγραψε τα έξοδα στο Σύνολο εξόδων<\/span><\/label>\s*\$\{receiptReviewExpCatFields\(\)\}/);
  assert.match(app, /name="mode" value="total">\$\{toTransport \? '' : receiptReviewExpCatFields\(\)\}/);
  assert.doesNotMatch(app, /Γιάννης /);
  assert.doesNotMatch(app, /Σκολαρ|Skolarikis/);
  const guide = read('src/guide.js');
  assert.match(guide, /Τι νέο στην 1\.9\.39/);
  assert.doesNotMatch(guide, /Γιάννης /);
  assert.ok(searchGuide('1.9.39').some((s) => s.id === 'whats-new'));
  assert.ok(searchGuide('1.9.38').some((s) => s.id === 'whats-new'));
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.match(whats.title, /Τι νέο στην 1\.9\.\d+/);
  assert.match(guide, /Τι νέο στην 1\.9\.39/);
  assert.ok(dictionaries.en[whats.title]);
  assert.ok(dictionaries.en[whats.intro]);
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
});
