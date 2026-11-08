import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries } from '../src/i18n.js';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const home = app.slice(app.indexOf('function renderOverview()'), app.indexOf('function renderPantryList'));

test('friendly home: three primary actions (scan, manual, list) come right after the header, before cards and totals', () => {
  assert.match(app, /const HOME_PRIMARY = \[\n  \{ id: 'scan'[^\n]*\n  \{ id: 'manual'[^\n]*\n  \{ id: 'list'/);
  const order = ['home-hero', 'renderHomePrimary()', 'renderStarterCard()', 'renderProtectCard()', 'renderTesterCard()', 'home-stats', 'id="home-month"', 'renderHomeMore()'];
  const pos = order.map((k) => home.indexOf(k));
  pos.forEach((p, i) => assert.ok(p > -1, order[i]));
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
});
test('friendly home: every action that used to be on home is still reachable; ids/data-quick unchanged', () => {
  const groups = app.slice(app.indexOf('const HOME_GROUPS'), app.indexOf('function renderHomePrimary'));
  for (const id of ['extra', 'transport', 'bill', 'product']) assert.match(groups, new RegExp(`'${id}'`));
  assert.match(app, /data-action="quick" data-quick="all" aria-haspopup="dialog">\$\{escapeHtml\(t\('Όλες οι κινήσεις →'\)\)\}/);
  assert.match(app, /class="home-primary" id="home-quick"/); // existing tests/automation keep finding #home-quick
  assert.match(home, /data-card="all" id="home-card-all"/); assert.match(home, /data-view="insights"/);
});
test('friendly home: privacy/backup and tester cards stay; starter keeps scan + examples, details are optional', () => {
  assert.match(home, /renderProtectCard\(\)/);
  const starter = app.slice(app.indexOf('function renderStarterCard'), app.indexOf('function storageBadge'));
  assert.match(starter, /<details class="starter-more"/);
  assert.ok(starter.indexOf('id="starter-scan"') < starter.indexOf('<details'));
  assert.ok(starter.indexOf('starter-note') > starter.indexOf('</details>')); // «Δωρεάν… μένουν στο κινητό σου» always visible
  assert.match(starter, /ΑΑΔΕ/);
});
test('friendly home: Greek/English strings and touch-size/responsive CSS', () => {
  for (const k of ['Τι θέλεις να κάνεις τώρα;', 'Βασικές κινήσεις', 'Σκάναρε απόδειξη', 'ή λογαριασμό, διόδια, προϊόν', 'Έξοδο με το χέρι', 'Χωρίς απόδειξη', 'Λίστα αγορών', 'Πρόσθεσε κάτι που χρειάζεσαι', 'Περισσότερα', 'Όλες οι κινήσεις →', 'Έξοδα', 'Σπίτι & ψώνια', 'Κάθε απόδειξη που σκανάρεις μπαίνει στα έξοδα του μήνα.', 'Πώς δουλεύει;'])
    assert.ok(dictionaries.en[k], `EN missing: ${k}`);
  assert.match(css, /\.home-more-chip \{ min-height: 44px/);
  assert.match(css, /\.quick-action\.home-primary-action \{ flex-direction: column;[^}]*min-height: 96px/);
  assert.match(css, /\.home-primary-action:focus-visible/);
});
