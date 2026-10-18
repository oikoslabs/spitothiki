// GS1 helpers: in-store variable-measure EAN-13 (prefix 20-29) and GS1 element strings
// (DataMatrix / GS1 QR / GS1-128 / Digital Link URLs).

export function ean13Valid(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

export function gtinCheckDigit(body) {
  const digits = [...String(body)].reverse();
  const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}
export const gtinValid = (code) => /^\d{8,14}$/.test(code) && gtinCheckDigit(code.slice(0, -1)) === Number(code.slice(-1));

// GTIN-14 with leading zeros -> the shortest retail form (EAN-13 / UPC-A / EAN-8) used by Open Food Facts.
export function shortGtin(gtin) {
  let code = String(gtin || '').replace(/\D/g, '');
  while (code.length > 13 && code[0] === '0') code = code.slice(1);
  if (code.length === 13 && code.startsWith('00000')) code = code.slice(5);
  return code;
}

export const VM_MODES = ['auto', 'price', 'weight'];
export const isVariableMeasure = (code) => /^2\d{12}$/.test(String(code || '')) && ean13Valid(code);

// Layout (GS1 Greece and the common Greek in-store scale setting):
//   2P IIIII VVVVV C   (P = prefix digit, I = item/PLU, V = value, C = EAN check digit)
// 25-29 are GS1 Greece supplier prefixes (5-digit company prefix + 2-digit item) and carry weight in grams.
// 20-24 are left to each store; value is either price in cents or weight in grams.
// mode: 'price' | 'weight' | 'auto'. memoryUnit: last remembered unit for this item ('κιλά'/'τεμ.').
export function parseVariableMeasure(code, { mode = 'auto', memoryUnit = '' } = {}) {
  const raw = String(code || '').replace(/\D/g, '');
  if (!isVariableMeasure(raw)) return null;
  const prefix = raw.slice(0, 2);
  const id = raw.slice(0, 7);
  const value = Number(raw.slice(7, 12));
  let chosen = mode === 'price' || mode === 'weight' ? mode : '';
  let reason = chosen ? 'store' : '';
  if (!chosen && Number(prefix) >= 25) { chosen = 'weight'; reason = 'gs1-greece'; }
  if (!chosen && memoryUnit) { chosen = memoryUnit === 'κιλά' ? 'weight' : 'price'; reason = 'memory'; }
  if (!chosen) { chosen = value < 50 || value > 20000 ? 'price' : 'weight'; reason = 'plausibility'; }
  return {
    kind: 'vm', code: raw, prefix, id, plu: raw.slice(2, 7), value, mode: chosen, auto: reason !== 'store', reason,
    price: chosen === 'price' ? value / 100 : null,
    weightKg: chosen === 'weight' ? value / 1000 : null
  };
}

// ---------- GS1 Application Identifiers ----------
const GS = '\u001d';
const FIXED = { '00': 18, '01': 14, '02': 14, '03': 14, '04': 16, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2, '31': 6, '32': 6, '33': 6, '34': 6, '35': 6, '36': 6, '41': 13 };
function aiLength(data, i) {
  const two = data.slice(i, i + 2);
  if (/^(0[0-4]|1[0-7]|2[0-2]|3[07]|9\d)$/.test(two)) return 2;
  if (/^3[1-6]/.test(two) || /^(39|70|71|72|80|81|82)/.test(two)) return 4;
  if (/^(2[3-5]|4[0-3])/.test(two)) return 3;
  if (/^(23)/.test(two)) return 3;
  return 0;
}

function parseElementString(input) {
  let data = String(input).replace(/^\](d2|Q3|C1|e0|J1)/, '').replace(/^\u00e8|^\u001d/, '');
  const out = {};
  if (/^\(\d{2,4}\)/.test(data)) {
    for (const m of data.matchAll(/\((\d{2,4})\)([^(]*)/g)) out[m[1]] = m[2].replace(/[\u001d\s]+$/g, '');
    return out;
  }
  let i = 0;
  while (i < data.length) {
    if (data[i] === GS) { i += 1; continue; }
    const len = aiLength(data, i);
    if (!len) return null;
    const ai = data.slice(i, i + len);
    i += len;
    const fixed = FIXED[ai.slice(0, 2)];
    let value;
    if (fixed && !(ai.length === 3 && ai.slice(0, 2) === '41' ? false : false)) {
      const size = ai.length === 4 ? 6 : fixed;
      value = data.slice(i, i + size);
      i += size;
      if (data[i] === GS) i += 1;
    } else {
      const end = data.indexOf(GS, i);
      value = data.slice(i, end < 0 ? data.length : end);
      i = end < 0 ? data.length : end + 1;
    }
    out[ai] = value;
  }
  return out;
}

const DL_KEYS = new Set(['01', '10', '21', '22', '235', '8006', '8010', '414', '417', '00', '253', '255', '401', '402', '8003', '8004', '8013', '8017', '8018']);
function parseDigitalLink(text) {
  let url;
  try { url = new URL(text); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const start = parts.findIndex((p, i) => p === '01' && /^\d{8,14}$/.test(parts[i + 1] || ''));
  if (start < 0) return null;
  const out = {};
  for (let i = start; i + 1 < parts.length; i += 2) { if (DL_KEYS.has(parts[i]) || /^\d{2,4}$/.test(parts[i])) out[parts[i]] = parts[i + 1]; }
  for (const [key, value] of url.searchParams) if (/^\d{2,4}$/.test(key)) out[key] = value;
  return out;
}

function gs1Date(value) {
  if (!/^\d{6}$/.test(value || '')) return '';
  const yy = Number(value.slice(0, 2));
  const now = new Date().getFullYear() % 100;
  // GS1 century rule: within -49..+50 years of the current year.
  const diff = yy - now;
  const century = Math.floor(new Date().getFullYear() / 100) * 100 + (diff > 50 ? -100 : diff < -49 ? 100 : 0);
  const year = century + yy;
  const month = Number(value.slice(2, 4));
  let day = Number(value.slice(4, 6));
  if (month < 1 || month > 12) return '';
  if (day === 0) day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const decimal = (value, places) => (/^\d+$/.test(value || '') ? Number(value) / 10 ** Number(places) : null);

export function parseGs1(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const ais = /^https?:\/\//i.test(raw) ? parseDigitalLink(raw)
    : /^(\]..)?[\u001d\u00e8]?(\(\d{2,4}\))?\d/.test(raw) && (/[\u001d(]|^\]/.test(raw) || /^01\d{14}/.test(raw)) ? parseElementString(raw) : null;
  if (!ais || !ais['01'] || !gtinValid(ais['01'])) return null;
  const result = { kind: 'gs1', ais, gtin: ais['01'], barcode: shortGtin(ais['01']) };
  if (ais['17']) result.expiry = gs1Date(ais['17']);
  if (ais['15']) result.bestBefore = gs1Date(ais['15']);
  if (ais['16']) result.sellBy = gs1Date(ais['16']);
  if (ais['10']) result.batch = ais['10'];
  if (ais['21']) result.serial = ais['21'];
  if (ais['30']) result.count = Number(ais['30']);
  const weight = Object.keys(ais).find((ai) => /^310\d$/.test(ai));
  if (weight) result.weightKg = decimal(ais[weight], weight[3]);
  const price = Object.keys(ais).find((ai) => /^392\d$/.test(ai));
  if (price) result.price = decimal(ais[price], price[3]);
  const priceCur = Object.keys(ais).find((ai) => /^393\d$/.test(ai));
  if (!price && priceCur && ais[priceCur].slice(0, 3) === '978') result.price = decimal(ais[priceCur].slice(3), priceCur[3]);
  result.date = result.expiry || result.bestBefore || '';
  return result;
}

// One entry point for every scanned value. vmMode(prefix) returns the store's setting for 20-29 prefixes.
export function interpretCode(text, { vmMode = () => 'auto', memoryUnit = () => '' } = {}) {
  const raw = String(text || '').trim();
  const gs1 = parseGs1(raw);
  if (gs1) {
    const vm = isVariableMeasure(gs1.barcode) ? parseVariableMeasure(gs1.barcode, { mode: vmMode(gs1.barcode.slice(0, 2)), memoryUnit: memoryUnit(gs1.barcode.slice(0, 7)) }) : null;
    return vm ? { ...gs1, ...vm, kind: 'gs1', barcode: vm.id, price: gs1.price ?? vm.price, weightKg: gs1.weightKg ?? vm.weightKg } : gs1;
  }
  const digits = raw.replace(/\s/g, '');
  if (isVariableMeasure(digits)) {
    const vm = parseVariableMeasure(digits, { mode: vmMode(digits.slice(0, 2)), memoryUnit: memoryUnit(digits.slice(0, 7)) });
    return { ...vm, barcode: vm.id };
  }
  return { kind: 'plain', barcode: /^\d{6,14}$/.test(digits) ? digits : '', raw };
}
