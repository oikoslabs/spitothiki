const DEFAULT_UNIT = 'τεμ.';

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

  const minimum = Number(input.minimum ?? 0);
  if (!Number.isFinite(minimum) || minimum < 0) {
    throw new Error('Η ελάχιστη ποσότητα πρέπει να είναι μηδέν ή μεγαλύτερη.');
  }

  return {
    id: String(input.id || makeId()),
    name,
    quantity,
    unit: String(input.unit || DEFAULT_UNIT).trim() || DEFAULT_UNIT,
    minimum,
    category: String(input.category || 'Άλλο').trim() || 'Άλλο',
    expiry: String(input.expiry || ''),
    location: String(input.location || '').trim(),
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
  return {
    id: String(input.id || makeId()),
    name,
    quantity,
    unit: String(input.unit || DEFAULT_UNIT).trim() || DEFAULT_UNIT,
    checked: false,
    createdAt: now
  };
}

export function toggleShoppingItem(items = [], id) {
  return items.map((item) => item.id === id ? { ...item, checked: !item.checked } : item);
}
