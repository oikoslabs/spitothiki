import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILTIN_RECIPES, isNewRecipe } from '../src/recipes.js';
import { RECIPE_BATCHES } from '../src/recipe-data.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.36 release: version, cache v144 and the 2026-11-15 recipe batch', () => {
  assert.match(read('package.json'), /"version": "1\.9\.48"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.48</g) || []).length, 2);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v168';/);
  assert.match(sw, /styles\.css\?v=168/);
  const batch = RECIPE_BATCHES['2026-11-15'];
  assert.equal(batch.length, 8);
  const recipes = batch.map((id) => BUILTIN_RECIPES.find((r) => r.id === id));
  assert.equal(recipes.filter((r) => r.cat === 'greek').length, 5);
  assert.equal(recipes.filter((r) => r.cat === 'raw').length, 3);
  for (const r of recipes) {
    assert.ok(r.name.el && r.name.en && r.steps.el.length > 40, r.id);
    assert.equal(isNewRecipe(r, '2026-11-15'), true);
    assert.equal(isNewRecipe(r, '2026-12-15'), false);
  }
  const ids = BUILTIN_RECIPES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  const names = BUILTIN_RECIPES.map((r) => r.name.el.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});
