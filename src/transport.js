// Transport expenses: fuel, tolls, public transport, taxi, parking. Pure functions (unit-tested).
export const TRANSPORT_TYPES = ['fuel', 'tolls', 'transit', 'taxi', 'parking', 'other'];
export const TRANSPORT_ICONS = { fuel: '⛽', tolls: '🛣️', transit: '🚇', taxi: '🚕', parking: '🅿️', other: '🚗' };

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));
function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

export function createTransport(input = {}, now = new Date().toISOString()) {
  const type = TRANSPORT_TYPES.includes(input.type) ? input.type : 'other';
  const amount = num(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error('Γράψε ένα έγκυρο ποσό.');
  if (!isDate(input.date)) throw new Error('Διάλεξε ημερομηνία.');
  const entry = { id: input.id || makeId('tr'), type, amount: round2(amount), date: input.date, note: String(input.note || '').trim().slice(0, 80), createdAt: input.createdAt || now, updatedAt: now };
  if (input.recurringId) entry.recurringId = input.recurringId;
  if (type === 'fuel') {
    const liters = num(input.liters), km = num(input.odometer);
    if (Number.isFinite(liters)) { if (liters <= 0 || liters > 2000) throw new Error('Μη έγκυρα λίτρα.'); entry.liters = round3(liters); }
    if (Number.isFinite(km)) { if (km < 0 || km > 5_000_000) throw new Error('Μη έγκυρα χιλιόμετρα.'); entry.odometer = Math.round(km); }
    if (input.vehicle) entry.vehicle = String(input.vehicle);
  }
  return entry;
}

export function pricePerLiter(entry) {
  return entry?.type === 'fuel' && entry.liters > 0 ? round3(entry.amount / entry.liters) : null;
}

// Consumption (l/100km) per fuel entry of a vehicle, computed from the previous odometer reading
// (fill-up method: litres put in now / km driven since last reading).
export function fuelStats(entries = [], vehicle = '') {
  const fuel = entries.filter((e) => e.type === 'fuel' && (e.vehicle || '') === (vehicle || '') && Number.isFinite(e.odometer))
    .sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date));
  const rows = [];
  for (let i = 1; i < fuel.length; i += 1) {
    const km = fuel[i].odometer - fuel[i - 1].odometer;
    if (km > 0 && fuel[i].liters > 0) rows.push({ id: fuel[i].id, km, l100: Math.round((fuel[i].liters / km) * 1000) / 10 });
  }
  const km = rows.reduce((s, r) => s + r.km, 0);
  const liters = rows.reduce((s, r) => s + fuel.find((f) => f.id === r.id).liters, 0);
  return { rows, average: km ? Math.round((liters / km) * 1000) / 10 : null, km };
}

export function consumptionFor(entries, entry) {
  return fuelStats(entries, entry.vehicle || '').rows.find((r) => r.id === entry.id) || null;
}

export function transportMonth(entries = [], month) {
  const byType = {};
  let total = 0, count = 0;
  for (const e of entries) {
    if (!String(e.date).startsWith(`${month}-`)) continue;
    total += e.amount; count += 1;
    byType[e.type] = round2((byType[e.type] || 0) + e.amount);
  }
  return { total: round2(total), count, byType: TRANSPORT_TYPES.filter((t) => byType[t]).map((type) => ({ type, total: byType[type] })).sort((a, b) => b.total - a.total) };
}

export function createTransportRecurring(input = {}, now = new Date().toISOString()) {
  const base = createTransport({ ...input, date: input.start || input.date }, now);
  const day = Math.min(28, Math.max(1, Number(input.day) || Number(base.date.slice(8, 10)) || 1));
  return { id: input.id || makeId('trr'), type: base.type, amount: base.amount, note: base.note, day, start: base.date.slice(0, 7), lastMonth: input.lastMonth || '', createdAt: base.createdAt, updatedAt: now };
}

const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };

// Adds monthly entries (deterministic ids, so devices that sync don't duplicate them) up to today.
export function applyTransportRecurring(rules = [], entries = [], today, now = new Date().toISOString()) {
  const added = [];
  const ids = new Set(entries.map((e) => e.id));
  const current = today.slice(0, 7);
  const next = rules.map((rule) => {
    let month = rule.lastMonth ? nextMonth(rule.lastMonth) : rule.start;
    let last = rule.lastMonth;
    while (month <= current) {
      const date = `${month}-${String(rule.day).padStart(2, '0')}`;
      if (month === current && date > today) break;
      const id = `${rule.id}_${month}`;
      if (!ids.has(id)) { added.push(createTransport({ id, type: rule.type, amount: rule.amount, note: rule.note, date, recurringId: rule.id }, now)); ids.add(id); }
      last = month; month = nextMonth(month);
    }
    return last === rule.lastMonth ? rule : { ...rule, lastMonth: last, updatedAt: now };
  });
  return { rules: next, entries: added.length ? [...entries, ...added] : entries, added, changed: added.length > 0 || next.some((r, i) => r !== rules[i]) };
}

