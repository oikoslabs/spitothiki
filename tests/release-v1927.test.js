import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
test('v1.9.27 release: version, cache bump, ΦΗΜ SIG amount parse', () => {
  assert.match(read('package.json'), /"version": "1\.9\.33"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.33</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v141';/);
  const receipt = read('src/receipt.js');
  assert.match(receipt, /function parseFhmSig/);
  assert.match(receipt, /11-char device serial \+ 8-digit mark \+ 40-char SHA-1 \+ amount/);
  assert.match(receipt, /params\.sig/);
  const app = read('src/app.js');
  assert.match(app, /shouldAskAmount\(receipt, \{ duplicate \}\)/);
  assert.doesNotMatch(app, /needsAmount\(receipt\) && receiptTarget !== 'transport'/);
  const manual = read('src/manual-expense.js');
  assert.match(manual, /export const shouldAskAmount/);
});
