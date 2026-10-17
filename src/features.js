// Pure helpers for the newer features (recurring items, voice add, expiry snapshot, ...).
import { createShoppingItem, normalizeSearch, normalizeUnit } from './domain.js';

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function addDays(dateKey, days) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// ---------- Recurring items ----------
export const RECURRING_INTERVALS = [7, 14, 30];

export function createRecurring(input = {}, today, now = new Date().toISOString()) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Χρειάζεται όνομα προϊόντος.');
  const quantity = Number(input.quantity ?? 1);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Η ποσότητα πρέπει να είναι μεγαλύτερη από μηδέν.');
  const everyDays = Math.round(Number(input.everyDays));
  if (!Number.isInteger(everyDays) || everyDays < 1 || everyDays > 365) throw new Error('Διάλεξε κάθε πόσες ημέρες.');
  return { id: String(input.id || makeId('rec')), name, quantity, unit: normalizeUnit(input.unit), category: String(input.category || ''),
    everyDays, nextDue: /^\d{4}-\d{2}-\d{2}$/.test(String(input.nextDue || '')) ? input.nextDue : today, updatedAt: now };
}

// Adds due recurring items to the shopping list (unless already pending) and moves their next date forward.
// Shopping row ids are deterministic per due date, so two synced devices never add the same occurrence twice.
export function applyRecurring(recurring = [], shopping = [], today, now = new Date().toISOString()) {
  let changed = false;
  const nextShopping = [...shopping];
  const added = [];
  const nextRecurring = recurring.map((rule) => {
    if (!rule?.nextDue || rule.nextDue > today) return rule;
    changed = true;
    const pending = nextShopping.some((row) => !row.checked && (row.recurringId === rule.id || normalizeSearch(row.name) === normalizeSearch(rule.name)));
    const rowId = `rec-${rule.id}-${rule.nextDue}`;
    if (!pending && !nextShopping.some((row) => row.id === rowId)) {
      const row = { ...createShoppingItem({ name: rule.name, quantity: rule.quantity, unit: rule.unit }, now), id: rowId, recurringId: rule.id, ...(rule.category ? { category: rule.category } : {}) };
      nextShopping.push(row);
      added.push(row);
    }
    let nextDue = rule.nextDue;
    while (nextDue <= today) nextDue = addDays(nextDue, rule.everyDays);
    return { ...rule, nextDue, updatedAt: now };
  });
  return { recurring: nextRecurring, shopping: nextShopping, added, changed };
}

// ---------- Voice add ----------
const NUMBER_WORDS = {
  'ενα': 1, 'ένα': 1, 'μια': 1, 'μία': 1, 'ενας': 1, 'ένας': 1, 'δυο': 2, 'δύο': 2, 'τρια': 3, 'τρία': 3, 'τρεις': 3, 'τεσσερα': 4, 'τέσσερα': 4, 'τέσσερις': 4, 'πεντε': 5, 'πέντε': 5,
  'εξι': 6, 'έξι': 6, 'δεκα': 10, 'δέκα': 10, 'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'ten': 10, 'some': null
};

export function parseVoiceItems(text) {
  return String(text || '')
    .split(/\s*[,;]\s*|\.(?:\s+|$)|\s+(?:και|κι|and|plus|also|επίσης)\s+/i)
    .map((part) => part.trim().replace(/^(?:and|και|κι)\s+/i, ''))
    .filter(Boolean)
    .map((part) => {
      let quantity = 1;
      let name = part;
      const digits = part.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
      const word = part.match(/^(\S+)\s+(.+)$/);
      if (digits) { quantity = Number(digits[1].replace(',', '.')); name = digits[2]; }
      else if (word && Object.hasOwn(NUMBER_WORDS, word[1].toLowerCase())) { quantity = NUMBER_WORDS[word[1].toLowerCase()] ?? 1; name = word[2]; }
      name = name.trim();
      return { name: name.charAt(0).toLocaleUpperCase() + name.slice(1), quantity: Math.min(99999, quantity > 0 ? quantity : 1) };
    })
    .filter((item) => item.name.length > 0 && item.name.length <= 80);
}

// ---------- Expiry snapshot for the service worker (periodic background sync) ----------
export function expirySnapshot(items = [], { days, lang, lastNotified, titleOne, titleMany, more }) {
  return {
    days, lang, lastNotified: lastNotified || '', titleOne, titleMany, more,
    items: items.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(String(item.expiry || ''))).map((item) => ({ name: item.name, expiry: item.expiry }))
  };
}

export function dueFromSnapshot(snapshot, today) {
  const limit = addDays(today, Number(snapshot?.days ?? 3));
  return (snapshot?.items || []).filter((item) => item.expiry >= today && item.expiry <= limit).sort((a, b) => a.expiry.localeCompare(b.expiry));
}