// ---------- Receipts: detect fuel / toll receipts ----------
const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('el-GR');
const FUEL_RE = /ΑΜΟΛΥΒΔ|UNLEADED|DIESEL|ΝΤΙΖΕΛ|ΠΕΤΡΕΛΑΙΟ ΚΙΝΗΣ|ΒΕΝΖΙΝ|BENZIN|ΚΑΥΣΙΜ|\bLPG\b|AUTOGAS|ΥΓΡΑΕΡΙΟ|ΛΙΤΡ|LITR|\bLT\b|SUPER ?95|\b95 ?OCT|\b100 ?OCT|ΑΝΤΛΙΑ|PUMP|ΠΡΑΤΗΡΙΟ|SHELL|\bBP\b|\bEKO\b|\bΕΚΟ\b|AVIN|AEGEAN OIL|ELIN|ΕΛΙΝ|REVOIL|CYCLON|JETOIL|KAOIL/;
const TOLL_RE = /ΔΙΟΔΙ|TOLL|ΑΤΤΙΚΗ ΟΔΟΣ|ATTIKI ODOS|ΑΤΤΙΚΗΣ ΟΔΟΥ|ΕΓΝΑΤΙΑ|EGNATIA|ΟΛΥΜΠΙΑ ΟΔΟΣ|OLYMPIA ODOS|ΝΕΑ ΟΔΟΣ|NEA ODOS|ΚΕΝΤΡΙΚΗ ΟΔΟΣ|ΜΟΡΕΑΣ|MOREAS|ΑΥΤΟΚΙΝΗΤΟΔΡΟΜΟΣ ΑΙΓΑΙΟΥ|ΓΕΦΥΡΑ.*ΡΙΟΥ|GEFYRA|ΣΤΑΘΜΟΣ ΔΙΟΔΙΩΝ|E-?PASS/;
const n = (s) => Number(String(s).replace(',', '.'));

export function classifyReceipt(receipt = {}, rawText = '') {
  const text = plain([receipt.issuerName, ...(receipt.lines || []).map((l) => l.rawName || l.name), rawText].join('\n'));
  const toll = TOLL_RE.test(text);
  const fuelLines = (receipt.lines || []).filter((l) => FUEL_RE.test(plain(l.rawName || l.name)) || l.unit === 'λίτρα');
  const fuel = fuelLines.length > 0 || FUEL_RE.test(text);
  if (!fuel && !toll) return null;
  // Tolls win only when there is no sign of litres (a toll name can appear on a fuel station receipt on the motorway).
  const type = fuel && !(toll && !fuelLines.length && !/ΛΙΤΡ|LITR|\bLT\b/.test(text)) ? 'fuel' : 'tolls';
  const out = { type, amount: receipt.total || 0, date: receipt.date || '', note: receipt.issuerName || '' };
  if (type === 'fuel') {
    let liters = fuelLines.reduce((s, l) => s + (l.unit === 'λίτρα' || l.quantity > 1.5 ? l.quantity : 0), 0);
    if (!liters) { const m = text.match(/(\d{1,3}[.,]\d{2,3})\s*(?:LT|LTR|L|ΛΙΤΡΑ|ΛΙΤ|Λ)\b/); if (m) liters = n(m[1]); }
    const p = text.match(/(\d[.,]\d{3})\s*(?:€|EUR)?\s*\/\s*(?:LT|LTR|L|ΛΙΤ|Λ)/) || text.match(/(?:ΤΙΜΗ\s*(?:ΜΟΝ|ΛΙΤΡ)\S*|PRICE)\s*:?\s*(\d[.,]\d{3})/);
    if (liters > 0) out.liters = Math.round(liters * 1000) / 1000;
    if (p) out.ppl = n(p[1]);
    else if (out.liters && out.amount) out.ppl = round3(out.amount / out.liters);
    if (!out.liters && out.ppl && out.amount) out.liters = round3(out.amount / out.ppl);
  }
  return out;
}
