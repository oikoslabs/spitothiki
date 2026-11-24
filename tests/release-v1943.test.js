import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.43 release: version, cache v159, franchise fuel brands classified from full receipt text', () => {
  assert.match(read('package.json'), /"version": "1\.9\.47"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.47</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=164/);
  assert.match(html, /src\/app\.js\?v=164/);
  assert.doesNotMatch(html, /v=164-preview/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v164';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v163-preview'/);
  assert.match(sw, /styles\.css\?v=164'/);
  assert.match(sw, /src\/app\.js\?v=164'/);
  assert.match(sw, /franchise fuel brands/);
  const store = read('src/receipt-store.js');
  assert.match(store, /export function receiptClassifyText\(/);
  assert.match(store, /export const stripReceiptMarkup/);
  assert.match(store, /issuerTradeName/);
  assert.match(store, /pageText/);
  const source = read('src/source.js');
  assert.match(source, /classifyStore\(receiptClassifyText\(receipt, text\), receiptScanHost\(receipt\)\)/);
  const receipt = read('src/receipt.js');
  assert.match(receipt, /stripReceiptMarkup/);
  assert.match(receipt, /pageText/);
  assert.match(receipt, /issuerTradeName/);
  const app = read('src/app.js');
  assert.doesNotMatch(app, /Γιάννης /);
  assert.doesNotMatch(app, /Σκολαρ|Skolarikis/);
  assert.match(read('tests/receipt-store.test.js'), /franchise fuel issuer plus BP/);
  assert.match(read('tests/receipt-store.test.js'), /words that only contain the letters bp are not BP/);
});
