import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_RECIPES } from '../src/recipes.js';
import { copyPreviousWeek, createMeal, recipeFromMealDb, shiftDays, weekDays, weekShoppingNeeds, weekStart } from '../src/mealplan.js';

const now = '2026-10-18T10:00:00.000Z';
const recipe = (id) => BUILTIN_RECIPES.find((r) => r.id === id);

test('meal plan: weeks start on Monday', () => {
  assert.equal(weekStart('2026-10-18'), '2026-10-12'); // Sunday -> previous Monday
  assert.equal(weekStart('2026-10-19'), '2026-10-19');
  assert.deepEqual(weekDays('2026-10-26').slice(-1), ['2026-11-01']);
  assert.equal(shiftDays('2026-12-28', 7), '2027-01-04');
});

test('meal plan: entries from recipe, TheMealDB and free text', () => {
  const a = createMeal({ date: '2026-10-19', slot: 'lunch', recipe: { ...recipe('fakes'), source: 'builtin' } }, now);
  assert.equal(a.id, 'meal-2026-10-19-lunch');
  assert.equal(a.title.el, 'Φακές σούπα');
  const db = recipeFromMealDb({ idMeal: '52772', strMeal: 'Teriyaki Chicken', strIngredient1: 'chicken breasts', strIngredient2: 'soy sauce', strIngredient3: 'garlic', strIngredient4: '' });
  assert.deepEqual(db.ingredients, ['chicken', 'garlic']);
  assert.deepEqual(db.extra, ['soy sauce']);
  const free = createMeal({ date: '2026-10-20', slot: 'dinner', text: 'Μακαρόνια με κιμά' }, now);
  assert.deepEqual(free.ingredients.sort(), ['mince', 'pasta']);
  assert.throws(() => createMeal({ date: '2026-10-20', slot: 'dinner', text: '  ' }));
  assert.throws(() => createMeal({ date: 'x', slot: 'lunch', text: 'a' }));
});

test('meal plan: week shopping needs subtract pantry, pending list and staples', () => {
  const meals = [
    createMeal({ date: '2026-10-19', slot: 'lunch', recipe: recipe('fakes') }, now), // lentils onion garlic tomatoPaste carrot (+oil salt)
    createMeal({ date: '2026-10-21', slot: 'dinner', recipe: recipe('horiatiki') }, now), // tomato cucumber onion feta (+oil oregano)
    createMeal({ date: '2026-10-28', slot: 'dinner', recipe: recipe('omelette') }, now) // next week: ignored
  ];
  const items = [{ name: 'Φακές', quantity: 1 }, { name: 'Κρεμμύδια', quantity: 0 }, { name: 'Φέτα', quantity: 1 }];
  const shopping = [{ name: 'Καρότα', checked: false }];
  const needs = weekShoppingNeeds(meals, '2026-10-19', { items, shopping, today: '2026-10-18' });
  const names = Object.fromEntries(needs.map((n) => [n.name, n.count]));
  assert.equal(names['κρεμμύδι'], 2); // zero stock counts as missing, needed twice
  assert.ok(!('φακές' in names) && !('φέτα' in names) && !('καρότο' in names));
  assert.ok('σκόρδο' in names && 'ντομάτα' in names && 'αγγούρι' in names);
  assert.ok(!Object.keys(names).some((n) => /λάδι|αλάτι|αυγ/.test(n)));
  const en = weekShoppingNeeds(meals, '2026-10-19', { items, shopping, today: '2026-10-18', lang: 'en' });
  assert.ok(en.some((n) => n.name === 'garlic'));
});

test('meal plan: copy last week without overwriting', () => {
  const meals = [
    createMeal({ date: '2026-10-12', slot: 'lunch', text: 'Φασολάδα' }, now),
    createMeal({ date: '2026-10-13', slot: 'dinner', text: 'Ψάρι' }, now),
    createMeal({ date: '2026-10-20', slot: 'dinner', text: 'Πίτσα' }, now)
  ];
  const { meals: next, copied } = copyPreviousWeek(meals, '2026-10-19', now);
  assert.equal(copied, 1);
  assert.equal(next.find((m) => m.id === 'meal-2026-10-19-lunch').title.el, 'Φασολάδα');
  assert.equal(next.find((m) => m.id === 'meal-2026-10-20-dinner').title.el, 'Πίτσα');
});
