// v1.9.20: the user's own product types («Είδος προϊόντος»), e.g. «🐾 Κατοικίδια», next to the built-in ones.
// Separate from the expense categories (expense-cats.js): a product type groups products in the inventory,
// the shopping list (aisle order), receipt lines and «Αγορές ανά είδος προϊόντος». Pure functions (unit-tested).
// Data: state.productTypes = [{ id: 'pt-…', name, emoji, createdAt, updatedAt }] (synced + backed up like every list).
// Built-in types keep their Greek name as value (old data unchanged). A product with a custom type stores its id,
// so a rename never breaks it; when a custom type is deleted, its products fall back to «Άλλο».
export const BUILTIN_TYPES = ['Φρούτα & λαχανικά', 'Κρέας & ψάρι', 'Γαλακτοκομικά', 'Ξηρά τρόφιμα', 'Κατεψυγμένα', 'Ροφήματα', 'Καθαριότητα', 'Άλλο'];
export const BUILTIN_ICONS = {
  'Γαλακτοκομικά': '🥛', 'Φρούτα & λαχανικά': '🥬', 'Κρέας & ψάρι': '🍗',
  'Ξηρά τρόφιμα': '🌾', 'Κατεψυγμένα': '🧊', 'Ροφήματα': '☕',
  'Καθαριότητα': '🧽', 'Άλλο': '🧺'
};
export const OTHER_TYPE = 'Άλλο';
export const PRODUCT_TYPE_DEFAULT_EMOJI = '📦';
export const PRODUCT_TYPE_PREFIX = 'pt-';
// Quick picks shown under the emoji field (any emoji can still be typed).
export const PRODUCT_TYPE_EMOJIS = ['🍞', '🥚', '🧀', '🍫', '🍷', '🍺', '🥫', '🍝', '🧂', '🫒', '🍼', '🐾', '🧴', '🧻', '💊', '🌿', '🍰', '🥤', '🧃', '🍳', '🐟', '🌶️', '🍯', '📦'];

const EMOJI_HINTS = [
  [/ψωμ|αρτο|φουρν|bread|bakery/, '🍞'], [/αυγ|egg/, '🥚'], [/τυρ|cheese/, '🧀'], [/γλυκ|σοκολ|σνακ|sweet|snack|chocol/, '🍫'],
  [/κρασ|wine/, '🍷'], [/μπυρ|beer/, '🍺'], [/κονσερβ|can/, '🥫'], [/ζυμαρ|pasta/, '🍝'], [/μπαχαρ|καρυκ|spice/, '🧂'],
  [/λαδ|ελι|oil|olive/, '🫒'], [/μωρ|βρεφ|baby/, '🍼'], [/κατοικ|σκυλ|γατ|ζω|pet|dog|cat/, '🐾'],
  [/υγιειν|καλλυντ|σαμπου|προσωπ|hygien|cosmet|personal|care/, '🧴'], [/χαρτ|paper|tissue/, '🧻'],
  [/φαρμακ|βιταμ|medic|pharm|vitamin/, '💊'], [/μυρωδ|βοταν|herb/, '🌿'], [/αναψυκ|soda|soft drink/, '🥤'],
  [/χυμ|juice/, '🧃'], [/ψαρ|θαλασσ|fish|sea/, '🐟'], [/μελ|honey/, '🍯']
];

