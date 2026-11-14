import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS, searchGuide } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.34 release: version, cache v142, day sheet and typed dots', () => {
  assert.match(read('package.json'), /"version": "1\.9\.35"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.35</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=143/);
  assert.match(html, /src\/app\.js\?v=143/);
  assert.match(html, /id="cal-day-sheet"/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v143';/);
  assert.match(sw, /styles\.css\?v=143/);
  const app = read('src/app.js');
  assert.match(app, /function openCalDaySheet/);
  assert.match(app, /dayDots\(/);
  const guide = read('src/guide.js');
  assert.match(guide, /Τι νέο στην 1\.9\.34/);
  assert.ok(searchGuide('1.9.34').some((s) => s.id === 'whats-new'));
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.ok(searchGuide('1.9.34').some((s) => s.id === 'whats-new'));
  assert.ok(dictionaries.en[whats.title]);
  assert.ok(dictionaries.en[whats.intro]);
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
});
