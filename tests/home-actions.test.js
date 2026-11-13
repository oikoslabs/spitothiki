import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_HOME, HOME_KEY, HOME_OPTIONS, isDefaultHome, isDefaultHomeState, normalizeHome, parseHome, parseHomeState, serializeHome, toggleHome } from '../src/home-actions.js';
import { BAR_KEY } from '../src/bar.js';
import { dictionaries } from '../src/i18n.js';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

test('home shortcuts: default is scan, manual, list when nothing is saved or the value is broken', () => {
  assert.deepEqual(DEFAULT_HOME, ['scan', 'manual', 'list']);
  for (const raw of [null, undefined, '', '{x', '"scan"', '{"a":1}', '42']) assert.deepEqual(parseHome(raw), DEFAULT_HOME);
  assert.notEqual(HOME_KEY, BAR_KEY); // separate from the bottom bar
});
test('home shortcuts: unknown ids dropped, no duplicates, stable catalog order, empty allowed', () => {
  assert.deepEqual(parseHome(JSON.stringify(['cook', 'bogus', 'scan', 'scan', 7, null, '__proto__'])), ['scan', 'cook']);
  assert.deepEqual(parseHome('[]'), []);
  assert.deepEqual(normalizeHome(['view:settings', 'all']), []);
  assert.deepEqual(normalizeHome('x'), DEFAULT_HOME);
});
test('home shortcuts: toggle on/off, reset detection', () => {
  let ids = toggleHome(DEFAULT_HOME, 'transport', true); assert.deepEqual(ids, ['scan', 'manual', 'list', 'transport']);
  ids = toggleHome(ids, 'transport', true); assert.deepEqual(ids, ['scan', 'manual', 'list', 'transport']);
  ids = toggleHome(ids, 'scan', false); assert.deepEqual(ids, ['manual', 'list', 'transport']);
  for (const id of [...ids]) ids = toggleHome(ids, id, false); assert.deepEqual(ids, []);
  assert.deepEqual(toggleHome(ids, 'hack', true), []);
  assert.ok(isDefaultHome(['list', 'scan', 'manual'])); assert.ok(!isDefaultHome([]));
});
test('home shortcuts: every option is a real quick action with EN label; catalog has the approved functions', () => {
  for (const id of ['scan', 'manual', 'list', 'extra', 'transport', 'bill', 'rent', 'product', 'cart', 'cook']) assert.ok(HOME_OPTIONS.includes(id));
  for (const id of HOME_OPTIONS) assert.match(app, new RegExp(`\\{ id: '${id}', icon:`));
});
test('home shortcuts: Settings card, persistence, reset, no duplicates in «Περισσότερα», never stranded', () => {
  assert.match(app, /\$\{renderHomeCard\(\)\}\$\{renderBarCard\(\)\}/);
  assert.match(app, /saveHome\(toggleHome\(homeIds\(\), event\.target\.dataset\.homeId, event\.target\.checked\)\)/);
  assert.match(app, /serializeHome\(\{ ids, guide: guide !== false, insights: insights !== false \}\)/);
  assert.match(app, /action === 'home-reset'\) \{ saveHome\(\[\.\.\.DEFAULT_HOME\], true, true\)/);
  assert.match(app, /dataset\?\.homeGuide/);
  assert.match(app, /dataset\?\.homeInsights/);
  assert.match(app, /id="home-choice-insights"/);
  assert.match(app, /id="home-guide"/);
  assert.match(app, /data-home-guide="1"/);
  assert.match(app, /function renderHomeGuide/);
  assert.match(app, /g\.ids\.filter\(\(id\) => !chosen\.has\(id\)\)/);
  const more = app.slice(app.indexOf('function renderHomeMore'), app.indexOf('function renderHomeCard'));
  assert.match(more, /data-quick="all"/); assert.match(more, /data-view="settings" data-focus="home-card"/);
  const prim = app.slice(app.indexOf('function renderHomePrimary'), app.indexOf('function renderHomeMore'));
  assert.match(prim, /if \(!ids\.length\)[^\n]*data-view="settings"/);
  // every option not chosen is still in a «Περισσότερα» group
  const groups = app.slice(app.indexOf('const HOME_GROUPS'), app.indexOf('const homeIds'));
  for (const id of HOME_OPTIONS) assert.match(groups, new RegExp(`'${id}'`));
  assert.doesNotMatch(app.slice(app.indexOf('function saveHome'), app.indexOf('function renderHomePrimary')), /BAR_KEY/);
});
test('home shortcuts: Greek/English strings', () => {
  const card = app.slice(app.indexOf('function renderHomeCard'), app.indexOf('function renderOverview'));
  const keys = [...card.matchAll(/t\('([^']+)'\)/g)].map((m) => m[1]).concat(['Δεν έχεις διαλέξει συντομεύσεις για την αρχική. Όλες οι λειτουργίες είναι στα «Περισσότερα» και στο μενού.', 'Διάλεξε στις Ρυθμίσεις', 'Άλλαξε τι φαίνεται στην αρχική', 'Η αρχική επανήλθε.', 'Η αρχική ενημερώθηκε.', 'Οδηγός χρήσης', 'Φαίνεται ως μικρός σύνδεσμος στην κορυφή της αρχικής, όχι ως μεγάλο κουμπί.']);
  for (const k of keys) assert.ok(dictionaries.en[k], `EN missing: ${k}`);
});

test('home guide link: on by default, even with a saved custom layout; hidden only when explicitly turned off', () => {
  assert.deepEqual(parseHomeState(null), { ids: DEFAULT_HOME, guide: true, insights: true });
  assert.deepEqual(parseHomeState(JSON.stringify(['scan', 'transport'])), { ids: ['scan', 'transport'], guide: true, insights: true });
  assert.deepEqual(parseHomeState('[]'), { ids: [], guide: true, insights: true });
  assert.deepEqual(parseHomeState(JSON.stringify({ ids: ['list'], guide: false })), { ids: ['list'], guide: false, insights: true });
  assert.deepEqual(parseHomeState(JSON.stringify({ ids: ['list'], guide: true, insights: false })), { ids: ['list'], guide: true, insights: false });
  assert.equal(serializeHome({ ids: DEFAULT_HOME, guide: true, insights: true }), null);
  assert.equal(serializeHome({ ids: ['scan', 'transport'], guide: true }), JSON.stringify({ ids: ['scan', 'transport'], guide: true, insights: true }));
  assert.equal(serializeHome({ ids: DEFAULT_HOME, guide: false }), JSON.stringify({ ids: DEFAULT_HOME, guide: false, insights: true }));
  assert.equal(serializeHome({ ids: DEFAULT_HOME, guide: true, insights: false }), JSON.stringify({ ids: DEFAULT_HOME, guide: true, insights: false }));
  assert.ok(isDefaultHomeState({ ids: ['list', 'scan', 'manual'], guide: true, insights: true }));
  assert.ok(!isDefaultHomeState({ ids: DEFAULT_HOME, guide: false }));
  assert.ok(!isDefaultHomeState({ ids: DEFAULT_HOME, guide: true, insights: false }));
});
