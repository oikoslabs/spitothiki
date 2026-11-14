import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS, searchGuide } from '../src/guide.js';
import { calendarProEnabled } from '../src/calendar.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.29 release: version, cache bump, budget, calendar and guide', () => {
  assert.match(read('package.json'), /"version": "1\.9\.33"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.33</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v141';/);
  assert.match(sw, /src\/budget\.js/);
  assert.match(sw, /src\/calendar\.js/);
  assert.match(read('src/storage.js'), /'budgets'/);
  assert.match(read('src/storage.js'), /'events'/);
  const cal = read('src/calendar.js');
  assert.match(cal, /TODO\(pro\)/);
  assert.match(cal, /export function calendarProEnabled/);
  assert.equal(calendarProEnabled(), true);
  const app = read('src/app.js');
  assert.match(app, /renderHomeBudget/);
  assert.match(app, /renderHomeCalendar/);
  assert.match(app, /activeView === 'calendar'/);
  const guide = read('src/guide.js');
  assert.match(guide, /id: 'whats-new'/);
  assert.match(guide, /Τι νέο στην 1\.9\.30/);
  assert.match(guide, /id: 'budget'/);
  assert.match(guide, /id: 'calendar'/);
  assert.ok(GUIDE_SECTIONS.some((s) => s.id === 'whats-new' && s.numbered === false));
  assert.ok(GUIDE_SECTIONS.some((s) => s.id === 'budget' && s.title === 'Προϋπολογισμός μήνα'));
  assert.ok(searchGuide('1.9.30').some((s) => s.id === 'whats-new'));
  assert.ok(searchGuide('1.9.29').some((s) => s.id === 'whats-new'));
  assert.ok(searchGuide('προϋπολογισμ').some((s) => s.id === 'budget' || s.id === 'whats-new'));
  assert.ok(searchGuide('ημερολογιο').some((s) => s.id === 'calendar'));
  for (const section of GUIDE_SECTIONS.filter((s) => s.id === 'whats-new' || s.id === 'budget' || s.id === 'calendar')) {
    assert.ok(dictionaries.en[section.title], `EN missing title: ${section.title}`);
    assert.ok(dictionaries.en[section.intro], `EN missing intro: ${section.intro}`);
    for (const b of section.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
  }
});
