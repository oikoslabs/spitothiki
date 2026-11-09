import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILTIN_TYPES, OTHER_TYPE, PRODUCT_TYPE_DEFAULT_EMOJI, allProductTypes, createProductType, customProductTypes, deleteProductType, effectiveType, isProductType, mergeTypeRows, setProductTypes, suggestTypeEmoji, typeEmoji, typeLabel, typeName, upsertProductType, validType } from '../src/product-types.js';
import { CATEGORIES, groupByStore, moveCategory, rowCategory, storeOrder } from '../src/features.js';
import { createManualExpense, manualCategory } from '../src/manual-expense.js';
import { DATA_KINDS, loadState, parseBackup, saveState } from '../src/storage.js';
import { dictionaries } from '../src/i18n.js';

const NOW = '2026-11-09T10:00:00.000Z';
const pets = createProductType({ id: 'pt-pets', name: 'Κατοικίδια', emoji: '🐾' }, [], NOW);
const bread = createProductType({ id: 'pt-bread', name: 'Ψωμί' }, [pets], '2026-11-09T11:00:00.000Z');
const own = [pets, bread];
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('product types: built-ins unchanged, same names and order as before', () => {
  assert.deepEqual(CATEGORIES, ['Φρούτα & λαχανικά', 'Κρέας & ψάρι', 'Γαλακτοκομικά', 'Ξηρά τρόφιμα', 'Κατεψυγμένα', 'Ροφήματα', 'Καθαριότητα', 'Άλλο']);
  assert.equal(BUILTIN_TYPES, CATEGORIES);
  assert.equal(typeEmoji('Γαλακτοκομικά', []), '🥛'); assert.equal(typeEmoji('Άλλο', []), '🧺');
  assert.deepEqual(allProductTypes([]), CATEGORIES);
});

test('product types: create with emoji, suggested/default emoji, unique name (accents/case, built-ins too)', () => {
  assert.deepEqual([pets.id, pets.name, pets.emoji], ['pt-pets', 'Κατοικίδια', '🐾']);
  assert.equal(bread.emoji, '🍞'); // suggested from the name
  assert.equal(createProductType({ name: 'Διάφορα χ' }, [], NOW).emoji, PRODUCT_TYPE_DEFAULT_EMOJI);
  assert.match(createProductType({ name: 'Νέο' }, [], NOW).id, /^pt-/);
  assert.throws(() => createProductType({ name: 'κατοικιδια' }, own), /Υπάρχει ήδη/);
  assert.throws(() => createProductType({ name: 'ΓΑΛΑΚΤΟΚΟΜΙΚΑ' }, own), /Υπάρχει ήδη/);
  assert.throws(() => createProductType({ name: 'dairy' }, own, NOW, ['Dairy']), /Υπάρχει ήδη/);
  assert.throws(() => createProductType({ name: '   ' }, own), /όνομα/);
  assert.throws(() => createProductType({ id: 'Άλλο', name: 'X' }, own), /βασικά/);
  assert.equal(createProductType({ name: 'Πολλά', emoji: '🍷🍺' }, [], NOW).emoji, '🍷');
});

test('product types: rename / new emoji keep the id, createdAt and items', () => {
  const renamed = createProductType({ id: 'pt-pets', name: 'Ζωάκια' }, own, '2026-11-10T00:00:00.000Z');
  assert.deepEqual([renamed.id, renamed.emoji, renamed.createdAt], ['pt-pets', '🐾', NOW]);
  const newIcon = createProductType({ id: 'pt-pets', name: 'Ζωάκια', emoji: '🐶' }, [renamed, bread], NOW);
  assert.equal(newIcon.emoji, '🐶');
  const list = upsertProductType(own, newIcon);
  assert.equal(list.length, 2);
  assert.equal(typeName('pt-pets', (s) => s, customProductTypes(list)), 'Ζωάκια');
  assert.equal(typeLabel('pt-pets', (s) => s, customProductTypes(list)), '🐶 Ζωάκια');
  assert.doesNotThrow(() => createProductType({ id: 'pt-pets', name: 'ΖΩΑΚΙΑ' }, list)); // same type, only case
});

test('product types: delete → products fall back to «Άλλο»; built-ins and old values kept', () => {
  const after = customProductTypes(deleteProductType(own, 'pt-pets'));
  assert.deepEqual(after.map((c) => c.id), ['pt-bread']);
  assert.equal(effectiveType('pt-pets', after), OTHER_TYPE);
  assert.equal(typeName('pt-pets', (s) => (s === 'Άλλο' ? 'Other' : s), after), 'Other');
  assert.equal(typeEmoji('pt-pets', after), '🧺');
  assert.equal(validType('pt-pets', after), OTHER_TYPE);
  assert.equal(effectiveType('Γαλακτοκομικά', after), 'Γαλακτοκομικά');
  assert.equal(effectiveType('', after), OTHER_TYPE);
  assert.equal(effectiveType('Παλιό κείμενο', after), 'Παλιό κείμενο'); // old free text untouched
  assert.deepEqual(mergeTypeRows([{ category: 'pt-pets', total: 5 }, { category: 'Άλλο', total: 2.5 }, { category: 'pt-bread', total: 9 }], after),
    [{ category: 'pt-bread', total: 9 }, { category: 'Άλλο', total: 7.5 }]);
});

