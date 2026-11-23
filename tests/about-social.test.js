import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const LINKS = {
  facebook: 'https://www.facebook.com/people/SpitoThiki/61596458362898/',
  telegram: 'https://t.me/spitothiki',
  tiktok: 'https://www.tiktok.com/@spitothikiapp',
};

function settingsFn() {
  const app = read('src/app.js');
  const start = app.indexOf('function renderSettings()');
  const end = app.indexOf('\nfunction ', start + 1);
  return app.slice(start, end);
}

test('Settings has a Σχετικά card with Facebook, Telegram and TikTok links in a new tab', () => {
  const settings = settingsFn();
  assert.match(settings, /id="about"/);
  assert.match(settings, /t\('Σχετικά'\)/);
  assert.match(settings, /t\('Ακολούθησε τη Σπιτοθήκη για νέα και tips\.'\)/);
  const tags = {};
  for (const name of Object.keys(LINKS)) {
    const match = settings.match(new RegExp(`<a class="button button-quiet" data-link="${name}-about"[^>]*>`));
    assert.ok(match, `${name} link is missing`);
    tags[name] = match[0];
    assert.ok(tags[name].includes(`href="${LINKS[name]}"`), `${name} href`);
    assert.match(tags[name], /target="_blank"/);
    assert.match(tags[name], /rel="noopener"/);
  }
  assert.ok(!LINKS.tiktok.includes('?'), 'TikTok URL must have no tracking params');
  assert.match(settings, /t\('Ποιοι είμαστε'\)/);
  assert.match(settings, /t\('Η Σπιτοθήκη φτιάχνεται από την Oikos Labs\.'\)/);
  assert.match(settings, /t\('Δωρεάν, χωρίς διαφημίσεις, δουλεύει και χωρίς λογαριασμό. Δεν πουλάμε δεδομένα.'\)/);
  assert.match(settings, /mailto:oikoslabs\.apps@gmail\.com/);
  assert.match(settings, /href="\.\/privacy\.html"/);
  assert.match(settings, /t\('Πολιτική απορρήτου'\)/);
  const site = settings.match(/<a href="https:\/\/oikoslabs\.github\.io"[^>]*>/);
  assert.ok(site, 'Oikos Labs website link is missing');
  assert.match(site[0], /target="_blank"/);
  assert.match(site[0], /rel="noopener"/);
  assert.match(site[0], /data-link="oikoslabs-site"/);
  assert.match(settings, /t\('Ιστότοπος Oikos Labs'\)/);
  assert.doesNotMatch(settings, /τηλέφωνο|phone:|tel:/i);
  assert.doesNotMatch(settings, /διεύθυνση κατοικίας|home address/i);
  assert.doesNotMatch(settings, /Σκολαρ|Skolarikis|Γιάννης |Giannis /);

});

test('About strings have English translations', () => {
  assert.equal(dictionaries.en['Σχετικά'], 'About');
  assert.equal(dictionaries.en['Ποιοι είμαστε'], 'Who we are');
  assert.equal(dictionaries.en['Η Σπιτοθήκη φτιάχνεται από την Oikos Labs.'], 'Spitothiki is made by Oikos Labs.');
  assert.equal(dictionaries.en['Δωρεάν, χωρίς διαφημίσεις, δουλεύει και χωρίς λογαριασμό. Δεν πουλάμε δεδομένα.'], 'Free, no ads, works without an account. We don’t sell data.');
  assert.equal(dictionaries.en['Πολιτική απορρήτου'], 'Privacy policy');
  assert.equal(dictionaries.en['Ιστότοπος Oikos Labs'], 'Oikos Labs website');
  assert.equal(dictionaries.en['Ακολούθησε τη Σπιτοθήκη για νέα και tips.'], 'Follow Spitothiki for news and tips.');
});

test('the in-app guide points to About in Settings for the official channels', () => {
  const section = GUIDE_SECTIONS.find((entry) => entry.id === 'settings');
  const bullet = section.bullets.find((text) => text.includes('Σχετικά'));
  assert.ok(bullet);
  assert.match(bullet, /Facebook/);
  assert.match(bullet, /Telegram/);
  assert.match(bullet, /TikTok/);
  assert.equal(
    dictionaries.en[bullet],
    'In Settings, under «About», you will see who makes the app, a contact email, the privacy policy, and our Facebook page, Telegram channel and TikTok account for news and tips.'
  );
});

test('About card ships in the service worker cache notes', () => {
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v150'/);
  assert.match(sw, /About card in Settings with Facebook, Telegram and the official TikTok account/);
  assert.match(read('package.json'), /"version": "1\.9\.40"/);
});

test('About trust line only uses claims already in the privacy policy', () => {
  const policy = read('privacy.html');
  assert.match(policy, /δωρεάν εφαρμογή/);
  assert.match(policy, /Δεν έχει διαφημίσεις/);
  assert.match(policy, /δεν πουλάμε δεδομένα/);
  assert.match(policy, /Αν δεν συνδεθείς, δεν φεύγουν από εκεί/);
  const settings = settingsFn();
  assert.match(settings, /Δωρεάν, χωρίς διαφημίσεις, δουλεύει και χωρίς λογαριασμό\. Δεν πουλάμε δεδομένα\./);
  assert.doesNotMatch(settings, /χωρίς κάρτα/);
});
