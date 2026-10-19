import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const root = { dataset: {} };
globalThis.document = { documentElement: root };
const prefs = await import('../src/prefs.js');

test('display prefs: text size and high contrast persist and set <html> attributes', () => {
  assert.equal(prefs.textSize(), 'normal');
  assert.equal(prefs.setTextSize('xlarge'), 'xlarge');
  assert.equal(store.get(prefs.TEXT_KEY), 'xlarge');
  assert.equal(root.dataset.text, 'xlarge');
  assert.equal(prefs.setTextSize('huge'), 'normal'); // unknown -> normal, key removed
  assert.equal(store.has(prefs.TEXT_KEY), false);
  assert.equal(root.dataset.text, undefined);
  prefs.setHighContrast(true);
  assert.equal(root.dataset.contrast, 'high');
  assert.equal(prefs.highContrast(), true);
  prefs.setHighContrast(false);
  assert.equal(root.dataset.contrast, undefined);
  assert.equal(store.has(prefs.CONTRAST_KEY), false);
});

test('styles: every font size scales with --text-scale; sizes and contrast defined', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.equal(/font-size:\s*\d+(\.\d+)?px/.test(css), false);
  assert.match(css, /\[data-text="large"\]\s*\{\s*--text-scale: 1\.15/);
  assert.match(css, /\[data-text="xlarge"\]\s*\{\s*--text-scale: 1\.3/);
  assert.match(css, /\[data-contrast="high"\]/);
});
