import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { showProtectCard, showProtectSheet } from '../src/protect.js';
import { dictionaries } from '../src/i18n.js';

const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v1.9.0 «only on this phone» warning waits for the first saved thing', () => {
  assert.equal(showProtectCard({ signedIn: false, driveOn: false, hasData: false }), false);
  assert.equal(showProtectCard({ signedIn: false, driveOn: false, hasData: true }), true);
  assert.equal(showProtectSheet({ signedIn: false, driveOn: false, hasData: false }), false);
  assert.equal(showProtectSheet({ signedIn: false, driveOn: false, hasData: true }), true);
  assert.equal(showProtectCard({ signedIn: true, hasData: true }), false);
});

test('v1.9.0 empty home: starter card with scan button and examples link, only while empty', () => {
  assert.match(app, /function renderStarterCard\(\) \{\n  if \(hasAnyData\(state\)\) return '';/);
  assert.match(app, /id="starter-scan"/);
  assert.match(app, /data-action="load-demo" id="starter-demo"/);
  assert.match(app, /renderStarterCard\(\)\}\$\{renderProtectCard\(\)\}/);
  assert.match(app, /protectOpts = \(\) => \(\{[^\n]*hasData: hasRealData\(state\)/);
});

test('v1.9.0 onboarding: one sentence + language first, the rest optional, examples at the end', () => {
  assert.match(app, /id="onboard-what"/);
  assert.match(app, /<details class="onboard-more"/);
  assert.match(app, /data-action="onboard-demo"/);
  assert.match(app, /action === 'onboard-demo'/);
  assert.match(app, /data-action="load-demo">Φόρτωση παραδειγμάτων/); // Settings button kept
});

test('v1.9.0 scan hint and «Έτοιμο!» after sign-in with a scan button', () => {
  assert.match(html, /id="scan-hint">Σκάναρε το QR της απόδειξης ή το barcode ενός προϊόντος</);
  assert.match(app, /showToast\(t\('Έτοιμο! Τώρα σκάναρε την πρώτη σου απόδειξη'\), \{ scan: true \}\)/);
});

test('v1.9.0 English mode: version line, footer and new strings are translated', () => {
  for (const k of ['ΕΚΔΟΣΗ', 'Έκδοση', 'Απλά, για το σπίτι.', 'Πέτα τις αποδείξεις στο συρτάρι. Σκάναρέ τες εδώ.', 'Σκάναρε την πρώτη σου απόδειξη', 'Δωρεάν, χωρίς λογαριασμό και χωρίς κάρτα. Τα στοιχεία σου μένουν στο κινητό σου.', 'ή δες με παραδείγματα', 'Σκάναρε το QR της απόδειξης ή το barcode ενός προϊόντος', 'Περισσότερες ρυθμίσεις (προαιρετικά)', 'Σκάναρε τώρα'])
    assert.ok(dictionaries.en[k], k);
  assert.match(html, /<span>ΕΚΔΟΣΗ<\/span> <span data-no-i18n>1\.9\.1<\/span>/);
  assert.match(html, /<span>Απλά, για το σπίτι\.<\/span> · <span id="app-version"><span>Έκδοση<\/span>/);
});

test('v1.9.1 example data alone never triggers the «only on this phone» warning', async () => {
  const { hasRealData } = await import('../src/onboarding.js');
  assert.equal(hasRealData({ items: [{ name: 'Γάλα', demo: true }] }), false);
  assert.equal(hasRealData({ items: [{ name: 'Γάλα', demo: true }, { name: 'Ψωμί' }] }), true);
  assert.equal(hasRealData({ items: [{ name: 'Γάλα', demo: true }], receipts: [{ id: 1 }] }), true);
  assert.match(app, /hasData: hasRealData\(state\)/);
  assert.match(app, /\.map\(\(item\) => \(\{ \.\.\.item, demo: true \}\)\)/);
});
