const DEFAULT_UNIT = 'τεμ.';
export const MAX_QUANTITY = 99999;
const UNIT_ALIASES = { 'τεμάχια': 'τεμ.' };

export function normalizeUnit(unit) {
  const value = String(unit || DEFAULT_UNIT).trim() || DEFAULT_UNIT;
  return UNIT_ALIASES[value] || value;
}

export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ');
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createPantryItem(input = {}, now = new Date().toISOString()) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Χρειάζεται όνομα προϊόντος.');

  const quantity = Number(input.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error('Η ποσότητα πρέπει να είναι αριθμός μηδέν ή μεγαλύτερος.');
  }
  if (quantity > MAX_QUANTITY) throw new Error(`Η ποσότητα δεν μπορεί να ξεπερνά τα ${MAX_QUANTITY}.`);

  const minimum = Number(input.minimum ?? 0);
  if (!Number.isFinite(minimum) || minimum < 0) {
    throw new Error('Η ελάχιστη ποσότητα πρέπει να είναι μηδέν ή μεγαλύτερη.');
  }
  if (minimum > MAX_QUANTITY) throw new Error(`Η ελάχιστη ποσότητα δεν μπορεί να ξεπερνά τα ${MAX_QUANTITY}.`);

  return {
    id: String(input.id || makeId()),
    name,
    quantity,
    unit: normalizeUnit(input.unit),
    minimum,
    category: String(input.category || 'Άλλο').trim() || 'Άλλο',
    expiry: String(input.expiry || ''),
    location: String(input.location || '').trim(),
    ...(input.barcode ? { barcode: String(input.barcode).replace(/\D/g, '') } : {}),
    createdAt: String(input.createdAt || now),
    updatedAt: now
  };
}

function utcDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return time;
}

export function expiryStatus(expiry, today = new Date().toISOString().slice(0, 10)) {
  if (!expiry) return 'none';
  const due = utcDay(expiry);
  const base = utcDay(today);
  if (due === null || base === null) return 'none';
  const days = Math.round((due - base) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 7) return 'soon';
  return 'fresh';
}

export function pantrySummary(items = [], today = new Date().toISOString().slice(0, 10)) {
  return items.reduce((summary, item) => {
    const status = expiryStatus(item.expiry, today);
    summary.products += 1;
    if (status === 'soon') summary.expiringSoon += 1;
    if (status === 'expired') summary.expired += 1;
    if (Number(item.minimum) > 0 && Number(item.quantity) <= Number(item.minimum)) summary.lowStock += 1;
    return summary;
  }, { products: 0, expiringSoon: 0, expired: 0, lowStock: 0 });
}

export function createShoppingItem(input = {}, now = new Date().toISOString()) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Χρειάζεται όνομα προϊόντος.');
  const quantity = Number(input.quantity ?? 1);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Η ποσότητα πρέπει να είναι μεγαλύτερη από μηδέν.');
  if (quantity > MAX_QUANTITY) throw new Error(`Η ποσότητα δεν μπορεί να ξεπερνά τα ${MAX_QUANTITY}.`);
  return {
    id: String(input.id || makeId()),
    name,
    quantity,
    unit: normalizeUnit(input.unit),
    ...(input.itemId ? { itemId: String(input.itemId) } : {}),
    checked: false,
    createdAt: now
  };
}

export function toggleShoppingItem(items = [], id) {
  return items.map((item) => item.id === id ? { ...item, checked: !item.checked } : item);
}

export function expiryWarning(expiry, today = new Date().toISOString().slice(0, 10)) {
  const due = utcDay(expiry);
  const base = utcDay(today);
  if (due === null || base === null) return '';
  const days = Math.round((due - base) / 86_400_000);
  if (days < -365) return 'Η ημερομηνία λήξης είναι πάνω από ένα χρόνο πριν. Βεβαιώσου ότι είναι σωστή.';
  if (days > 3650) return 'Η ημερομηνία λήξης είναι πάνω από 10 χρόνια μετά. Βεβαιώσου ότι είναι σωστή.';
  return '';
}

