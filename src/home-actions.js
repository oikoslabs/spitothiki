// Home screen shortcuts: which functions appear as big buttons on the home screen. Device-local (localStorage),
// like the bottom bar. Only controls shortcuts — never data. Pure helpers (unit-tested).
export const HOME_KEY = 'spitothiki:home-actions';
// Stable catalog order (ids are the same data-quick action ids used everywhere else).
export const HOME_OPTIONS = ['scan', 'manual', 'list', 'extra', 'transport', 'bill', 'rent', 'product', 'cart', 'cook', 'receipt'];
export const DEFAULT_HOME = ['scan', 'manual', 'list'];
const VALID = new Set(HOME_OPTIONS);
// Unknown ids dropped, duplicates removed, catalog order kept. An explicit empty list is allowed (zero shortcuts).
export function normalizeHome(ids) {
  if (!Array.isArray(ids)) return [...DEFAULT_HOME];
  const set = new Set(ids.filter((id) => typeof id === 'string' && VALID.has(id)));
  return HOME_OPTIONS.filter((id) => set.has(id));
}
export function parseHome(raw) {
  if (raw == null || raw === '') return [...DEFAULT_HOME];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? normalizeHome(v) : [...DEFAULT_HOME]; } catch { return [...DEFAULT_HOME]; }
}
export function toggleHome(ids, id, on) {
  if (!VALID.has(id)) return normalizeHome(ids);
  const rest = normalizeHome(ids).filter((x) => x !== id);
  return normalizeHome(on ? [...rest, id] : rest);
}
export const isDefaultHome = (ids) => JSON.stringify(normalizeHome(ids)) === JSON.stringify(DEFAULT_HOME);
