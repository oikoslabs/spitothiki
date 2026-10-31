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
  for (const must of ['Firebase', 'Open Food Facts', 'drive.appdata', 'Cloudflare', 'Διαγραφή όλων', 'myaccount.google.com/permissions', 'Επικοινωνία'])
    assert.ok(html.includes(must), must);
  assert.ok(!/<script/i.test(html), 'no scripts / trackers on the policy page');
});

test('v1.8.7 privacy.html: deployed (not in firebase.json ignore), cached by the SW, linked in-app', () => {
  const { hosting } = JSON.parse(read('firebase.json'));
  assert.equal(hosting.public, '.');
  for (const pattern of hosting.ignore) assert.ok(!['*.html', '**/*.html', 'privacy.html'].includes(pattern), pattern);
  const sw = read('sw.js');
  assert.match(sw, /'\.\/privacy\.html'/);
  assert.match(sw, /CACHE_VERSION = 'v104'/);
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
