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
// { ids, guide, insights }. «guide» is the compact home-screen user-guide link: on by default, even for
// older saved custom layouts (plain arrays). Hidden only when the saved object has guide: false.
// «insights» is the «Τι άλλαξε αυτόν τον μήνα» card: on by default the same way; hidden only when insights: false.
export function parseHomeState(raw) {
  if (raw == null || raw === '') return { ids: [...DEFAULT_HOME], guide: true, insights: true };
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return { ids: normalizeHome(v), guide: true, insights: true };
    if (v && typeof v === 'object') {
      const ids = Array.isArray(v.ids) ? normalizeHome(v.ids) : [...DEFAULT_HOME];
      return { ids, guide: v.guide !== false, insights: v.insights !== false };
    }
  } catch {}
  return { ids: [...DEFAULT_HOME], guide: true, insights: true };
}
export function parseHome(raw) {
  return parseHomeState(raw).ids;
}
export function serializeHome({ ids, guide, insights }) {
  const list = normalizeHome(ids);
  const showGuide = guide !== false;
  const showInsights = insights !== false;
  if (JSON.stringify(list) === JSON.stringify(DEFAULT_HOME) && showGuide && showInsights) return null;
  return JSON.stringify({ ids: list, guide: showGuide, insights: showInsights });
}
export function toggleHome(ids, id, on) {
  if (!VALID.has(id)) return normalizeHome(ids);
  const rest = normalizeHome(ids).filter((x) => x !== id);
  return normalizeHome(on ? [...rest, id] : rest);
}
export const isDefaultHome = (ids) => JSON.stringify(normalizeHome(ids)) === JSON.stringify(DEFAULT_HOME);
export const isDefaultHomeState = ({ ids, guide, insights }) => isDefaultHome(ids) && guide !== false && insights !== false;
