import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.48 release: version, cache v168, toll photo/OCR fallback, live idle snapshot, updated guide', () => {
  assert.match(read('package.json'), /"version": "1\.9\.49"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.49</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=170/);
  assert.match(html, /src\/app\.js\?v=170/);
  assert.doesNotMatch(html, /v=169-preview/);
  assert.doesNotMatch(html, /Σκολαρ|Skolarikis|Giannis |Γιάννης /);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v170';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v169-preview'/);
  assert.match(sw, /styles\.css\?v=170'/);
  assert.match(sw, /src\/app\.js\?v=170'/);
  const app = read('src/app.js');
  // v1.9.50: the idle snapshot no longer closes the camera (idleScanAssist), see scan-speed.test.js.
  assert.match(app, /idleScanAssist/);
  assert.match(app, /captureVideoFrame/);
  assert.match(app, /loadReceiptPhoto\(file\)/);
  const barcode = read('src/barcode.js');
  assert.match(barcode, /acceptScanValue/);
  assert.match(barcode, /zxingRegions/);
  assert.doesNotMatch(barcode, /ChecksumError|return_errors:\s*true/);
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.equal(whats.title, 'Τι νέο στην 1.9.49');
  const text = [whats.intro, ...whats.bullets].join('\n');
  assert.match(text, /φωτογραφία/);
  assert.match(text, /5 δευτερόλεπτα/);
  assert.match(text, /Αττική Οδός/);
  assert.match(text, /📷 Σάρωση/);
  assert.doesNotMatch(text, /Σκολαρ|Skolarikis|Giannis |Γιάννης /);
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
  assert.ok(dictionaries.en[whats.intro], 'EN missing whats-new intro');
  assert.ok(dictionaries.en[whats.title], 'EN missing whats-new title');
  const transport = GUIDE_SECTIONS.find((s) => s.id === 'transport');
  assert.match(transport.bullets.join('\n'), /βγάλε φωτογραφία την απόδειξη/);
  for (const b of transport.bullets) assert.ok(dictionaries.en[b], `EN missing transport: ${b}`);
});
