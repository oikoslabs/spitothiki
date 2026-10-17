// "What do I cook?": suggestions from the pantry, preferring items that expire soon.
// Built-in Greek recipes work offline; TheMealDB (free, no key) adds more ideas when online.
import { expiryStatus, normalizeSearch } from './domain.js';

// Canonical ingredients: Greek/English names (first = display) and aliases matched against pantry names.
export const INGREDIENTS = {
  milk: { el: ['γάλα'], en: ['milk'], db: 'milk' },
  eggs: { el: ['αυγά', 'αυγό', 'αυγα'], en: ['eggs', 'egg'], db: 'eggs' },
  feta: { el: ['φέτα'], en: ['feta'], db: 'feta' },
  cheese: { el: ['τυρί', 'κεφαλοτύρι', 'γραβιέρα', 'κασέρι', 'παρμεζάνα'], en: ['cheese', 'parmesan', 'cheddar'], db: 'cheese' },
  yogurt: { el: ['γιαούρτι'], en: ['yogurt', 'yoghurt', 'greek yogurt'], db: 'greek yogurt' },
  butter: { el: ['βούτυρο'], en: ['butter'], db: 'butter' },
  tomato: { el: ['ντομάτα', 'ντομάτες', 'τομάτα', 'τομάτες'], en: ['tomato', 'tomatoes', 'chopped tomatoes', 'cherry tomatoes'], db: 'tomatoes' },
  tomatoPaste: { el: ['πελτές', 'πελτέ', 'πασάτα', 'χυμός ντομάτας'], en: ['tomato puree', 'tomato paste', 'passata'], db: 'tomato puree' },
  onion: { el: ['κρεμμύδι', 'κρεμμύδια'], en: ['onion', 'onions', 'red onions', 'red onion'], db: 'onion' },
  garlic: { el: ['σκόρδο'], en: ['garlic', 'garlic clove'], db: 'garlic' },
  potato: { el: ['πατάτα', 'πατάτες'], en: ['potato', 'potatoes'], db: 'potatoes' },
  carrot: { el: ['καρότο', 'καρότα'], en: ['carrot', 'carrots'], db: 'carrots' },
  zucchini: { el: ['κολοκύθι', 'κολοκυθάκια', 'κολοκυθάκι'], en: ['zucchini', 'courgette', 'courgettes'], db: 'courgettes' },
  eggplant: { el: ['μελιτζάνα', 'μελιτζάνες'], en: ['eggplant', 'aubergine'], db: 'aubergine' },
  pepper: { el: ['πιπεριά', 'πιπεριές'], en: ['bell pepper', 'red pepper', 'green pepper'], db: 'red pepper' },
  cucumber: { el: ['αγγούρι'], en: ['cucumber'], db: 'cucumber' },
  lettuce: { el: ['μαρούλι'], en: ['lettuce'], db: 'lettuce' },
  spinach: { el: ['σπανάκι'], en: ['spinach'], db: 'spinach' },
  lemon: { el: ['λεμόνι', 'λεμόνια'], en: ['lemon', 'lemons', 'lemon juice'], db: 'lemon' },
  apple: { el: ['μήλο', 'μήλα'], en: ['apple', 'apples'], db: 'apples' },
  banana: { el: ['μπανάνα', 'μπανάνες'], en: ['banana', 'bananas'], db: 'bananas' },
  chicken: { el: ['κοτόπουλο', 'στήθος κοτόπουλο', 'μπούτι κοτόπουλο'], en: ['chicken', 'chicken breast', 'chicken breasts', 'chicken thighs', 'chicken legs'], db: 'chicken' },
  mince: { el: ['κιμάς'], en: ['minced beef', 'beef mince', 'ground beef', 'minced meat'], db: 'minced beef' },
  pork: { el: ['χοιρινό', 'μπριζόλα'], en: ['pork', 'pork chops'], db: 'pork' },
  beef: { el: ['μοσχάρι', 'μοσχαρίσιο'], en: ['beef', 'stewing beef'], db: 'beef' },
  fish: { el: ['ψάρι', 'ψάρια', 'μπακαλιάρος', 'σολομός', 'τσιπούρα', 'λαβράκι'], en: ['fish', 'cod', 'salmon', 'white fish', 'sea bass'], db: 'salmon' },
  rice: { el: ['ρύζι'], en: ['rice', 'basmati rice', 'long grain rice'], db: 'rice' },
  pasta: { el: ['μακαρόνια', 'ζυμαρικά', 'πένες', 'σπαγγέτι', 'κριθαράκι'], en: ['pasta', 'spaghetti', 'penne', 'macaroni', 'orzo'], db: 'spaghetti' },
  flour: { el: ['αλεύρι'], en: ['flour', 'plain flour', 'self-raising flour'], db: 'flour' },
  bread: { el: ['ψωμί', 'φρυγανιά', 'φρυγανιές'], en: ['bread', 'breadcrumbs'], db: 'bread' },
  lentils: { el: ['φακές'], en: ['lentils', 'red lentils', 'green lentils'], db: 'lentils' },
  beans: { el: ['φασόλια', 'φασολάδα'], en: ['beans', 'white beans', 'cannellini beans', 'kidney beans'], db: 'cannellini beans' },
  chickpeas: { el: ['ρεβίθια'], en: ['chickpeas'], db: 'chickpeas' },
  sugar: { el: ['ζάχαρη'], en: ['sugar', 'caster sugar', 'brown sugar'], db: 'sugar' },
  honey: { el: ['μέλι'], en: ['honey'], db: 'honey' },
  oats: { el: ['βρώμη'], en: ['oats', 'rolled oats'], db: 'oats' },
  mushrooms: { el: ['μανιτάρια'], en: ['mushrooms'], db: 'mushrooms' },
  cream: { el: ['κρέμα γάλακτος'], en: ['double cream', 'cream', 'heavy cream', 'single cream'], db: 'double cream' },
  // Staples: assumed to be at home, never listed as missing.
  oil: { el: ['ελαιόλαδο', 'λάδι'], en: ['olive oil', 'oil', 'vegetable oil', 'sunflower oil'], staple: true },
  salt: { el: ['αλάτι'], en: ['salt', 'sea salt'], staple: true },
  blackPepper: { el: ['πιπέρι'], en: ['pepper', 'black pepper'], staple: true },
  water: { el: ['νερό'], en: ['water'], staple: true },
  oregano: { el: ['ρίγανη'], en: ['oregano', 'dried oregano'], staple: true }
};

