import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS, searchGuide } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.33 release: version, cache v141, home sign-in card and guide', () => {
  assert.match(read('package.json'), /"version": "1\.9\.33"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.33</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=141/);
  assert.match(html, /src\/app\.js\?v=141/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v141';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v141-preview'/);
  assert.match(sw, /styles\.css\?v=141/);
  const app = read('src/app.js');
  assert.match(app, /signin-nudge/);
  assert.match(app, /id="home-signin-card"/);
  assert.match(app, /\$\{renderStarterCard\(\)\}\$\{renderSigninCard\(\)\}\$\{renderProtectCard\(\)\}/);
  const guide = read('src/guide.js');
  assert.match(guide, /Τι νέο στην 1\.9\.33/);
  assert.ok(searchGuide('1.9.33').some((s) => s.id === 'whats-new'));
  assert.ok(searchGuide('1.9.30').some((s) => s.id === 'whats-new'));
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.ok(dictionaries.en[whats.title], 'EN missing title');
  assert.ok(dictionaries.en[whats.intro], 'EN missing intro');
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
});
