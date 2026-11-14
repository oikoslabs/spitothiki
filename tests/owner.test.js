import test from 'node:test';
import assert from 'node:assert/strict';
import { hashEmail, isOwnerHash, isOwnerEmail, isPreviewHost } from '../src/owner.js';

test('isOwnerEmail matches only against a provided hash set and never needs the real owner address', async () => {
  const email = 'fixture-owner@example.test';
  const hash = await hashEmail(email);
  assert.equal(hash.length, 64);
  assert.equal(await isOwnerEmail(email, new Set([hash])), true);
  assert.equal(await isOwnerEmail('someone-else@example.test', new Set([hash])), false);
  assert.equal(await isOwnerEmail('', new Set([hash])), false);
  assert.equal(isOwnerHash(hash, new Set([hash])), true);
  assert.equal(isOwnerHash('abcd', new Set([hash])), false);
  assert.equal(isPreviewHost('spitothiki--channel-abc.web.app'), true);
  assert.equal(isPreviewHost('spitothiki.web.app'), false);
  assert.equal(isPreviewHost('evil--example.com'), false);
});
