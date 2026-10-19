// First-run setup: at most 3 questions (language, which bills, text size). Skippable; never shown to people who
// already have data; can be run again from Settings. Bills chosen here become one-tap shortcuts in Λογαριασμοί.
export const ONBOARD_KEY = 'spitothiki:onboarded';
export const PRESETS_KEY = 'spitothiki:bill-presets';
export const BILL_PRESETS = [
  { id: 'dei', name: 'ΔΕΗ', type: 'electricity', period: 1, icon: '💡' },
  { id: 'water', name: 'ΕΥΔΑΠ', type: 'water', period: 4, icon: '💧' },
  { id: 'gas', name: 'Φυσικό αέριο', type: 'gas', period: 1, icon: '🔥' },
  { id: 'mobile', name: 'Κινητό', type: 'phone', period: 1, icon: '📱' },
  { id: 'internet', name: 'Σταθερό / internet', type: 'internet', period: 1, icon: '🌐' },
  { id: 'rent', name: 'Ενοίκιο', type: 'rent', period: 1, icon: '🏠' },
  { id: 'enfia', name: 'ΕΝΦΙΑ', type: 'tax', period: 1, icon: '🏛️' },
  { id: 'road', name: 'Τέλη κυκλοφορίας', type: 'tax', period: 12, icon: '🚗' },
  { id: 'insurance', name: 'Ασφάλιση', type: 'insurance', period: 12, icon: '🛡️' }
];
export const hasData = (state = {}) => ['items', 'shopping', 'bills', 'purchases', 'transport', 'extras', 'receipts', 'meals', 'trips'].some((k) => Array.isArray(state[k]) && state[k].length);
export const shouldOnboard = (state, flag) => !flag && !hasData(state);
export const presetsFrom = (ids = []) => BILL_PRESETS.filter((p) => ids.includes(p.id));
// Shortcuts still useful: presets with no bill of that name yet.
const key = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('el-GR').replace(/[^A-ZΑ-Ω0-9]/g, '');
export const pendingPresets = (ids = [], bills = []) => presetsFrom(ids).filter((p) => !bills.some((b) => b.presetId === p.id || key(b.name) === key(p.name)));
