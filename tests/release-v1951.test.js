import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.51 release: version, cache v171, Android-only dismissible Play tester invite, updated guide', () => {
  assert.match(read('package.json'), /"version": "1\.9\.51"/);
  const html = read('index.html');
  assert.equal((html.match(/data-no-i18n>1\.9\.51</g) || []).length, 2);
  assert.match(html, /styles\.css\?v=171/);
  assert.match(html, /src\/app\.js\?v=171/);
  assert.doesNotMatch(html, /v=171-preview/);
  assert.doesNotMatch(html, /Σκολαρ|Skolarikis|Giannis |Γιάννης /);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v171';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v171-preview'/);
  assert.match(sw, /styles\.css\?v=171'/);
  assert.match(sw, /src\/app\.js\?v=171'/);
  const app = read('src/app.js');
  assert.match(app, /data-action="tester-done"/);
  assert.match(app, /isAndroid\(navigator\.userAgent\)/);
  assert.doesNotMatch(app, /tester-collapse|TESTER_COLLAPSE_KEY/);
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.equal(whats.title, 'Τι νέο στην 1.9.51');
  const text = [whats.intro, ...whats.bullets].join('\n');
  assert.match(text, /δοκιμαστής στο Google Play/);
  assert.match(text, /1 λεπτό/);
  assert.match(text, /τίποτα δεν αλλάζει στα δεδομένα σου/);
  assert.doesNotMatch(text, /Σκολαρ|Skolarikis|Giannis |Γιάννης /);
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
  assert.ok(dictionaries.en[whats.intro], 'EN missing whats-new intro');
  assert.ok(dictionaries.en[whats.title], 'EN missing whats-new title');
});
