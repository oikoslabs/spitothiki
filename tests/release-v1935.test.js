import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS, searchGuide } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.35 release: version, cache v143, sign-in benefits and once-only prompts', () => {
  assert.match(read('package.json'), /"version": "1\.9\.35"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.35</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=143/);
  assert.match(html, /src\/app\.js\?v=143/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v143';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v142-preview'/);
  assert.match(sw, /styles\.css\?v=143/);
  assert.match(sw, /src\/app\.js\?v=143/);
  const app = read('src/app.js');
  assert.match(app, /signin-benefits/);
  assert.match(app, /function offerSigninPrompt/);
  assert.match(app, /offerSigninPrompt\('scans'/);
  assert.match(app, /offerSigninPrompt\('share'/);
  assert.match(app, /offerSigninPrompt\('member'/);
  assert.match(app, /offerSigninPrompt\('entries'/);
  const guide = read('src/guide.js');
  assert.match(guide, /Τι νέο στην 1\.9\.35/);
  assert.ok(searchGuide('1.9.35').some((s) => s.id === 'whats-new'));
  assert.ok(searchGuide('1.9.34').some((s) => s.id === 'whats-new'));
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.equal(whats.title, 'Τι νέο στην 1.9.35');
  assert.ok(dictionaries.en[whats.title]);
  assert.ok(dictionaries.en[whats.intro]);
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
});
