import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS, searchGuide } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.37 release: version, cache v145, About trust copy without a personal name', () => {
  assert.match(read('package.json'), /"version": "1\.9\.42"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.42</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=158/);
  assert.match(html, /src\/app\.js\?v=158/);
  assert.doesNotMatch(html, /v=145-preview/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v158';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v145-preview'/);
  assert.match(sw, /styles\.css\?v=158'/);
  assert.match(sw, /src\/app\.js\?v=158'/);
  const app = read('src/app.js');
  assert.match(app, /Η Σπιτοθήκη φτιάχνεται από την Oikos Labs\./);
  assert.doesNotMatch(app, /Γιάννης /);
  const guide = read('src/guide.js');
  assert.match(guide, /Τι νέο στην 1\.9\.37/);
  assert.doesNotMatch(guide, /Γιάννης /);
  assert.ok(searchGuide('1.9.37').some((s) => s.id === 'whats-new'));
  assert.ok(searchGuide('1.9.36').some((s) => s.id === 'whats-new'));
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.match(whats.title, /Τι νέο στην 1\.9\.\d+/);
  assert.match(guide, /Τι νέο στην 1\.9\.37/);
  assert.ok(dictionaries.en[whats.title]);
  assert.ok(dictionaries.en[whats.intro]);
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
});
