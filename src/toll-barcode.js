// Toll receipts: barcode (Code128, digits only) and OCR-text parsers. Pure functions (unit-tested).
// Real Nea Attiki Odos receipt (Rupaki toll station, 14/10/2026 16:33:47, receipt no 8353391, 2,55 €)
// decodes to 36 digits: 05 | 20261014163347 | 008353391 | 00998700009
//                       ?? | date+time       | receipt   | unknown (no amount in it)
// Lenient: non-digits (e.g. "]C0", spaces) are ignored, 35–40 digits accepted, the timestamp is searched near the start.
const TOLL_TEXT_RE = /ΑΤΤΙΚΗ\s*Ο[ΔΛ]ΟΣ|ATTIKI\s*ODOS|ΔΙΟΔΙ|ΔΙΟΔ|ΣΤΑΘΜΟΣ\s+Δ|ΠΛΗΡΩΜΗΣ\s+Δ|TOLL|[A-Z]{3}[-~ ]?L0?\d{1,2}\s+\d{3,5}/i;

function validStamp(y, mo, d, h, mi, s) {
  if (y < 2020 || y > 2035 || h > 23 || mi > 59 || s > 59) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const tollId = (receiptNo, date) => `toll:${receiptNo}:${date}`;

export function parseTollBarcode(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 35 || digits.length > 40) return null;
  for (let i = 0; i <= 6; i++) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{9})/.exec(digits.slice(i));
    if (!m) continue;
    const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
    if (!validStamp(y, mo, d, h, mi, s)) continue;
    const receiptNo = String(Number(m[7]));
    if (receiptNo === '0') continue;
    const date = `${m[1]}-${m[2]}-${m[3]}`;
    return { kind: 'toll', operator: 'Αττική Οδός', prefix: digits.slice(0, i), date, time: `${m[4]}:${m[5]}:${m[6]}`, receiptNo, tail: digits.slice(i + 23), id: tollId(receiptNo, date), raw: digits };
  }
  return null;
}

// Most frequent "ΕΥΡΩ 2,55"-style amount in OCR text (tolerates "2, 55" and a stray trailing digit).
export function tollAmountFromText(text = '') {
  const counts = new Map();
  for (const line of String(text).split(/\n/)) {
    const m = /(?:ΕΥΡΩ|EYPΩ|EYPO|EUR|€)\s*(\d{1,3})\s?[.,]\s?(\d{2})\d?\s*$/i.exec(line.trim());
    if (!m) continue;
    const v = Number(`${m[1]}.${m[2]}`);
    if (v > 0 && v < 100) counts.set(v, (counts.get(v) || 0) + (/ΣΥΝΟΛ|CYNOA|CYROAO|ΜΕΤΡΗΤ|TOTAL/i.test(line) ? 1.5 : 1));
  }
  let best = 0, bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

// Toll receipt from OCR text alone: needs a toll keyword and a "dd/mm/yyyy hh:mm:ss  receiptNo" line.
export function parseTollText(text = '') {
  const t = String(text);
  if (!TOLL_TEXT_RE.test(t)) return null;
  const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{5,9})\b/.exec(t);
  if (!m) return null;
  const [d, mo, y, h, mi, s] = m.slice(1, 7).map(Number);
  if (!validStamp(y, mo, d, h, mi, s)) return null;
  const date = `${m[3]}-${m[2]}-${m[1]}`, receiptNo = String(Number(m[7]));
  return { kind: 'toll', operator: 'Αττική Οδός', prefix: '', date, time: `${m[4]}:${m[5]}:${m[6]}`, receiptNo, id: tollId(receiptNo, date), amount: tollAmountFromText(t) };
}

// Default amount: the most recent toll entry saved from a toll barcode/receipt.
export function lastTollAmount(entries = []) {
  const same = entries.filter((e) => e.type === 'tolls' && String(e.receiptId || '').startsWith('toll:'));
  same.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return same[0]?.amount ?? '';
}

export const isUrlCode = (value) => /^https?:\/\//i.test(String(value || '').trim());
