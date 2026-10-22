import test from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_PREFIX, autoBackupDue, createDriveClient, driveMessage, stateHash, tokenValid } from '../src/gdrive.js';
import { decryptBackup, decryptWithKey, deriveDeviceKey, encryptWithKey } from '../src/backup-crypto.js';

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
function mock(handler) { const calls = []; const f = async (url, init = {}) => { calls.push({ url, init }); return handler(url, init, calls.length); }; return { f, calls }; }

test('list queries appDataFolder with bearer token and sorts newest first', async () => {
  const { f, calls } = mock(() => res(200, { files: [{ id: 'a', name: `${DRIVE_PREFIX}1`, createdTime: '2026-10-01T00:00:00Z' }, { id: 'b', name: `${DRIVE_PREFIX}2`, createdTime: '2026-10-05T00:00:00Z' }, { id: 'x', name: 'other', createdTime: '2026-10-09T00:00:00Z' }] }));
  const files = await createDriveClient({ fetch: f, getToken: async () => 'TOK' }).list();
  assert.deepEqual(files.map((x) => x.id), ['b', 'a']);
  assert.match(calls[0].url, /spaces=appDataFolder/);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer TOK');
});

test('upload sends multipart into appDataFolder', async () => {
  const { f, calls } = mock(() => res(200, { id: 'n1' }));
  const out = await createDriveClient({ fetch: f, getToken: async () => 'T' }).upload('CIPHER', `${DRIVE_PREFIX}x.spitobak`);
  assert.equal(out.id, 'n1');
  assert.match(calls[0].url, /upload\/drive\/v3\/files\?uploadType=multipart/);
  assert.match(calls[0].init.body, /"parents":\["appDataFolder"\]/);
  assert.match(calls[0].init.body, /CIPHER/);
  assert.match(calls[0].init.headers['Content-Type'], /^multipart\/related; boundary=/);
});

test('401 triggers one silent re-auth and retry', async () => {
  const forced = [];
  const { f, calls } = mock((u, i, n) => (n === 1 ? res(401, 'expired') : res(200, 'DATA')));
  const text = await createDriveClient({ fetch: f, getToken: async (force) => { forced.push(force); return force ? 'NEW' : 'OLD'; } }).download('id1');
  assert.equal(text, 'DATA');
  assert.deepEqual(forced, [false, true, false]);
  assert.equal(calls.length, 2);
});

test('second 401 and other errors become Greek DriveError', async () => {
  const { f } = mock(() => res(401, ''));
  await assert.rejects(createDriveClient({ fetch: f, getToken: async () => 't' }).download('x'), (e) => e.status === 401 && /έληξε/.test(e.message));
  const { f: f2 } = mock(() => res(403, '{"reason":"accessNotConfigured"}'));
  await assert.rejects(createDriveClient({ fetch: f2, getToken: async () => 't' }).list(), /δεν έχει ενεργοποιηθεί/);
  assert.match(driveMessage(500), /Δοκίμασε ξανά/);
});

test('prune keeps the newest 5 and deletes the rest', async () => {
  const files = Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, name: `${DRIVE_PREFIX}${i}`, createdTime: `2026-10-0${i + 1}T00:00:00Z` }));
  const { f, calls } = mock((url, init) => (init.method === 'DELETE' ? res(204, '') : res(200, { files })));
  const removed = await createDriveClient({ fetch: f, getToken: async () => 't' }).prune();
  assert.equal(removed, 2);
  assert.deepEqual(calls.filter((c) => c.init.method === 'DELETE').map((c) => c.url.split('/').pop()), ['f1', 'f0']);
});

test('autoBackupDue: daily, only when changed, needs key', () => {
  const now = Date.UTC(2026, 9, 22);
  const base = { enabled: true, auto: true, hasKey: true, hash: 'h2', now };
  assert.equal(autoBackupDue({ ...base }), true);
  assert.equal(autoBackupDue({ ...base, lastAt: now - 3600000, lastHash: 'h1' }), false);
  assert.equal(autoBackupDue({ ...base, lastAt: now - 90000000, lastHash: 'h1' }), true);
  assert.equal(autoBackupDue({ ...base, lastAt: now - 90000000, lastHash: 'h2' }), false);
  assert.equal(autoBackupDue({ ...base, hasKey: false }), false);
  assert.equal(autoBackupDue({ ...base, auto: false }), false);
});

test('stateHash changes with data; tokenValid checks expiry', () => {
  assert.notEqual(stateHash({ items: [1] }), stateHash({ items: [2] }));
  assert.equal(stateHash({ a: 1 }), stateHash({ a: 1 }));
  assert.equal(tokenValid({ value: 'x', expiresAt: Date.now() + 3600000 }), true);
  assert.equal(tokenValid({ value: 'x', expiresAt: Date.now() + 30000 }), false);
  assert.equal(tokenValid(null), false);
});

test('device key encrypts; password alone still decrypts (other device)', async () => {
  const state = { items: [{ id: '1', name: 'Γάλα' }], shopping: [] };
  const dk = await deriveDeviceKey('secret123', { iterations: 1000 });
  const text = await encryptWithKey(state, dk);
  assert.equal((await decryptWithKey(text, dk)).items[0].name, 'Γάλα');
  assert.equal((await decryptBackup(text, 'secret123')).items[0].name, 'Γάλα');
  const other = await deriveDeviceKey('secret123', { iterations: 1000 });
  assert.equal(await decryptWithKey(text, other), null);
  assert.ok(!text.includes('secret123'));
});
