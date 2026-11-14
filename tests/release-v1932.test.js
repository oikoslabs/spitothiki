import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.32 release: version, cache bump, owner flag hardening and deferred SW reload', () => {
  assert.match(read('package.json'), /"version": "1\.9\.33"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.33</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v141';/);
  const app = read('src/app.js');
  assert.match(app, /reloadWhenIdle/);
  assert.match(app, /addEventListener\('close'/);
  const source = read('src/source.js');
  assert.match(source, /applyOwnerTestStatus/);
  assert.match(source, /spitothiki:stats-test/);
  assert.match(source, /receiptScanHost/);
  assert.match(source, /waitForStatsTest/);
  const firebase = read('src/sync-firebase.js');
  assert.match(firebase, /providerData/);
  assert.equal(source.includes('@example'), false);
});