export function syncShoppingWithItem(shopping = [], previous, next) {
  if (!previous || !next) return shopping;
  const oldName = String(previous.name).toLocaleLowerCase('el-GR');
  return shopping.map((row) => {
    const linked = row.itemId ? row.itemId === next.id : !row.checked && String(row.name).toLocaleLowerCase('el-GR') === oldName;
    if (!linked) return row;
    return { ...row, itemId: next.id, name: next.name, unit: next.unit };
  });
}

function sameName(a, b) {
  return normalizeSearch(String(a).trim()) === normalizeSearch(String(b).trim());
}

// Called when a shopping row is ticked as bought: adds its quantity to the pantry.
// Returns new items, the updated row (remembering what was added, so unticking can undo it) and a toast message.
export function receiveShoppingItem(items = [], row, now = new Date().toISOString()) {
  const unit = normalizeUnit(row.unit);
  const quantity = Number(row.quantity) || 0;
  let target = row.itemId ? items.find((item) => item.id === row.itemId) : null;
  if (!target) target = items.find((item) => sameName(item.name, row.name) && normalizeUnit(item.unit) === unit);
  if (target && normalizeUnit(target.unit) !== unit) {
    return { items, row: { ...row, checked: true }, message: `Το «${target.name}» έχει άλλη μονάδα (${target.unit}), οπότε το απόθεμα δεν άλλαξε.` };
  }
  if (target) {
    const next = Math.min(MAX_QUANTITY, Number(target.quantity) + quantity);
    const added = next - Number(target.quantity);
    return {
      items: items.map((item) => item.id === target.id ? { ...item, quantity: next, updatedAt: now } : item),
      row: { ...row, checked: true, itemId: target.id, pantryAdded: added },
      message: `Προστέθηκαν ${added} ${unit} «${target.name}» στο απόθεμα.`
    };
  }
  const created = createPantryItem({ name: row.name, quantity: Math.min(MAX_QUANTITY, quantity), unit }, now);
  return {
    items: [created, ...items],
    row: { ...row, checked: true, itemId: created.id, pantryAdded: created.quantity },
    message: `Το «${created.name}» μπήκε στο απόθεμα.`
  };
}

// Called when a bought row is unticked: removes what receiveShoppingItem added.
export function returnShoppingItem(items = [], row, now = new Date().toISOString()) {
  const { pantryAdded, ...rest } = row;
  const cleared = { ...rest, checked: false };
  if (!pantryAdded || !row.itemId) return { items, row: cleared, message: '' };
  const target = items.find((item) => item.id === row.itemId);
  if (!target) return { items, row: cleared, message: '' };
  return {
    items: items.map((item) => item.id === target.id ? { ...item, quantity: Math.max(0, Number(item.quantity) - pantryAdded), updatedAt: now } : item),
    row: cleared,
    message: `Αφαιρέθηκαν ${pantryAdded} ${target.unit} «${target.name}» από το απόθεμα.`
  };
}

export function shoppingListText(shopping = []) {
  const pending = shopping.filter((row) => !row.checked);
  if (!pending.length) return '';
  return ['🛒 Λίστα αγορών (Σπιτοθήκη)', ...pending.map((row) => `• ${row.name} — ${row.quantity} ${normalizeUnit(row.unit)}`)].join('\n');
}

// Items whose expiry is between today and `days` days from now (inclusive), soonest first.
export function expiringWithin(items = [], today = new Date().toISOString().slice(0, 10), days = 3) {
  const base = utcDay(today);
  if (base === null) return [];
  return items
    .map((item) => ({ item, due: utcDay(item.expiry) }))
    .filter(({ due }) => due !== null && due >= base && (due - base) / 86_400_000 <= days)
    .sort((a, b) => a.due - b.due)
    .map(({ item }) => item);
}

// Items that expire within 7 days or already expired: expired first, then soonest expiry first.
export function expiringItems(items = [], today = new Date().toISOString().slice(0, 10)) {
  return items.filter((item) => ['soon', 'expired'].includes(expiryStatus(item.expiry, today)))
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)) || String(a.name).localeCompare(String(b.name)));
}
