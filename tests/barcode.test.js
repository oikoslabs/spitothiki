import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryFromTags, lookupBarcode, normalizeBarcode, productFromOff } from '../src/barcode.js';

test('normalizes barcodes to digits and rejects implausible lengths', () => {
  assert.equal(normalizeBarcode(' 5201-054017739 '), '5201054017739');
  assert.equal(normalizeBarcode('123'), '');
  assert.equal(normalizeBarcode('abc'), '');
});

test('maps Open Food Facts category tags to app categories', () => {
  assert.equal(categoryFromTags(['en:dairies', 'en:yogurts']), 'Γαλακτοκομικά');
  assert.equal(categoryFromTags(['en:plant-based-foods', 'en:olive-oils']), 'Ξηρά τρόφιμα');
  assert.equal(categoryFromTags(['en:frozen-foods', 'en:frozen-pizzas']), 'Κατεψυγμένα');
  assert.equal(categoryFromTags(['en:something-else']), '');
});

test('prefers the Greek product name and appends the brand', () => {
  assert.deepEqual(productFromOff({ product_name: 'Yogurt greco', product_name_el: 'Γιαούρτι στραγγιστό', brands: 'Fage,Fage Total', categories_tags: ['en:yogurts'] }),
    { name: 'Γιαούρτι στραγγιστό Fage', category: 'Γαλακτοκομικά' });
  assert.equal(productFromOff({ product_name: 'Fage Total 2%', brands: 'Fage' }).name, 'Fage Total 2%');
});

test('looks up a barcode with an injected fetch and handles misses', async () => {
  const calls = [];
  const fetchFound = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ status: 1, product: { product_name: 'Γάλα', brands: 'ΔΕΛΤΑ', categories_tags: ['en:milks'] } }) }; };
  assert.deepEqual(await lookupBarcode('5201004000014', fetchFound), { name: 'Γάλα ΔΕΛΤΑ', category: 'Γαλακτοκομικά' });
  assert.match(calls[0], /world\.openfoodfacts\.org\/api\/v2\/product\/5201004000014\.json/);
  assert.equal(await lookupBarcode('5201004000014', async () => ({ ok: true, status: 200, json: async () => ({ status: 0 }) })), null);
  assert.equal(await lookupBarcode('5201004000014', async () => ({ ok: false, status: 404 })), null);
  await assert.rejects(() => lookupBarcode('12'), /barcode/);
});

import { scanFormats, scanMode, zxingFormats } from '../src/barcode.js';
test('scanner modes enable the right formats', () => {
  assert.equal(scanMode(false), 'product'); assert.equal(scanMode('any'), 'bill'); assert.equal(scanMode(true), 'receipt');
  for (const f of ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']) assert.ok(scanFormats('product').includes(f), f);
  for (const f of ['code_128', 'itf', 'code_39', 'pdf417', 'qr_code']) assert.ok(scanFormats('bill').includes(f), f);
  for (const f of ['qr_code', 'code_128', 'itf', 'code_39', 'ean_13', 'pdf417']) assert.ok(scanFormats('receipt').includes(f), f);
  assert.deepEqual(zxingFormats('receipt'), [11, 4, 8, 2, 7, 10]);
  assert.deepEqual(zxingFormats('product').slice(0, 5), [7, 6, 14, 15, 4]);
});
