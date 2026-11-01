// v1.9.10: recipes from a recent batch get a «Νέα» badge and come first in «Όλες οι συνταγές».
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILTIN_RECIPES, isNewRecipe } from '../src/recipes.js';
import { RECIPE_BATCHES } from '../src/recipe-data.js';

test('v1.9.10 batch ids exist and are new for 30 days only', () => {
  for (const ids of Object.values(RECIPE_BATCHES)) for (const id of ids) assert.ok(BUILTIN_RECIPES.some((r) => r.id === id), id);
  const dakos = BUILTIN_RECIPES.find((r) => r.id === 'dakos');
  assert.equal(isNewRecipe(dakos, '2026-11-01'), true);
  assert.equal(isNewRecipe(dakos, '2026-11-30'), true);
  assert.equal(isNewRecipe(dakos, '2026-12-01'), false);
  assert.equal(isNewRecipe(dakos, '2026-10-31'), false);
  assert.equal(isNewRecipe(BUILTIN_RECIPES.find((r) => r.id === 'omelette'), '2026-11-01'), false);
});

test('v1.9.10 cook screen: badge and new-first sort', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /class="new-badge"/);
  assert.match(app, /isNewRecipe\(y, today\) - isNewRecipe\(x, today\)/);
});
