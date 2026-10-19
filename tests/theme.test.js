import test from 'node:test';
import assert from 'node:assert/strict';

test('theme: saved choice wins, anything else is auto; applyTheme sets data attributes', async () => {
  const store = {}; const root = { dataset: {} };
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  globalThis.document = { documentElement: root, querySelector: () => null };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const { THEME_KEY, applyTheme, currentTheme } = await import('../src/theme.js');
  assert.equal(currentTheme(), 'auto');
  store[THEME_KEY] = 'dark'; assert.equal(currentTheme(), 'dark');
  store[THEME_KEY] = 'weird'; assert.equal(currentTheme(), 'auto');
  applyTheme('dark'); assert.equal(root.dataset.theme, 'dark'); assert.equal(root.dataset.dark, '1');
  applyTheme('auto'); assert.equal(root.dataset.theme, undefined); assert.equal(root.dataset.dark, '');
  delete globalThis.localStorage; delete globalThis.document; delete globalThis.window;
});
