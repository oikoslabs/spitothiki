// Cart helpers: last price paid (from scanned receipts) and product price from a shelf-label photo's OCR text.
import { normalizeSearch } from './domain.js';

const round2 = (n) => Math.round(n * 100) / 100;
const tokens = (name) => normalizeSearch(name).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 || /\d/.test(w));
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

// 0..1: share of the shorter name's words found in the other (prefix match covers till abbreviations).
export function nameScore(a, b) {
  const x = tokens(a); const y = tokens(b);
  if (!x.length || !y.length) return 0;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const hits = short.filter((w) => long.some((v) => same(w, v))).length;
  return hits / short.length;
}

// Newest receipt line matching the product (barcode if the line has one, else name). Unit price per piece / per kg.
export function lastReceiptPrice(receipts = [], { barcode = '', name = '' } = {}) {
  let best = null;
  for (const r of receipts) {
    for (const item of r.items || []) {
      const byCode = barcode && item.barcode && item.barcode === barcode;
      const score = byCode ? 2 : name ? nameScore(name, item.name) : 0;
      if (score < 0.6 || !(Number(item.price) > 0)) continue;
      if (!byCode && tokens(name).length >= 2 && tokens(item.name).length >= 2 && score < 1 && tokens(name).filter((w) => tokens(item.name).some((v) => same(w, v))).length < 2) continue;
      const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      const kg = item.unit === 'κιλά' || item.unit === 'kg' || !Number.isInteger(qty);
      const cand = { price: round2(Number(item.price) / qty), unit: kg ? 'κιλά' : 'τεμ.', store: r.store || '', date: r.date || '', score };
      const key = `${r.date || ''}${r.importedAt || ''}`;
      if (!best || score > best.score || (score === best.score && key > best.key)) best = { ...cand, key };
    }
  }
  if (!best) return null;
  const { key, ...out } = best;
  return out;
}

// ---------- Shelf label OCR → product price ----------
const UNIT_WORDS = /κιλ|kg|κγ|\/\s*k|λιτρ|λιτ\b|\/\s*l\b|\/\s*lt|ανα\b|ανά|μοναδ|τιμη\s*κιλ|τιμη\s*λιτ|per\s*kg|\/\s*τεμ|100\s*g|100\s*γρ/i;
const OLD_PRICE = /αρχικ|παλια|προηγ|πριν\b/i;
const PRICE_RE = /(?<![\d.,])(\d{1,3})\s?[.,]\s?(\d{2})(?![\d%])\s*(€|ευρ|eur)?/gi;
const PRICE_SPACE_RE = /(?<![\d.,])(\d{1,2})\s+(\d{2})\s*€/g; // big-digit labels: "1 89€"

// Returns { best, candidates:[{price, score}] }. Prices on unit-price lines (€/kg, ανά λίτρο…) are ignored.
export function extractShelfPrice(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const found = new Map();
  lines.forEach((line, i) => {
    const plain = normalizeSearch(line);
    const prev = i > 0 ? normalizeSearch(lines[i - 1]) : '';
    const unitLine = UNIT_WORDS.test(plain) || (UNIT_WORDS.test(prev) && !/\d/.test(prev));
    if (unitLine || OLD_PRICE.test(plain)) return;
    const add = (int, dec, euro) => {
      const price = round2(Number(`${int}.${dec}`));
      if (!(price > 0) || price > 999) return;
      let score = 1;
      if (euro) score += 2;
      if (/^[€\s]*\d{1,3}\s?[.,]?\s?\d{2}\s*(€|ευρω|eur)?$/i.test(line)) score += 3; // price alone on its line (the big one)
      if (/τιμη|προσφορ|τελικ/.test(plain)) score += 1;
      found.set(price, Math.max(found.get(price) || 0, score));
    };
    for (const m of line.matchAll(PRICE_RE)) add(m[1], m[2], m[3]);
    for (const m of line.matchAll(PRICE_SPACE_RE)) add(m[1], m[2], '€');
  });
  const candidates = [...found].map(([price, score]) => ({ price, score })).sort((a, b) => b.score - a.score || b.price - a.price);
  if (!candidates.length) return { best: null, candidates: [], ambiguous: false };
  const ambiguous = candidates.length > 1 && candidates[1].score >= candidates[0].score;
  return { best: candidates[0].price, candidates: candidates.slice(0, 3), ambiguous };
}
