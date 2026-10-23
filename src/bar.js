// Bottom shortcut bar (phones): which shortcuts and in what order. Device-local. Pure helpers (unit-tested).
export const BAR_KEY = 'spitothiki:bottom-bar';
export const BAR_MAX = 5;
export const DEFAULT_BAR = ['scan', 'list', 'extra', 'transport', 'all'];
// quick actions (data-quick) and pages (view:<name>, data-view)
export const BAR_OPTIONS = [
  { id: 'scan', icon: '📷', label: 'Σάρωση' }, { id: 'list', icon: '✓', label: 'Στη λίστα' }, { id: 'extra', icon: '☕', label: 'Μικροέξοδο' },
  { id: 'transport', icon: '⛽', label: 'Μετακίνηση' }, { id: 'all', icon: '⚡', label: 'Κινήσεις' }, { id: 'view:chores', icon: '🧹', label: 'Δουλειές' },
  { id: 'view:pantry', icon: '▦', label: 'Απόθεμα' }, { id: 'view:shopping', icon: '📝', label: 'Λίστα' }, { id: 'view:bills', icon: '📄', label: 'Λογαριασμοί' },
  { id: 'view:transport', icon: '🚗', label: 'Μετακινήσεις' }, { id: 'view:extras', icon: '🧾', label: 'Μικροέξοδα' }, { id: 'view:insights', icon: '∑', label: 'Σύνολο' },
  { id: 'cart', icon: '🛒', label: 'Καλάθι' }, { id: 'cook', icon: '🍳', label: 'Μαγείρεμα' }, { id: 'receipt', icon: '🧾', label: 'Απόδειξη' },
  { id: 'bill', icon: '➕', label: 'Νέος λογ/σμός' }, { id: 'product', icon: '＋', label: 'Προϊόν' }, { id: 'view:overview', icon: '⌂', label: 'Αρχική' },
  { id: 'view:settings', icon: '⚙', label: 'Ρυθμίσεις' }
];
const VALID = new Set(BAR_OPTIONS.map((o) => o.id));
export const barOption = (id) => BAR_OPTIONS.find((o) => o.id === id);
export function normalizeBar(ids) {
  if (!Array.isArray(ids)) return [...DEFAULT_BAR];
  const out = [...new Set(ids.filter((id) => VALID.has(id)))].slice(0, BAR_MAX);
  return out.length ? out : [...DEFAULT_BAR];
}
export function parseBar(raw) { try { return normalizeBar(JSON.parse(raw)); } catch { return [...DEFAULT_BAR]; } }
export function moveBar(ids, index, delta) {
  const j = index + delta; if (j < 0 || j >= ids.length) return [...ids];
  const out = [...ids]; [out[index], out[j]] = [out[j], out[index]]; return out;
}
export function toggleBar(ids, id) {
  if (ids.includes(id)) return ids.length > 1 ? ids.filter((x) => x !== id) : [...ids];
  return ids.length >= BAR_MAX || !VALID.has(id) ? [...ids] : [...ids, id];
}
