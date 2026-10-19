import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanOption, createDietPlan, extractIngredients, generateWeek, overLimit, parseDietText, setWeek, usage, weekIngredients } from '../src/diet-plan.js';
import { dictionaries } from '../src/i18n.js';

const fixture = readFileSync(new URL('./fixtures/diet-plan.txt', import.meta.url), 'utf8');
const summary = (p) => p.slots.map((s) => [s.name, s.time, s.options.length]);
const EXPECTED = [['Πρωινό', '12:00', 4], ['Κυρίως γεύμα', '15:00', 5], ['Σνακ', '18:00', 6], ['Ελαφρύ γεύμα', '21:30', 7]];

test('diet parser: transcribed sample -> 4 slots with times and 22 options', () => {
  const p = parseDietText(fixture);
  assert.deepEqual(summary(p), EXPECTED);
  assert.equal(p.appointment, '01/01/27 10:00');
  const main = p.slots[1].options;
  assert.deepEqual(main.map((o) => o.perWeek), [2, 1, 2, 1, 1]);
  assert.match(main[0].text, /^Άφθονη σαλάτα .* 1 Krispie$/); // wrapped lines joined, frequency and trailing «ή» removed
  assert.ok(!/εβδομάδα|\(\s*$/.test(main[1].text), main[1].text);
  assert.equal(p.slots[0].options[0].text, '1 φέτα γερμανικού τύπου με 1/3 αβοκάντο και 1 αβγό βραστό');
  const free = p.slots[3].options[1];
  assert.equal(free.free, true); assert.equal(free.perWeek, 1);
  assert.equal(p.slots[3].options.at(-1).text, 'Παντζαροσαλάτα');
});

test('diet parser: noisy OCR variants', () => {
  // other bullet glyphs and OCR junk bullets
  for (const b of ['•', '■', '-', '*', '»', 'e']) assert.deepEqual(summary(parseDietText(fixture.replace(/^[▪•] /gm, `${b} `))), EXPECTED, b);
  // bullets lost: options separated by the trailing «ή» (read as plain η), wrapped lines still joined
  const noBullets = parseDietText(fixture.replace(/^[▪•] /gm, '').replace(/ ή$/gm, ' η'));
  assert.equal(noBullets.slots[0].options.length, 4);
  assert.equal(noBullets.slots[1].options[0].perWeek, 2);
  // spacing/case noise in headers and frequencies
  const messy = parseDietText('ΕΠΙΛΟΓΕΣ ΠΡΩΙΝΟΥ (12.00)\n• 1 αβγό ή\n• 1 τοστ (2φορες την εβδομαδα) ή\nΣΝΑΚ ( 18 : 00 )\n• 1 φρούτο');
  assert.deepEqual(summary(messy), [['Πρωινό', '12:00', 2], ['Σνακ', '18:00', 1]]);
  assert.equal(messy.slots[0].options[1].perWeek, 2);
  assert.equal(messy.slots[0].options[1].text, '1 τοστ');
  assert.deepEqual(parseDietText('random text\nnothing here').slots, []);
  assert.deepEqual(cleanOption('▪ 1 φορά μπορείς να φας απέξω ότι θέλεις ή'), { text: '1 φορά μπορείς να φας απέξω ότι θέλεις', perWeek: 1, free: true });
});

test('diet week: frequency limits respected, variety, free item at most as stated', () => {
  const plan = createDietPlan({ person: 'Νίκος', parsed: parseDietText(fixture) });
  for (let seed = 1; seed <= 60; seed++) {
    const week = generateWeek(plan, { seed });
    assert.deepEqual(overLimit(plan, week), []);
    for (const slot of plan.slots) {
      assert.equal(week[slot.id].length, 7);
      assert.ok(week[slot.id].every(Boolean), 'all days filled');
      for (let d = 1; d < 7; d++) if (slot.options.length > 1) assert.notEqual(week[slot.id][d], week[slot.id][d - 1], 'no same option two days in a row');
      if (slot.options.length >= 4) assert.ok(new Set(week[slot.id]).size >= 4, 'rotates options');
    }
    const freeId = plan.slots[3].options[1].id;
    assert.ok((usage(week, plan.slots[3].id).get(freeId) || 0) <= 1);
  }
  // Limits that cannot fill the week leave empty days instead of breaking them.
  const tight = createDietPlan({ parsed: { slots: [{ name: 'Σνακ', time: '', options: [{ text: 'Α', perWeek: 2 }, { text: 'Β', perWeek: 1 }] }] } });
  const w = generateWeek(tight, { seed: 5 });
  assert.equal(w[tight.slots[0].id].filter(Boolean).length, 3);
  // Manual swap over the limit is reported.
  const week = generateWeek(plan, { seed: 2 }); const main = plan.slots[1];
  week[main.id] = Array(7).fill(main.options[1].id);
  assert.deepEqual(overLimit(plan, week).map((x) => [x.used, x.limit]), [[7, 1]]);
  // Weeks are kept per Monday, last 8 only.
  let p = plan; for (let i = 0; i < 10; i++) p = setWeek(p, `2026-${String(i + 1).padStart(2, '0')}-05`, week);
  assert.equal(Object.keys(p.weeks).length, 8);
  assert.throws(() => createDietPlan({ parsed: { slots: [] } }));
});

test('diet ingredients: quantities and preparation stripped, first alternative, aggregation, pantry/list', () => {
  const names = (s) => extractIngredients(s).map((e) => e.name);
  assert.deepEqual(names('Άφθονη σαλάτα με 1 κ.σ ελαιόλαδο με 2 αβγά βραστά και 2 krispie'), ['Λαχανικά σαλάτας', 'Αυγά', 'Krispies']);
  assert.deepEqual(extractIngredients('Άφθονη σαλάτα με 1 κ.σ ελαιόλαδο με 2 αβγά βραστά').find((e) => e.name === 'Αυγά').qty, 2);
  assert.deepEqual(names('1 αραβική πίτα ή τορτίγια ολικής άλεσης με 6 κοτομπουκιές'), ['Πίτες', 'Κοτομπουκιές']);
  assert.deepEqual(names('1,5 φλ. σπανακόρυζο ή μπριαμ ή αρακάς με 1 κομμάτι ανθότυρο'), ['Σπανάκι', 'Ανθότυρο']);
  assert.deepEqual(names('1 φορά μπορείς να φας απέξω ότι θέλεις'), []);
  assert.deepEqual(names('Παντζαροσαλάτα'), ['Παντζάρια']);
  const plan = createDietPlan({ parsed: parseDietText(fixture) });
  const week = generateWeek(plan, { seed: 7 });
  const rows = weekIngredients(plan, week, { items: [{ name: 'Αυγά', quantity: 30 }, { name: 'Μέλι', quantity: 1 }, { name: 'Ελαιόλαδο', quantity: 1 }], shopping: [{ name: 'Γιαούρτι', checked: false }] });
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.ok(!by['Ελαιόλαδο']);
  assert.ok(by['Αυγά'].count >= 2 && by['Αυγά'].have);
  if (by['Γιαούρτι']) assert.equal(by['Γιαούρτι'].pending, true);
  assert.equal(by['Λαχανικά σαλάτας'].have, false);
  const few = weekIngredients(plan, week, { items: [{ name: 'Αυγά', quantity: 1 }] });
  assert.equal(few.find((r) => r.name === 'Αυγά').have, by['Αυγά'].count <= 1);
});

test('diet UI strings all have English translations', () => {
  const source = readFileSync(new URL('../src/diet-ui.js', import.meta.url), 'utf8');
  const keys = [...source.matchAll(/'((?:[^'\\]|\\.)*[\u0370-\u03ff](?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((k) => !/^[\s\S]*\$\{/.test(k) && !k.includes('<'));
  const pure = readFileSync(new URL('../src/diet-plan.js', import.meta.url), 'utf8');
  const canon = [...pure.matchAll(/\/, '([^']+)'/g)].map((m) => m[1]);
  for (const key of [...keys, ...canon]) assert.ok(Object.hasOwn(dictionaries.en, key), `missing en: ${key}`);
});
