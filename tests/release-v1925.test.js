import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('v1.9.25 release: version, cache bump, scan dialog INP fix', () => {
  assert.match(read('package.json'), /"version": "1\.9\.28"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.28</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v136';/);
  const app = read('src/app.js');
  assert.match(app, /status\.textContent = t\('Ανοίγει η κάμερα…'\)/);
  assert.match(app, /adoptCamera\(requestCamera\(\), ac\.signal\)/);
  assert.match(app, /scheduler\?\.yield/);
  assert.match(read('src/barcode.js'), /Start \(or adopt\) the camera first and show the preview, then set up BarcodeDetector/);
  for (const f of ['barcode', 'app', 'month-insights', 'receipt-pdf', 'pdf-doc']) {
    assert.match(sw, new RegExp(`'\\./src/${f}\\.js'`));
  }
});
