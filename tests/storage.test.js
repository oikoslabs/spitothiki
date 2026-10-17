import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, parseBackup } from '../src/storage.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
}

test('loads an empty state when there is no saved data or saved JSON is invalid', () => {
  assert.deepEqual(loadState(memoryStorage()), { items: [], shopping: [] });
  assert.deepEqual(loadState(memoryStorage({ 'spitothiki:v1': '{broken' })), { items: [], shopping: [] });
});

test('saves and reloads pantry and shopping data', () => {
  const storage = memoryStorage();
  const state = { items: [{ id: 'i1', name: 'Μήλα' }], shopping: [{ id: 's1', name: 'Γάλα' }] };
  saveState(state, storage);
  assert.deepEqual(loadState(storage), state);
});

test('imports only backups with valid item and shopping arrays', () => {
  assert.deepEqual(parseBackup(JSON.stringify({ items: [{ id: 'i1' }], shopping: [] })), {
    items: [{ id: 'i1' }], shopping: []
  });
  assert.throws(() => parseBackup('{broken'), /αρχείο/i);
  assert.throws(() => parseBackup(JSON.stringify({ items: {}, shopping: [] })), /μορφή/i);
});
