import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries, detectLanguage } from '../src/i18n.js';

test('el and en dictionaries have identical keys and no empty values', () => {
  const el = Object.keys(dictionaries.el).sort();
  const en = Object.keys(dictionaries.en).sort();
  assert.deepEqual(el, en);
  for (const lang of ['el', 'en']) for (const [key, value] of Object.entries(dictionaries[lang])) assert.ok(String(value).trim(), `${lang}:${key}`);
});

test('placeholders match between el and en', () => {
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const key of Object.keys(dictionaries.el)) assert.equal(vars(dictionaries.en[key]), vars(dictionaries.el[key]), key);
});

test('every t() literal in app.js and its split-out modules has a translation', () => {
  const source = ['app.js', 'format.js', 'theme.js'].map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
  const keys = [...source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]).filter((k) => /[\u0370-\u03ff]/.test(k));
  assert.ok(keys.length > 30);
  for (const key of keys) assert.ok(Object.hasOwn(dictionaries.en, key), `missing en: ${key}`);
});

test('default language: English only for en* browsers, saved choice wins', () => {
  assert.equal(detectLanguage(null, 'en-US'), 'en');
  assert.equal(detectLanguage(null, 'el-GR'), 'el');
  assert.equal(detectLanguage(null, 'de-DE'), 'el');
  assert.equal(detectLanguage('el', 'en-US'), 'el');
  assert.equal(detectLanguage('en', 'el'), 'en');
});

test('plain language: no technical jargon (RF, EPC, GS1, PLU, SEPA, JSON, OCR) in user-facing text', async () => {
  const { dictionaries } = await import('../src/i18n.js');
  const jargon = /\b(RF|EPC|GS1|PLU|SEPA|JSON|OCR)\b/;
  const bad = Object.entries(dictionaries.en).filter(([el, en]) => jargon.test(el) || jargon.test(en));
  assert.deepEqual(bad, []);
});
