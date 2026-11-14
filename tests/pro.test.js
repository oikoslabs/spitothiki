import test from 'node:test';
import assert from 'node:assert/strict';
import { hashEmail, isOwnerHash, isPreviewHost, isPro, previewUnlockOn, proSource, refreshPro, resetPro, setPreviewUnlock } from '../src/pro.js';

test('pro: live hosts are not preview hosts', () => {
  assert.equal(isPreviewHost('spitothiki.web.app'), false);
  assert.equal(isPreviewHost('spitothiki.firebaseapp.com'), false);
  assert.equal(isPreviewHost('localhost'), false);
  assert.equal(isPreviewHost('spitothiki--pro-preview-abc123.web.app'), true);
  assert.equal(isPreviewHost('spitothiki--foo.firebaseapp.com'), true);
});

test('pro: preview unlock is ignored on the live host', () => {
  const storage = new Map();
  const store = { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  assert.equal(setPreviewUnlock(true, { hostname: 'spitothiki.web.app', storage: store }), false);
  assert.equal(previewUnlockOn({ hostname: 'spitothiki.web.app', search: '?pro=preview', storage: store }), false);
  assert.equal(setPreviewUnlock(true, { hostname: 'spitothiki--qa.web.app', storage: store }), true);
  assert.equal(previewUnlockOn({ hostname: 'spitothiki--qa.web.app', storage: store }), true);
  assert.equal(previewUnlockOn({ hostname: 'spitothiki--qa.web.app', search: '', storage: { getItem: () => null } }), false);
  assert.equal(previewUnlockOn({ hostname: 'spitothiki--qa.web.app', search: '?pro=preview', storage: { getItem: () => null } }), true);
});

test('pro: hashEmail is lowercase SHA-256 and owner allowlist is hash-only', async () => {
  const a = await hashEmail('Owner@Example.Test');
  const b = await hashEmail('  owner@example.test  ');
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.equal(isOwnerHash(a), false);
  // The committed allowlist is a hex hash, never an email.
  assert.equal(isOwnerHash('262e152d3dcc4a69d260b4df30b6cb4c60c4a6e6ef29c1cedc1f0cfdd94662bf'), true);
});

test('pro: refreshPro entitles owner hash, preview unlock, or future billing hook', async () => {
  resetPro();
  assert.equal(isPro(), false);
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const live = 'spitothiki.web.app';
  const preview = 'spitothiki--qa.web.app';
  const ownerHashes = new Set([await hashEmail('owner@example.test')]);

  assert.equal(await refreshPro({ email: 'other@example.test' }, { hostname: live, storage, ownerHashes }), false);
  assert.equal(isPro(), false);

  assert.equal(await refreshPro({ email: 'Owner@Example.Test' }, { hostname: live, storage, ownerHashes }), true);
  assert.equal(proSource(), 'owner');

  resetPro();
  assert.equal(await refreshPro(null, { hostname: preview, search: '?pro=preview', storage, ownerHashes }), true);
  assert.equal(proSource(), 'preview');

  resetPro();
  assert.equal(await refreshPro(null, { billingEntitled: true, hostname: live, storage, ownerHashes }), true);
  assert.equal(proSource(), 'billing');
  resetPro();
});