export const ingredientName = (id, lang = 'el') => INGREDIENTS[id]?.[lang === 'en' ? 'en' : 'el'][0] || id;
const words = (value) => ` ${normalizeSearch(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

// Maps a free-text name (Greek or English) to a canonical ingredient id, or ''.
export function matchIngredient(name) {
  const text = words(name);
  let best = '';
  let bestLength = 0;
  for (const [id, entry] of Object.entries(INGREDIENTS)) {
    for (const alias of [...entry.el, ...entry.en]) {
      const a = words(alias);
      // Whole-word match; Greek plurals/inflections: also accept the alias as a prefix of a word (min 4 letters).
      const stem = a.trim().length >= 5 ? a.trimEnd().slice(0, -1) : null;
      if ((text.includes(a) || (stem && text.includes(stem))) && a.length > bestLength) { best = id; bestLength = a.length; }
    }
  }
  return best;
}

export const BUILTIN_RECIPES = [
  { id: 'omelette', name: { el: 'Ομελέτα με τυρί', en: 'Cheese omelette' }, ingredients: ['eggs', 'cheese', 'oil', 'salt'], steps: { el: 'Χτύπα 3 αυγά με αλάτι, ρίξ’ τα σε λάδι, πρόσθεσε τριμμένο τυρί και δίπλωσε.', en: 'Beat 3 eggs with salt, pour into hot oil, add grated cheese and fold.' } },
  { id: 'strapatsada', name: { el: 'Στραπατσάδα', en: 'Strapatsada (eggs with tomato)' }, ingredients: ['eggs', 'tomato', 'feta', 'oil', 'salt'], steps: { el: 'Σωτάρισε τριμμένη ντομάτα 10′, ρίξε χτυπημένα αυγά και θρυμματισμένη φέτα, ανακάτευε μέχρι να πήξουν.', en: 'Cook grated tomato 10 min, add beaten eggs and crumbled feta, stir until set.' } },
  { id: 'horiatiki', name: { el: 'Χωριάτικη σαλάτα', en: 'Greek salad' }, ingredients: ['tomato', 'cucumber', 'onion', 'feta', 'oil', 'oregano'], steps: { el: 'Κόψε ντομάτα, αγγούρι, κρεμμύδι, βάλε φέτα από πάνω, λάδι και ρίγανη.', en: 'Chop tomato, cucumber and onion, top with feta, olive oil and oregano.' } },
  { id: 'fakes', name: { el: 'Φακές σούπα', en: 'Greek lentil soup' }, ingredients: ['lentils', 'onion', 'garlic', 'tomatoPaste', 'carrot', 'oil', 'salt'], steps: { el: 'Βράσε τις φακές 5′ και άλλαξε νερό. Πρόσθεσε κρεμμύδι, σκόρδο, καρότο, πελτέ και σιγόβραζε 40′. Λάδι στο τέλος.', en: 'Boil lentils 5 min and drain. Add onion, garlic, carrot, tomato paste, simmer 40 min. Olive oil at the end.' } },
  { id: 'fasolada', name: { el: 'Φασολάδα', en: 'Fasolada (bean soup)' }, ingredients: ['beans', 'carrot', 'onion', 'tomatoPaste', 'oil', 'salt'], steps: { el: 'Μούλιασε τα φασόλια από το βράδυ, βράσε τα με καρότο, κρεμμύδι και πελτέ ~1,5 ώρα.', en: 'Soak beans overnight, simmer with carrot, onion and tomato paste ~1.5 h.' } },
  { id: 'revithada', name: { el: 'Ρεβιθάδα', en: 'Chickpea stew' }, ingredients: ['chickpeas', 'onion', 'lemon', 'oil', 'salt'], steps: { el: 'Μούλιασε τα ρεβίθια, βράσε τα με πολύ κρεμμύδι και λάδι ~1,5 ώρα, λεμόνι στο τέλος.', en: 'Soak chickpeas, simmer with lots of onion and olive oil ~1.5 h, lemon at the end.' } },
  { id: 'makaronia-kima', name: { el: 'Μακαρόνια με κιμά', en: 'Spaghetti with meat sauce' }, ingredients: ['pasta', 'mince', 'onion', 'tomato', 'cheese', 'oil'], steps: { el: 'Σωτάρισε κρεμμύδι και κιμά, πρόσθεσε ντομάτα και σιγόβραζε 30′. Σέρβιρε με μακαρόνια και τριμμένο τυρί.', en: 'Brown onion and mince, add tomato and simmer 30 min. Serve over pasta with grated cheese.' } },
  { id: 'kotopoulo-patates', name: { el: 'Κοτόπουλο με πατάτες στον φούρνο', en: 'Roast chicken with potatoes' }, ingredients: ['chicken', 'potato', 'lemon', 'garlic', 'oil', 'oregano', 'salt'], steps: { el: 'Βάλε κοτόπουλο και πατάτες σε ταψί με λεμόνι, σκόρδο, λάδι, ρίγανη και λίγο νερό. Ψήσε 1 ώρα στους 200°.', en: 'Put chicken and potatoes in a tray with lemon, garlic, oil, oregano and a little water. Roast 1 h at 200 °C.' } },
  { id: 'kotosoupa', name: { el: 'Κοτόσουπα αυγολέμονο', en: 'Chicken avgolemono soup' }, ingredients: ['chicken', 'rice', 'eggs', 'lemon', 'carrot', 'salt'], steps: { el: 'Βράσε το κοτόπουλο με καρότο, πρόσθεσε ρύζι. Χτύπα αυγά με λεμόνι, ρίξε σιγά ζωμό και επέστρεψέ τα στην κατσαρόλα.', en: 'Boil chicken with carrot, add rice. Whisk eggs with lemon, temper with broth and stir back in.' } },
  { id: 'spanakorizo', name: { el: 'Σπανακόρυζο', en: 'Spinach rice' }, ingredients: ['spinach', 'rice', 'onion', 'lemon', 'oil', 'salt'], steps: { el: 'Σωτάρισε κρεμμύδι, ρίξε σπανάκι να μαραθεί, ρύζι και νερό. Σιγόβραζε 20′, λεμόνι στο τέλος.', en: 'Sauté onion, wilt spinach, add rice and water. Simmer 20 min, lemon at the end.' } },
  { id: 'briam', name: { el: 'Μπριάμ', en: 'Briam (roast vegetables)' }, ingredients: ['potato', 'zucchini', 'eggplant', 'tomato', 'onion', 'oil', 'salt'], steps: { el: 'Κόψε τα λαχανικά σε κομμάτια, ανακάτεψε με ντομάτα και λάδι, ψήσε 1 ώρα στους 190°.', en: 'Cut the vegetables, mix with tomato and olive oil, roast 1 h at 190 °C.' } },
  { id: 'kritharoto', name: { el: 'Κριθαρότο με μανιτάρια', en: 'Mushroom orzo' }, ingredients: ['pasta', 'mushrooms', 'onion', 'cheese', 'butter', 'salt'], steps: { el: 'Σωτάρισε κρεμμύδι και μανιτάρια, πρόσθεσε κριθαράκι και ζεστό νερό σταδιακά. Τέλος βούτυρο και τυρί.', en: 'Sauté onion and mushrooms, add orzo and hot water gradually. Finish with butter and cheese.' } },
  { id: 'tzatziki', name: { el: 'Τζατζίκι', en: 'Tzatziki' }, ingredients: ['yogurt', 'cucumber', 'garlic', 'oil', 'salt'], steps: { el: 'Τρίψε και στράγγιξε το αγγούρι, ανακάτεψε με γιαούρτι, σκόρδο, λάδι και αλάτι.', en: 'Grate and drain the cucumber, mix with yogurt, garlic, olive oil and salt.' } },
  { id: 'rizogalo', name: { el: 'Ρυζόγαλο', en: 'Rice pudding' }, ingredients: ['milk', 'rice', 'sugar'], steps: { el: 'Βράσε ρύζι σε λίγο νερό, πρόσθεσε γάλα και ζάχαρη και σιγόβραζε ανακατεύοντας μέχρι να δέσει.', en: 'Boil rice in a little water, add milk and sugar and simmer, stirring, until thick.' } },
  { id: 'pancakes', name: { el: 'Τηγανίτες', en: 'Pancakes' }, ingredients: ['flour', 'milk', 'eggs', 'sugar', 'butter'], steps: { el: 'Ανακάτεψε αλεύρι, γάλα, αυγά και λίγη ζάχαρη. Ψήσε κουταλιές σε βουτυρωμένο τηγάνι.', en: 'Mix flour, milk, eggs and a little sugar. Cook spoonfuls in a buttered pan.' } },
  { id: 'yogurt-honey', name: { el: 'Γιαούρτι με μέλι και φρούτα', en: 'Yogurt with honey and fruit' }, ingredients: ['yogurt', 'honey', 'banana', 'apple'], optional: ['banana', 'apple'], steps: { el: 'Βάλε γιαούρτι σε μπολ, μέλι από πάνω και κομμένα φρούτα.', en: 'Yogurt in a bowl, honey on top and sliced fruit.' } },
  { id: 'apple-pie', name: { el: 'Μηλόπιτα στο ταψί', en: 'Easy apple cake' }, ingredients: ['apple', 'flour', 'sugar', 'butter', 'eggs'], steps: { el: 'Ανακάτεψε αλεύρι, ζάχαρη, αυγά, λιωμένο βούτυρο, πρόσθεσε κομμένα μήλα και ψήσε 45′ στους 180°.', en: 'Mix flour, sugar, eggs and melted butter, fold in sliced apples, bake 45 min at 180 °C.' } },
  { id: 'fish-plaki', name: { el: 'Ψάρι πλακί', en: 'Baked fish plaki' }, ingredients: ['fish', 'tomato', 'onion', 'garlic', 'potato', 'oil', 'salt'], optional: ['potato'], steps: { el: 'Στρώσε κρεμμύδι, σκόρδο και ντομάτα σε ταψί, βάλε το ψάρι από πάνω με λάδι και ψήσε 35′ στους 190°.', en: 'Layer onion, garlic and tomato in a tray, put the fish on top with olive oil, bake 35 min at 190 °C.' } }
];

// Pantry -> { id: { urgency, items } }. urgency: 3 expired, 2 expires within 3 days, 1 within 7 days, 0 otherwise.
export function pantryIngredients(items = [], today) {
  const map = {};
  for (const item of items) {
    if (!(Number(item.quantity) > 0)) continue;
    const id = matchIngredient(item.name);
    if (!id) continue;
    const status = expiryStatus(item.expiry, today);
    let urgency = 0;
    if (status === 'expired') urgency = 3;
    else if (item.expiry) {
      const days = Math.round((Date.parse(`${item.expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
      urgency = days <= 3 ? 2 : days <= 7 ? 1 : 0;
    }
    const entry = map[id] || (map[id] = { urgency: 0, items: [] });
    entry.urgency = Math.max(entry.urgency, urgency === 3 ? 0 : urgency); // expired items are not suggested for cooking
    if (urgency !== 3) entry.items.push(item);
    if (!entry.items.length) delete map[id];
  }
  return map;
}

