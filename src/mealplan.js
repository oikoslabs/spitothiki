// Weekly meal plan: 7 days x 3 meals. Records (kind "meals") are synced like everything else.
import { INGREDIENTS, ingredientName, matchIngredient, pantryIngredients } from './recipes.js';
import { normalizeSearch } from './domain.js';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'];

const toDate = (key) => new Date(`${key}T12:00:00Z`);
const toKey = (date) => date.toISOString().slice(0, 10);
export function shiftDays(key, days) { const d = toDate(key); d.setUTCDate(d.getUTCDate() + days); return toKey(d); }
// Monday of the week that contains `key`.
export function weekStart(key) { const d = toDate(key); return shiftDays(key, -((d.getUTCDay() + 6) % 7)); }
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => shiftDays(start, i));
export const mealId = (date, slot) => `meal-${date}-${slot}`;

// A plan entry from a built-in recipe, a TheMealDB meal or free text.
export function createMeal({ date, slot, recipe = null, text = '' }, now = new Date().toISOString()) {
  if (!MEAL_SLOTS.includes(slot) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Μη έγκυρη θέση στο πρόγραμμα.');
  const base = { id: mealId(date, slot), date, slot, updatedAt: now };
  if (recipe) {
    return { ...base, recipeId: recipe.id, source: recipe.source || 'builtin', title: recipe.name || { el: recipe.title, en: recipe.title }, ingredients: [...(recipe.ingredients || [])], extra: [...(recipe.extra || [])], optional: [...(recipe.optional || [])], url: recipe.url || '' };
  }
  const title = String(text).trim().slice(0, 80);
  if (!title) throw new Error('Γράψε ένα γεύμα.');
  // Free text: recognise known ingredients inside it ("φακές με ρύζι").
  const ingredients = [...new Set(title.split(/[,+&/]|\s+(?:με|και|with|and)\s+/i).map((part) => matchIngredient(part.trim())).filter(Boolean))];
  return { ...base, recipeId: '', source: 'text', title: { el: title, en: title }, ingredients, extra: [], optional: [], url: '' };
}

// TheMealDB meal (lookup/search result) -> recipe-like object for createMeal.
export function recipeFromMealDb(meal) {
  const ingredients = []; const extra = [];
  for (let i = 1; i <= 20; i++) {
    const name = String(meal[`strIngredient${i}`] || '').trim();
    if (!name) continue;
    const id = matchIngredient(name);
    if (id) { if (!ingredients.includes(id)) ingredients.push(id); } else extra.push(name);
  }
  return { id: `mealdb-${meal.idMeal}`, source: 'mealdb', name: { el: meal.strMeal, en: meal.strMeal }, ingredients, extra, url: `https://www.themealdb.com/meal/${meal.idMeal}` };
}

// Copies last week's meals into the week starting `start`, never overwriting a planned slot.
export function copyPreviousWeek(meals = [], start, now = new Date().toISOString()) {
  const from = shiftDays(start, -7);
  const fromDays = new Set(weekDays(from));
  const taken = new Set(meals.filter((m) => m.date >= start && m.date < shiftDays(start, 7)).map((m) => m.id));
  const copies = meals.filter((m) => fromDays.has(m.date)).map((m) => { const date = shiftDays(m.date, 7); return { ...m, id: mealId(date, m.slot), date, updatedAt: now }; })
    .filter((m) => !taken.has(m.id));
  return { meals: [...meals, ...copies], copied: copies.length };
}

// Ingredients the week needs that are neither in the pantry (in stock) nor already pending on the list.
// Returns [{ name, count }] with names in the UI language; staples (salt, oil...) are skipped like in recipes.
export function weekShoppingNeeds(meals = [], start, { items = [], shopping = [], today, lang = 'el' } = {}) {
  const end = shiftDays(start, 7);
  const pantry = pantryIngredients(items, today);
  const pending = new Set(shopping.filter((row) => !row.checked).map((row) => normalizeSearch(row.name).trim()));
  const pendingIds = new Set(shopping.filter((row) => !row.checked).map((row) => matchIngredient(row.name)).filter(Boolean));
  const counts = new Map();
  for (const meal of meals) {
    if (meal.date < start || meal.date >= end) continue;
    for (const id of meal.ingredients || []) {
      if (!INGREDIENTS[id] || INGREDIENTS[id].staple || (meal.optional || []).includes(id) || pantry[id] || pendingIds.has(id)) continue;
      const name = ingredientName(id, lang);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    for (const raw of meal.extra || []) {
      const name = raw.trim();
      if (!name || pending.has(normalizeSearch(name).trim()) || items.some((item) => Number(item.quantity) > 0 && normalizeSearch(item.name).trim() === normalizeSearch(name).trim())) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts].map(([name, count]) => ({ name, count })).filter((entry) => !pending.has(normalizeSearch(entry.name).trim()));
}
