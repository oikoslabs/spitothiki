import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_RECIPES, INGREDIENTS, fetchMealDbSuggestions, matchIngredient, mealFromDb, pantryIngredients, suggestBuiltin } from '../src/recipes.js';

test('pantry names map to ingredients in Greek and English, with accents/plurals', () => {
  assert.equal(matchIngredient('Γάλα φρέσκο'), 'milk');
  assert.equal(matchIngredient('γαλα'), 'milk');
  assert.equal(matchIngredient('Αυγά χωριάτικα'), 'eggs');
  assert.equal(matchIngredient('Ντομάτες'), 'tomato');
  assert.equal(matchIngredient('Στήθος κοτόπουλο'), 'chicken');
  assert.equal(matchIngredient('Chicken breasts'), 'chicken');
  assert.equal(matchIngredient('Γιαούρτι στραγγιστό Fage'), 'yogurt');
  assert.equal(matchIngredient('Ελαιόλαδο'), 'oil');
  assert.equal(matchIngredient('Χαρτί κουζίνας'), '');
});

test('every built-in recipe uses known ingredients and has both languages', () => {
  for (const r of BUILTIN_RECIPES) {
    // v1.3 recipes (with `cat`) are Greek-first: English name, Greek steps (UI falls back to Greek).
    assert.ok(r.name.el && r.name.en && r.steps.el && (r.cat || r.steps.en), r.id);
    for (const id of r.optional || []) assert.ok(r.ingredients.includes(id), `${r.id} optional ${id}`);
    for (const id of r.ingredients) assert.ok(INGREDIENTS[id], `${r.id}: ${id}`);
  }
});

test('suggestions prefer recipes using soon-to-expire items and skip expired ones', () => {
  const today = '2026-10-18';
  const items = [
    { id: '1', name: 'Αυγά', quantity: 6, expiry: '2026-10-19' },
    { id: '2', name: 'Ντομάτες', quantity: 3, expiry: '2026-10-20' },
    { id: '3', name: 'Φέτα', quantity: 1, expiry: '2026-11-30' },
    { id: '4', name: 'Γάλα', quantity: 1, expiry: '2026-10-01' },
    { id: '5', name: 'Ρύζι', quantity: 0 }
  ];
  const pantry = pantryIngredients(items, today);
  assert.ok(!pantry.milk && !pantry.rice);
  const list = suggestBuiltin(items, today);
  assert.equal(list[0].id, 'strapatsada');
  assert.deepEqual(list[0].missing, []);
  assert.ok(list[0].urgent.includes('eggs'));
  assert.ok(list.every((r) => !r.missing.includes('salt')));
});

test('TheMealDB meals are scored and unknown ingredients kept', async () => {
  const pantry = pantryIngredients([{ name: 'Chicken', quantity: 1 }], '2026-10-18');
  const meal = mealFromDb({ idMeal: '1', strMeal: 'Test', strIngredient1: 'Chicken', strIngredient2: 'Soy Sauce', strIngredient3: 'salt', strIngredient4: '' }, pantry);
  assert.deepEqual(meal.matched, ['chicken']);
  assert.deepEqual(meal.unknown, ['Soy Sauce']);
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, json: async () => url.includes('filter') ? { meals: [{ idMeal: '9' }] } : { meals: [{ idMeal: '9', strMeal: 'Chicken X', strIngredient1: 'chicken' }] } }; };
  const list = await fetchMealDbSuggestions([{ name: 'Κοτόπουλο', quantity: 1, expiry: '2026-10-19' }], '2026-10-18', { fetchImpl });
  assert.equal(list[0].name.en, 'Chicken X');
  assert.ok(calls[0].includes('filter.php?i=chicken'));
});

test('v1.3 recipe set: Greek + raw/fruit sections, unique ids', () => {
  const ids = BUILTIN_RECIPES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(BUILTIN_RECIPES.filter((r) => (r.cat || 'greek') === 'greek').length >= 40);
  assert.ok(BUILTIN_RECIPES.filter((r) => r.cat === 'raw').length >= 15);
});