// Scores a recipe (list of canonical ids and/or raw names) against the pantry.
export function scoreRecipe(ingredientIds, pantry, optional = []) {
  const needed = [...new Set(ingredientIds)].filter((id) => !INGREDIENTS[id]?.staple);
  const matched = needed.filter((id) => pantry[id]);
  const missing = needed.filter((id) => !pantry[id] && !optional.includes(id));
  const urgent = matched.filter((id) => pantry[id].urgency >= 1);
  const score = matched.length * 2 + urgent.reduce((sum, id) => sum + pantry[id].urgency * 2, 0) - missing.length * 1.5;
  return { matched, missing, urgent, score };
}

export function suggestBuiltin(items = [], today, limit = 6) {
  const pantry = pantryIngredients(items, today);
  return BUILTIN_RECIPES.map((recipe) => ({ ...recipe, source: 'builtin', ...scoreRecipe(recipe.ingredients, pantry, recipe.optional) }))
    .filter((recipe) => recipe.matched.length > 0)
    .sort((a, b) => b.score - a.score || a.missing.length - b.missing.length)
    .slice(0, limit);
}

// Ingredients worth searching TheMealDB for: most urgent first.
export function searchIngredients(items = [], today, limit = 2) {
  const pantry = pantryIngredients(items, today);
  return Object.entries(pantry).filter(([id]) => INGREDIENTS[id].db).sort((a, b) => b[1].urgency - a[1].urgency).slice(0, limit).map(([id]) => id);
}

