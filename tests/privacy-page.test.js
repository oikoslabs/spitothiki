import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries } from '../src/i18n.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('v1.8.7 privacy.html: standalone public page, Greek first then English, says what the app really does', () => {
  const html = read('privacy.html');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="el">/);
  assert.ok(html.indexOf('id="el"') < html.indexOf('id="en"'), 'Greek before English');
  for (const must of ['Firebase', 'Open Food Facts', 'drive.appdata', 'Cloudflare', 'Διαγραφή όλων', 'myaccount.google.com/permissions', 'Επικοινωνία', 'Limited Use', 'api-services-user-data-policy'])
    assert.ok(html.includes(must), must);
  assert.ok(!/<script/i.test(html), 'no scripts / trackers on the policy page');
});

test('v1.8.7 privacy.html: deployed (not in firebase.json ignore), cached by the SW, linked in-app', () => {
  const { hosting } = JSON.parse(read('firebase.json'));
  assert.equal(hosting.public, '.');
  for (const pattern of hosting.ignore) assert.ok(!['*.html', '**/*.html', 'privacy.html'].includes(pattern), pattern);
  const sw = read('sw.js');
  assert.match(sw, /'\.\/privacy\.html'/);
  assert.match(sw, /CACHE_VERSION = 'v167'/);
  assert.match(read('src/app.js'), /href="\.\/privacy\.html"/);
  assert.equal(dictionaries.en['Πλήρης πολιτική απορρήτου'], 'Full privacy policy');
});

test('v1.8.8 contact email: mailto on privacy.html (Greek + English, incl. deletion) and in Settings', () => {
  const html = read('privacy.html');
  const mail = 'mailto:oikoslabs.apps@gmail.com';
  const el = html.slice(html.indexOf('id="el"'), html.indexOf('id="en"'));
  const en = html.slice(html.indexOf('id="en"'));
  assert.ok(el.includes(mail) && /αίτημα διαγραφής/.test(el), 'Greek contact + deletion');
  assert.ok(en.includes(mail) && /account-deletion/.test(en), 'English contact + deletion');
  assert.ok(read('src/app.js').includes(mail));
});

test('v1.9.18 privacy: email-contact section separates service mail from marketing consent', () => {
  const html = read('privacy.html');
  const el = html.slice(html.indexOf('id="el"'), html.indexOf('id="en"'));
  const en = html.slice(html.indexOf('id="en"'));
  assert.match(el, /Επικοινωνία με email/);
  assert.match(el, /23 Νοεμβρίου 2026/);
  assert.match(el, /μηνύματα απαραίτητα για τη λειτουργία/);
  assert.match(el, /σημαντική ενημέρωση έκδοσης/);
  assert.match(el, /ασφάλεια/);
  assert.match(el, /Δεν στέλνουμε διαφημίσεις, προσφορές ή newsletter χωρίς ρητή συγκατάθεσή σου/);
  assert.ok(!/πιστοποίηση|certified|GDPR compliant/i.test(html), 'no legal-certification claims');
  assert.match(en, /Email contact/);
  assert.match(en, /23 November 2026/);
  assert.match(en, /without your explicit consent/i);
  assert.match(en, /important version updates for security/i);
});

test('v1.9.47 privacy: Limited Use paragraph (EL + EN) and visible homepage link', () => {
  const html = read('privacy.html');
  const el = html.slice(html.indexOf('id="el"'), html.indexOf('id="en"'));
  const en = html.slice(html.indexOf('id="en"'));
  const policy = 'https://developers.google.com/terms/api-services-user-data-policy';
  assert.match(el, /Περιορισμένη χρήση δεδομένων Google \(Limited Use\)/);
  assert.ok(el.includes(policy), 'Greek Limited Use links the Google policy');
  assert.match(el, /μόνο για να σου παρέχουμε τις λειτουργίες που φαίνονται στην εφαρμογή/);
  assert.match(el, /Δεν τα πουλάμε/);
  assert.match(en, /Limited Use of Google user data/);
  assert.ok(en.includes(policy), 'English Limited Use links the Google policy');
  assert.match(en, /including the Limited Use requirements/);
  assert.match(en, /We do not sell it/);
  assert.doesNotMatch(html, /Σκολαρ|Skolarikis|Giannis |Γιάννης /);

  const home = read('index.html');
  assert.match(home, /<a href="\.\/privacy\.html">Πολιτική απορρήτου<\/a>/);
  assert.match(home, /mailto:oikoslabs\.apps@gmail\.com/);
  assert.match(home, /<a class="privacy-card" href="\.\/privacy\.html">/);
  assert.match(home, /Η Σπιτοθήκη είναι δωρεάν εφαρμογή της Oikos Labs/);
  assert.doesNotMatch(home, /Σκολαρ|Skolarikis|Giannis |Γιάννης /);
  assert.equal(dictionaries.en['Η Σπιτοθήκη είναι δωρεάν εφαρμογή της Oikos Labs για το απόθεμα, τις αγορές και τα έξοδα του σπιτιού. Προαιρετικά μπορείς να συνδεθείς με Google για συγχρονισμό, ή να κρατήσεις κρυπτογραφημένο αντίγραφο σε κρυφό φάκελο του δικού σου Drive.'],
    'Spitothiki is a free household app by Oikos Labs for pantry, shopping and expenses. You can optionally sign in with Google to sync, or keep an encrypted backup in a hidden folder of your own Drive.');
});
