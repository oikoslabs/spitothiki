import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeParsed, parseDietText } from '../src/diet-plan.js';
import { dictionaries } from '../src/i18n.js';

// Anonymised two-sided sheet: front has two meals, back continues one and adds a new one.
const front = parseDietText('ΠΡΩΙΝΟ (08:00)\n- 1 φέτα ψωμί με τυρί\n- 1 γιαούρτι με μέλι\nΣΝΑΚ (11:00)\n- 1 μήλο');
const back = parseDietText('ΣΝΑΚ (11:00)\n- 1 μήλο\n- 10 αμύγδαλα\nΒΡΑΔΙΝΟ (21:00)\n- σαλάτα με τόνο');

test('add page: merges by meal, dedupes, never replaces', () => {
  const m = mergeParsed(front, back);
  assert.deepEqual(m.slots.map((s) => [s.time, s.options.length]), [['08:00', 2], ['11:00', 2], ['21:00', 1]]);
  assert.equal(m.slots[0].options[0].text, front.slots[0].options[0].text);
  assert.equal(front.slots[1].options.length, 1, 'input not mutated');
});

test('add page: same page twice adds nothing; empty base slot accepted', () => {
  const twice = mergeParsed(front, front);
  assert.deepEqual(twice.slots.map((s) => s.options.length), front.slots.map((s) => s.options.length));
  const base = { title: '', appointment: '', slots: [{ id: '', name: 'Πρωινό', time: '', options: [{ text: '', perWeek: null }] }] };
  const m = mergeParsed(base, front);
  assert.ok(m.slots[0].options.every((o) => o.text));
});

test('add page: English strings exist', () => {
  for (const k of ['Πρόσθεσε κι άλλη σελίδα (πίσω όψη)', '{n} σελίδα', '{n} σελίδες', 'Διαβάζω τη νέα σελίδα…', 'Προστέθηκαν {count} επιλογές από τη νέα σελίδα.', 'Δεν βρέθηκαν νέες επιλογές σε αυτή τη σελίδα.']) assert.ok(dictionaries.en?.[k] || dictionaries.EN?.[k], k);
});