test('product types: every list includes own types (before «Άλλο»), aisle order, grouping, manual expense', () => {
  const custom = customProductTypes(own);
  const all = allProductTypes(custom);
  assert.deepEqual(all.slice(-3), ['pt-pets', 'pt-bread', 'Άλλο']);
  assert.ok(isProductType('pt-bread', custom)); assert.ok(!isProductType('pt-x', custom));
  // aisle order: new own types slot in before «Άλλο» of a saved order; deleted ones drop out
  const saved = ['Καθαριότητα', 'Άλλο', 'Ροφήματα'];
  const order = storeOrder(saved, custom);
  assert.deepEqual(order.slice(0, 1), ['Καθαριότητα']);
  assert.ok(order.indexOf('pt-pets') < order.indexOf('Άλλο'));
  assert.equal(order.length, 10);
  assert.deepEqual(storeOrder(['pt-gone', ...saved], custom), order);
  const store = { id: 's', name: 'S', order };
  const moved = moveCategory(store, 'pt-bread', -1, NOW, custom);
  assert.ok(moved.order.indexOf('pt-bread') < moved.order.indexOf('pt-pets'));
  const items = [{ id: 'i1', name: 'Τροφή σκύλου', category: 'pt-pets' }];
  const rows = [{ id: 'r1', name: 'Τροφή σκύλου' }, { id: 'r2', name: 'Χωριάτικο', category: 'pt-bread' }, { id: 'r3', name: 'X', category: 'pt-gone' }];
  assert.equal(rowCategory(rows[0], items, custom), 'pt-pets');
  const groups = groupByStore(rows, store, items, custom);
  assert.deepEqual(groups.map((g) => g.category).sort(), ['pt-bread', 'pt-pets', 'Άλλο'].sort());
  // module-level list (what the app sets from state.productTypes)
  setProductTypes(own);
  assert.equal(manualCategory('pt-pets'), 'pt-pets');
  assert.equal(manualCategory('pt-gone'), 'Άλλο');
  const { purchase } = createManualExpense({ amount: '12,50', category: 'pt-pets' }, '2026-11-09', NOW);
  assert.equal(purchase.category, 'pt-pets');
  assert.deepEqual(storeOrder(undefined).slice(-3), ['pt-pets', 'pt-bread', 'Άλλο']);
  setProductTypes([]);
  assert.equal(manualCategory('pt-pets'), 'Άλλο');
  assert.equal(storeOrder(undefined).length, 8);
});

test('product types: emoji suggestions', () => {
  assert.equal(suggestTypeEmoji('Κατοικίδια'), '🐾');
  assert.equal(suggestTypeEmoji('Προσωπική υγιεινή'), '🧴');
  assert.equal(suggestTypeEmoji('Αυγά'), '🥚');
  assert.equal(suggestTypeEmoji(''), '');
});

test('product types: synced + backed up like expense categories (own kind, not mixed)', () => {
  assert.ok(DATA_KINDS.includes('productTypes'));
  assert.ok(DATA_KINDS.includes('expenseCategories'));
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  try {
    saveState({ items: [{ id: 'i1', name: 'Τροφή', category: 'pt-pets' }], shopping: [], productTypes: own });
    assert.deepEqual(loadState().productTypes.map((c) => c.id), ['pt-pets', 'pt-bread']);
    const back = parseBackup(JSON.stringify({ items: [], shopping: [], productTypes: own }));
    assert.equal(back.productTypes.length, 2);
  } finally { delete globalThis.localStorage; }
});

test('product types: UI wiring — every «Είδος προϊόντος» list, Settings card, EN texts, offline cache', () => {
  assert.doesNotMatch(app, /CATEGORIES\.(map|includes)/); // no fixed list left in the UI
  assert.match(app, /const groupOptions = \(selected\) => typeOptions\(/);
  assert.match(app, /Είδος προϊόντος: αυτόματα<\/option>\$\{typeOptions\(''\)\}/);
  assert.match(app, /receipt-category" name="category"[^\n]*typeOptions\(validType\(line\.category\)\)/);
  assert.match(app, /fillTypeSelect\(itemForm\.elements\.category/);
  assert.match(app, /mergeTypeRows\(spending\.byCategory\)/);
  assert.match(app, /\$\{renderProductTypesCard\(\)\}/);
  assert.match(app, /data-action="ptype-delete"/);
  assert.match(app, /data-action="ptype-emoji"/);
  assert.match(html, /id="item-category"/);
  assert.match(sw, /'\.\/src\/product-types\.js'/);
  for (const key of ['Είδη προϊόντων', 'Δεν έχεις ακόμα δικά σου είδη.', 'Το είδος «{name}» διαγράφηκε. Τα προϊόντα του φαίνονται πλέον στο «Άλλο».', 'Υπάρχει ήδη είδος προϊόντος με αυτό το όνομα.', 'Γράψε ένα όνομα για το είδος προϊόντος.'])
    assert.ok(dictionaries.en[key], key);
});