// Turns a TheMealDB meal into a scored suggestion. Unknown ingredients stay as raw (English) names.
export function mealFromDb(meal, pantry) {
  const raw = [];
  for (let i = 1; i <= 20; i++) { const value = String(meal[`strIngredient${i}`] || '').trim(); if (value) raw.push(value); }
  const ids = [];
  const unknown = [];
  for (const name of raw) { const id = matchIngredient(name); if (id) ids.push(id); else unknown.push(name); }
  const scored = scoreRecipe(ids, pantry);
  return { id: `mealdb-${meal.idMeal}`, source: 'mealdb', name: { el: meal.strMeal, en: meal.strMeal }, url: `https://www.themealdb.com/meal/${meal.idMeal}`, thumb: meal.strMealThumb || '',
    ...scored, unknown, missingRaw: unknown, score: scored.score - unknown.length * 1.5 };
}

const API = 'https://www.themealdb.com/api/json/v1/1';
export async function fetchMealDbSuggestions(items, today, { fetchImpl = fetch, perIngredient = 3 } = {}) {
  const pantry = pantryIngredients(items, today);
  const ids = searchIngredients(items, today);
  const mealIds = [];
  for (const id of ids) {
    const res = await fetchImpl(`${API}/filter.php?i=${encodeURIComponent(INGREDIENTS[id].db.replace(/ /g, '_'))}`);
    if (!res.ok) throw new Error('TheMealDB');
    const data = await res.json();
    for (const meal of (data.meals || []).slice(0, perIngredient)) if (!mealIds.includes(meal.idMeal)) mealIds.push(meal.idMeal);
  }
  const meals = await Promise.all(mealIds.slice(0, 6).map(async (mealId) => {
    const res = await fetchImpl(`${API}/lookup.php?i=${encodeURIComponent(mealId)}`);
    if (!res.ok) return null;
    return (await res.json()).meals?.[0] || null;
  }));
  return meals.filter(Boolean).map((meal) => mealFromDb(meal, pantry)).sort((a, b) => b.score - a.score);
}
