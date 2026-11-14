import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('v1.9.28 release: version, cache bump, fuel photo prefill', () => {
  assert.match(read('package.json'), /"version": "1\.9\.34"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.34</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v142';/);
  const transport = read('src/transport.js');
  assert.match(transport, /export function mergeAadePhoto/);
  assert.match(transport, /ΛΙΤΡΑ\|LITRES\?\|LTR\|LT\|ΛΙΤΡΟ/);
  const app = read('src/app.js');
  assert.match(app, /Φωτογραφία για λίτρα & πρατήριο/);
  assert.match(app, /mergeAadePhoto\(/);
  assert.doesNotMatch(read('tests/fixtures/receipt-fuel-photo-ocr.txt'), /802122547|Α\\.Φ\\.Μ\\.:\\s*[0-8]/);
});
