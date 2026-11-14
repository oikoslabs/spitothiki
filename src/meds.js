// Medications book (Pro). Doses at set times, per person, «✓ Το πήρα»,
// pills-left alert. Stored as household `meds` records (existing shape) — no rules change.
// Closed-app push is not wired (would need worker changes); due doses surface in-app.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const makeId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clip = (s, n) => String(s || '').trim().slice(0, n);
const r2 = (n) => Math.round(Number(n) * 100) / 100;

export function normalizeTimes(times) {
  const raw = Array.isArray(times) ? times : String(times || '').split(/[,;\s]+/);
  const out = [];
  for (const item of raw) {
    const t = String(item || '').trim();
    if (!TIME.test(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out.sort();
}

export function createMed(input = {}, now = new Date().toISOString()) {
  const name = clip(input.name, 80);
  if (!name) throw new Error('Γράψε το όνομα του φαρμάκου.');
  const times = normalizeTimes(input.times);
  if (!times.length) throw new Error('Βάλε τουλάχιστον μία ώρα δόσης (π.χ. 08:00).');
  const quantity = input.quantity === '' || input.quantity == null ? null : Number(input.quantity);
  if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) throw new Error('Η ποσότητα πρέπει να είναι αριθμός 0 ή μεγαλύτερος.');
  const alertBelow = input.alertBelow === '' || input.alertBelow == null ? 5 : Number(input.alertBelow);
  if (!Number.isFinite(alertBelow) || alertBelow < 0) throw new Error('Το όριο ειδοποίησης δεν είναι έγκυρο.');
  const doseQty = input.doseQty == null || input.doseQty === '' ? 1 : Number(input.doseQty);
  if (!Number.isFinite(doseQty) || doseQty <= 0) throw new Error('Η ποσότητα ανά δόση πρέπει να είναι θετική.');
  return {
    id: input.id || makeId('med'),
    name,
    person: clip(input.person, 40),
    dose: clip(input.dose, 40) || '1',
    doseQty: r2(doseQty),
    times,
    quantity: quantity == null ? null : r2(quantity),
    alertBelow: r2(alertBelow),
    notes: clip(input.notes, 200),
    taken: input.taken && typeof input.taken === 'object' ? input.taken : {},
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function takenOn(med, date) {
  const list = med?.taken?.[date];
  return Array.isArray(list) ? list.filter((t) => TIME.test(t)) : [];
}

export function dueDoses(med, date, nowTime = '23:59') {
  const taken = new Set(takenOn(med, date));
  return (med.times || []).filter((time) => time <= nowTime && !taken.has(time));
}

export function allDueDoses(meds = [], date, nowTime = '23:59') {
  const rows = [];
  for (const med of meds) {
    for (const time of dueDoses(med, date, nowTime)) rows.push({ med, time });
  }
  return rows.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name, 'el'));
}

export function isLowStock(med) {
  if (med?.quantity == null) return false;
  return Number(med.quantity) <= Number(med.alertBelow ?? 5);
}

export function lowStockMeds(meds = []) {
  return meds.filter(isLowStock);
}

export function markTaken(med, { date, time, now = new Date().toISOString() } = {}) {
  if (!DATE.test(date) || !TIME.test(time)) throw new Error('Μη έγκυρη ημερομηνία ή ώρα δόσης.');
  const taken = { ...(med.taken || {}) };
  const day = [...takenOn(med, date)];
  if (!day.includes(time)) day.push(time);
  taken[date] = day.sort();
  let quantity = med.quantity;
  if (quantity != null) quantity = r2(Math.max(0, quantity - (Number(med.doseQty) || 1)));
  return { ...med, taken, quantity, updatedAt: now };
}

export function undoTaken(med, { date, time, now = new Date().toISOString() } = {}) {
  const taken = { ...(med.taken || {}) };
  const day = takenOn(med, date).filter((t) => t !== time);
  if (day.length) taken[date] = day;
  else delete taken[date];
  let quantity = med.quantity;
  if (quantity != null) quantity = r2(quantity + (Number(med.doseQty) || 1));
  return { ...med, taken, quantity, updatedAt: now };
}

export const MEDS_EN = {
  'Φάρμακα': 'Medications',
  'Δόσεις στις ώρες σου, ανά άτομο, με υπενθύμιση όταν τελειώνουν τα χάπια.': 'Doses at your times, per person, with an alert when pills run low.',
  'Νέο φάρμακο': 'New medication',
  'Όνομα φαρμάκου': 'Medication name',
  'Άτομο': 'Person',
  'Προαιρετικά — π.χ. για ποιον είναι.': 'Optional — e.g. who it is for.',
  'Δόση (ετικέτα)': 'Dose (label)',
  'Ώρες δόσεων': 'Dose times',
  'π.χ. 08:00, 20:00': 'e.g. 08:00, 20:00',
  'Χάπια που μένουν': 'Pills left',
  'Ειδοποίηση όταν μείνουν': 'Alert when left',
  'Σημειώσεις': 'Notes',
  'Αποθήκευση': 'Save',
  'Άκυρο': 'Cancel',
  '✓ Το πήρα': '✓ I took it',
  'Αναίρεση δόσης': 'Undo dose',
  'Τελειώνουν σύντομα': 'Running low',
  'Σήμερα δεν έχει εκκρεμή δόση.': 'No dose due today.',
  'Δεν έχεις φάρμακα ακόμη.': 'No medications yet.',
  'Γράψε το όνομα του φαρμάκου.': 'Enter the medication name.',
  'Βάλε τουλάχιστον μία ώρα δόσης (π.χ. 08:00).': 'Add at least one dose time (e.g. 08:00).',
  'Η ποσότητα πρέπει να είναι αριθμός 0 ή μεγαλύτερος.': 'Quantity must be 0 or more.',
  'Το όριο ειδοποίησης δεν είναι έγκυρο.': 'The alert threshold is not valid.',
  'Η ποσότητα ανά δόση πρέπει να είναι θετική.': 'The amount per dose must be positive.',
  'Μη έγκυρη ημερομηνία ή ώρα δόσης.': 'Invalid dose date or time.',
  'Το φάρμακο διαγράφηκε.': 'The medication was deleted.',
  'Καταγράφηκε η δόση.': 'Dose recorded.',
  'Φαρμακείο': 'Pharmacy'
};
