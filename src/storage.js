export const STORAGE_KEY = 'spitothiki:v1';

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
    return validState(parsed) ? { items: parsed.items, shopping: parsed.shopping } : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  if (!validState(state)) throw new Error('Τα δεδομένα αποθήκευσης δεν έχουν έγκυρη μορφή.');
  storage?.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, shopping: state.shopping }));
}

export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text));
  } catch {
    throw new Error('Το αρχείο αντιγράφου δεν είναι έγκυρο JSON.');
  }
  if (!validState(parsed)) throw new Error('Το αρχείο αντιγράφου έχει μη έγκυρη μορφή.');
  return { items: parsed.items, shopping: parsed.shopping };
}
