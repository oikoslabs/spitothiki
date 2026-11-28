import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.50 release: version, cache v170, close-up toll receipts keep the camera open, updated guide', () => {
  assert.match(read('package.json'), /"version": "1\.9\.50"/);
  const html = read('index.html');
  assert.equal((html.match(/data-no-i18n>1\.9\.50</g) || []).length, 2);
  assert.match(html, /styles\.css\?v=170/);
  assert.match(html, /src\/app\.js\?v=170/);
  assert.doesNotMatch(html, /v=170-preview/);
  assert.doesNotMatch(html, /Σκολαρ|Skolarikis|Giannis |Γιάννης /);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v170';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v170-preview'/);
  assert.match(sw, /styles\.css\?v=170'/);
  assert.match(sw, /src\/app\.js\?v=170'/);
  const app = read('src/app.js');
  assert.match(app, /async function idleScanAssist/);
  assert.doesNotMatch(app, /async function idleScanFallback/);
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.equal(whats.title, 'Τι νέο στην 1.9.50');
  const text = [whats.intro, ...whats.bullets].join('\n');
  assert.match(text, /δεν κλείνει πια/);
  assert.match(text, /διοδίων/);
  assert.match(text, /απομακρύνεις/);
  assert.doesNotMatch(text, /Σκολαρ|Skolarikis|Giannis |Γιάννης /);
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
  assert.ok(dictionaries.en[whats.intro], 'EN missing whats-new intro');
  assert.ok(dictionaries.en[whats.title], 'EN missing whats-new title');
});
