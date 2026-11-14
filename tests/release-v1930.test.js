import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS, searchGuide } from '../src/guide.js';
import { billCalendarStatus, shortDayMonth } from '../src/calendar.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.30 release: version, cache bump, calendar bill status and guide', () => {
  assert.match(read('package.json'), /"version": "1\.9\.34"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.34</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v142';/);
  const today = '2026-11-14';
  assert.equal(billCalendarStatus({ due: '2026-11-10', paid: false }, today).overdue, true);
  assert.equal(billCalendarStatus({ due: '2026-11-20', paid: false }, today).pending, true);
  assert.equal(billCalendarStatus({ due: '2026-11-01', paid: true, paidAt: '2026-11-12' }, today).paidAt, '2026-11-12');
  assert.equal(shortDayMonth('2026-11-12', today), '12/11');
  const app = read('src/app.js');
  assert.match(app, /function calendarBillStatusLine/);
  assert.match(app, /openBillDialog\(sourceId\)/);
  assert.match(app, /⏳ /);
  const guide = read('src/guide.js');
  assert.match(guide, /Τι νέο στην 1\.9\.30/);
  assert.match(guide, /✓ Πληρώθηκε/);
  assert.ok(searchGuide('1.9.30').some((s) => s.id === 'whats-new'));
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  const calendar = GUIDE_SECTIONS.find((s) => s.id === 'calendar');
  for (const section of [whats, calendar]) {
    assert.ok(dictionaries.en[section.title], `EN missing title: ${section.title}`);
    assert.ok(dictionaries.en[section.intro], `EN missing intro: ${section.intro}`);
    for (const b of section.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
  }
  assert.ok(dictionaries.en['✓ Πληρώθηκε {date}']);
  assert.ok(dictionaries.en['✓ Πληρώθηκε']);
});
