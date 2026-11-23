import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuery, matchesQuery, searchFieldHtml } from '../src/list-search.js';

test('normalizes Greek accents, case and final sigma', () => {
  assert.equal(normalizeQuery('  Ταξί  ΚΑΦΈΣ '), 'ταξι καφεσ');
  assert.equal(normalizeQuery('7,50\u00a0€'), '7.50 €');
});

test('matches text without accents or case', () => {
  assert.ok(matchesQuery('🚕 Ταξί · 12/11/2026 · 9,00 €', 'ταξι'));
  assert.ok(matchesQuery('☕ Καφές · πρωινός', 'ΚΑΦΕΣ'));
  assert.ok(!matchesQuery('☕ Καφές', 'ταξι'));
});

test('matches amounts with comma or dot', () => {
  const row = 'Ταξί · 7,50\u00a0€';
  assert.ok(matchesQuery(row, '7,50'));
  assert.ok(matchesQuery(row, '7.50'));
  assert.ok(matchesQuery(row, '7,5'));
  assert.ok(matchesQuery('Ταξί · 9,00 €', '9'));
  assert.ok(!matchesQuery('Ταξί · 9,00 €', '8'));
});

test('every word must match; empty query matches everything', () => {
  assert.ok(matchesQuery('Ταξί αεροδρόμιο 9,00 €', 'ταξι 9'));
  assert.ok(!matchesQuery('Ταξί 9,00 €', 'ταξι 7'));
  assert.ok(matchesQuery('οτιδήποτε', '   '));
});

test('search field markup has placeholder, clear button and empty note', () => {
  const html = searchFieldHtml('extras-list', '"x"');
  assert.match(html, /placeholder="🔍 Αναζήτηση…"/);
  assert.match(html, /data-list-search="extras-list"/);
  assert.match(html, /Δεν βρέθηκε τίποτα/);
  assert.match(html, /value="&quot;x&quot;"/);
  assert.match(searchFieldHtml('a'), /Καθαρισμός αναζήτησης" hidden>✕/);
  assert.match(html, /Καθαρισμός αναζήτησης" >✕/);
});