export const foldType = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('el-GR');
export function suggestTypeEmoji(name) {
  const n = foldType(name);
  if (!n) return '';
  for (const [re, emoji] of EMOJI_HINTS) if (re.test(n)) return emoji;
  return '';
}
function cleanEmoji(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const parts = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter().segment(s)].map((x) => x.segment) : [...s];
  return (parts[0] || '').slice(0, 16);
}
function makeId() {
  if (globalThis.crypto?.randomUUID) return `${PRODUCT_TYPE_PREFIX}${globalThis.crypto.randomUUID()}`;
  return `${PRODUCT_TYPE_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
export const isCustomTypeId = (value) => typeof value === 'string' && value.startsWith(PRODUCT_TYPE_PREFIX);

// Custom types in a stable order (oldest first), ignoring broken records.
export function customProductTypes(stored = []) {
  return (Array.isArray(stored) ? stored : []).filter((c) => c && isCustomTypeId(c.id) && c.name && !c.deleted)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.name.localeCompare(b.name));
}

// New type, or rename / new emoji (input.id = existing). Name required, unique among built-ins and own types
// (accents/case ignored; the English names of the built-ins count too, via `builtinNames`).
export function createProductType(input = {}, stored = [], now = new Date().toISOString(), builtinNames = []) {
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) throw new Error('Γράψε ένα όνομα για το είδος προϊόντος.');
  const id = input.id || makeId();
  if (!isCustomTypeId(id)) throw new Error('Τα βασικά είδη δεν αλλάζουν.');
  const taken = [...BUILTIN_TYPES, ...builtinNames].some((b) => foldType(b) === foldType(name))
    || customProductTypes(stored).some((c) => c.id !== id && foldType(c.name) === foldType(name));
  if (taken) throw new Error('Υπάρχει ήδη είδος προϊόντος με αυτό το όνομα.');
  const old = (Array.isArray(stored) ? stored : []).find((c) => c.id === id);
  const emoji = cleanEmoji(input.emoji) || old?.emoji || suggestTypeEmoji(name) || PRODUCT_TYPE_DEFAULT_EMOJI;
  return { id, name, emoji, createdAt: old?.createdAt || now, updatedAt: now };
}
export function upsertProductType(stored = [], rec) {
  const list = Array.isArray(stored) ? stored : [];
  return list.some((c) => c.id === rec.id) ? list.map((c) => (c.id === rec.id ? rec : c)) : [...list, rec];
}
// Deleting removes only the type; products keep the id and show as «Άλλο» (see effectiveType).
export const deleteProductType = (stored = [], id) => (Array.isArray(stored) ? stored : []).filter((c) => c.id !== id);

// ---- Current list (set by the app from state.productTypes; pure helpers below default to it) ----
let current = [];
export function setProductTypes(stored = []) { current = customProductTypes(stored); return current; }
export const currentCustomTypes = () => current;

// Every type value in the default order: built-ins, then own types, «Άλλο» last.
export function allProductTypes(custom = current) {
  return [...BUILTIN_TYPES.filter((c) => c !== OTHER_TYPE), ...custom.map((c) => c.id), OTHER_TYPE];
}
export function isProductType(value, custom = current) {
  return BUILTIN_TYPES.includes(value) || custom.some((c) => c.id === value);
}
// What a stored value counts as: a known type stays; a deleted own type → «Άλλο»; empty → «Άλλο».
// Older free-text values (not ids) are kept, as before.
export function effectiveType(value, custom = current) {
  if (!value) return OTHER_TYPE;
  if (isCustomTypeId(value)) return custom.some((c) => c.id === value) ? value : OTHER_TYPE;
  return value;
}
// For forms: a value that has to be one of the types (unknown → «Άλλο»).
export const validType = (value, custom = current) => (isProductType(value, custom) ? value : OTHER_TYPE);

export function typeEmoji(value, custom = current) {
  const v = effectiveType(value, custom);
  if (isCustomTypeId(v)) return custom.find((c) => c.id === v)?.emoji || PRODUCT_TYPE_DEFAULT_EMOJI;
  return BUILTIN_ICONS[v] || BUILTIN_ICONS[OTHER_TYPE];
}
// Display name: own types by their name, built-ins via `translate` (i18n).
export function typeName(value, translate = (s) => s, custom = current) {
  const v = effectiveType(value, custom);
  if (isCustomTypeId(v)) return custom.find((c) => c.id === v)?.name || translate(OTHER_TYPE);
  return translate(v);
}
export const typeLabel = (value, translate = (s) => s, custom = current) => `${typeEmoji(value, custom)} ${typeName(value, translate, custom)}`;

// «Αγορές ανά είδος προϊόντος»: rows of monthlySpending().byCategory, deleted types merged into «Άλλο».
export function mergeTypeRows(rows = [], custom = current) {
  const by = new Map();
  for (const row of rows) {
    const k = effectiveType(row.category, custom);
    by.set(k, Math.round(((by.get(k) || 0) + Number(row.total || 0)) * 100) / 100);
  }
  return [...by].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}
