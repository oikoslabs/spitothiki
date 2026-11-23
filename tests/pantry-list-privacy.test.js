import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries } from '../src/i18n.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function settingsFn() {
  const app = read('src/app.js');
  const start = app.indexOf('function renderSettings()');
  const end = app.indexOf('\nfunction ', start + 1);
  return app.slice(start, end);
}

function inventoryCardFn() {
  const app = read('src/app.js');
  const start = app.indexOf('function renderInventoryCard(');
  const end = app.indexOf('\nfunction ', start + 1);
  return app.slice(start, end);
}

test('pantry card has a one-tap finish-and-add action, without removing Στη λίστα', () => {
  const card = inventoryCardFn();
  assert.match(card, /data-action="add-to-shopping"/);
  assert.match(card, /data-action="finish-to-list"/);
  assert.match(card, /t\('Τελείωσε; Βάλ’ το στη λίστα'\)/);
  const app = read('src/app.js');
  assert.match(app, /finishItemToShopping/);
  const handler = app.slice(app.indexOf("action === 'finish-to-list'"), app.indexOf("action === 'toggle-shopping'"));
  assert.match(handler, /undoable\(t\('Μπήκε στη λίστα ψωνιών'\)/);
  assert.match(handler, /finishItemToShopping\(state\.items, state\.shopping, id\)/);
});

test('Σχετικά has an honest «Τι δεν μαζεύουμε» box linked to the privacy page', () => {
  const settings = settingsFn();
  assert.match(settings, /id="we-dont-box"/);
  assert.match(settings, /t\('Τι δεν μαζεύουμε'\)/);
  for (const claim of [
    'Χωρίς διαφημίσεις',
    'Δεν πουλάμε δεδομένα',
    'Τα στοιχεία του σπιτιού σου τα βλέπουν μόνο τα μέλη του σπιτιού',
    'Ανώνυμες μετρήσεις χωρίς cookies',
    'Μπορείς να τα σβήσεις όλα όποτε θες'
  ]) {
    assert.match(settings, new RegExp(`t\\('${claim}'\\)`));
  }
  assert.match(settings, /href="\.\/privacy\.html"/);
  assert.match(settings, /t\('Πλήρης πολιτική απορρήτου'\)/);
  assert.doesNotMatch(settings, /χωρίς μετρήσεις|no analytics|δεν μετράμε/i);
  assert.doesNotMatch(settings, /Σκολαρ|Skolarikis|Γιάννης |Giannis /);
});

test('we-dont claims have English strings and match the privacy policy wording', () => {
  const en = dictionaries.en;
  assert.equal(en['Τι δεν μαζεύουμε'], 'What we don’t collect');
  assert.equal(en['Χωρίς διαφημίσεις'], 'No ads');
  assert.equal(en['Δεν πουλάμε δεδομένα'], 'We don’t sell data');
  assert.equal(en['Τα στοιχεία του σπιτιού σου τα βλέπουν μόνο τα μέλη του σπιτιού'], 'Only members of your household can see your household data');
  assert.equal(en['Ανώνυμες μετρήσεις χωρίς cookies'], 'Anonymous measurements, no cookies');
  assert.equal(en['Μπορείς να τα σβήσεις όλα όποτε θες'], 'You can delete everything whenever you want');
  assert.equal(en['Τελείωσε; Βάλ’ το στη λίστα'], 'Finished? Add it to the list');
  assert.equal(en['Μπήκε στη λίστα ψωνιών'], 'Added to the shopping list');

  const policy = read('privacy.html');
  assert.match(policy, /Δεν έχει διαφημίσεις/);
  assert.match(policy, /δεν πουλάμε δεδομένα/);
  assert.match(policy, /Cloudflare Web Analytics, που λειτουργεί χωρίς cookies/);
  assert.match(policy, /μόνο ανώνυμη μέτρηση|ανώνυμ/i);
  assert.match(policy, /Διαγραφή όλων|διαγραφ/i);
  assert.match(policy, /μέλη του νοικοκυριού|μόνο τα μέλη/);
});
