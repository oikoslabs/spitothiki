export const STORAGE_KEY = 'spitothiki:v1';
// Optional record lists added after v0.1; old saves/backups without them stay valid.
export const EXTRA_KINDS = ['recurring', 'stores', 'purchases', 'waste', 'receipts', 'meals', 'bills', 'trips', 'prices'];
export const DATA_KINDS = ['items', 'shopping', ...EXTRA_KINDS];

function pick(value) {
  const out = { items: value.items, shopping: value.shopping };
  for (const kind of EXTRA_KINDS) if (Array.isArray(value[kind])) out[kind] = value[kind];
  return out;
}

export function emptyState() {
  return { items: [], shopping: [] };
}

function validState(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Array.isArray(value.items) && Array.isArray(value.shopping);
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return validState(parsed) ? pick(parsed) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  if (!validState(state)) throw new Error('Τα δεδομένα αποθήκευσης δεν έχουν έγκυρη μορφή.');
  storage?.setItem(STORAGE_KEY, JSON.stringify(pick(state)));
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    throw new Error('Το αρχείο αντιγράφου δεν είναι έγκυρο JSON.');
  }
  if (!validState(parsed)) throw new Error('Το αρχείο αντιγράφου έχει μη έγκυρη μορφή.');
  return pick(parsed);
}
