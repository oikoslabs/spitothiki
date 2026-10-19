// Toll receipt barcodes (Code128, digits only). Pure functions (unit-tested).
// Known layout from a real receipt (Rupaki toll station, 14/10/2026 16:33:47, receipt no 8353391):
//   05 | 20261014 | 163347 | 00 | 8353391 | 009987000009
//   ?? | date     | time   | ?? | receipt | unknown (no amount in it; amount must be typed or OCR'd)
// Only this exact shape is accepted; anything else returns null.
const RE = /^(\d{2})(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{7})(\d{12})$/;

export function parseTollBarcode(value) {
  const code = String(value ?? '').trim();
  const m = RE.exec(code);
  if (!m) return null;
  const [, prefix, y, mo, d, h, mi, s, pad, receiptNo, tail] = m;
  const year = +y, month = +mo, day = +d;
  if (year < 2015 || year > 2100 || +h > 23 || +mi > 59 || +s > 59) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  if (/^0+$/.test(receiptNo)) return null;
  return {
    kind: 'toll', operator: 'Αττική Οδός', prefix, pad, tail,
    date: `${y}-${mo}-${d}`, time: `${h}:${mi}:${s}`,
    receiptNo: String(+receiptNo), id: `toll:${prefix}:${+receiptNo}`
  };
}

// Default amount: the last toll entry saved from the same barcode prefix (same station/operator).
export function lastTollAmount(entries = [], prefix = '') {
  const same = entries.filter((e) => e.type === 'tolls' && String(e.receiptId || '').startsWith(`toll:${prefix}:`));
  same.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return same[0]?.amount ?? '';
}

export const isUrlCode = (value) => /^https?:\/\//i.test(String(value || '').trim());
