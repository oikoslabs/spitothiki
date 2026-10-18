// Receipt photo import: OCR (Tesseract.js, loaded lazily from a CDN and cached by the SW) + a text parser for Greek till receipts.
import { makeLine } from './receipt.js';

export const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
const VAT_RATES = new Set([4, 6, 9, 13, 17, 24]);
const NOT_ITEM = /ΣΥΝΟΛ|ΦΠΑ|Φ\.Π\.Α|ΑΞΙΑ|ΜΕΤΡΗΤ|ΕΚΠΤΩΣ|ΠΛΗΘΟΣ|ΠΟΣΟΤ|ΑΦΜ|Α\.Φ\.Μ|ΤΗΛ|ΡΕΣΤΑ|ΚΑΡΤΑ|ΠΛΗΡΩΤ|ΤΙΜΗ|ΕΙΔΗ|TOTAL|CASH|VISA|ΑΡ\.|ΗΜΕΡΟΜ|ΩΡΑ/;
const NOT_STORE = /ΑΠΟΔΕΙΞ|ΑΦΜ|Α\.Φ\.Μ|ΔΟΥ|Δ\.Ο\.Υ|Φ\.?Α\.?Ε|ΤΗΛ|ΑΡ\.|ΗΜΕΡΟΜ|ΠΑΡΑΣΤΑΤ|ΤΙΜΟΛΟΓ|ΕΙΔΗ|^EST|NUTS/;

const LOOKALIKE = { A: 'Α', B: 'Β', E: 'Ε', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', X: 'Χ', Y: 'Υ', Z: 'Ζ' };
const plain = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('el-GR');
const amount = (s) => Number(String(s).replace(/[OΟoο]/g, '0').replace(',', '.'));
const NUM = '[0-9OΟ]+[.,][0-9OΟ]{2,3}|[0-9]+';
const MONEY = '[0-9OΟ]+[.,][0-9OΟ]{2}';

// Greek Χ/χ, Latin x/X, × or * between numbers all mean "times".
export function normalizeLine(line) {
  return String(line).replace(/[|«»“”"']/g, ' ').replace(/(\d)\s*[xXΧχ×*]\s*(?=\d)/g, '$1 x ').replace(/\s+/g, ' ').trim();
}

const ITEM_QTY = new RegExp(`^(.*?[\\p{L}].*?)\\s+(${NUM})\\s+x\\s+(${MONEY})\\s+(${MONEY})(?:\\s+(\\d{1,2})\\s*%?)?\\s*\\S{0,2}$`, 'u');
const ITEM_ONE = new RegExp(`^(.*?[\\p{L}].*?)\\s+(${MONEY})\\s+(\\d{1,2})\\s*%?\\s*$`, 'u');

export function parseItemLine(raw) {
  const line = normalizeLine(raw);
  if (!line || NOT_ITEM.test(plain(line))) return null;
  let m = line.match(ITEM_QTY);
  if (m) {
    const quantity = amount(m[2]); const unitPrice = amount(m[3]); const total = amount(m[4]);
    const doubtful = Math.abs(quantity * unitPrice - total) > Math.max(0.02, total * 0.01);
    const weighed = !Number.isInteger(quantity);
    return { ...makeLine({ name: cleanName(m[1]), quantity, unit: weighed ? 'κιλά' : 'τεμ.', price: total }), unitPrice, vat: m[5] ? Number(m[5]) : null, doubtful };
  }
  m = line.match(ITEM_ONE);
  if (m && VAT_RATES.has(Number(m[3]))) {
    return { ...makeLine({ name: cleanName(m[1]), quantity: 1, unit: 'τεμ.', price: amount(m[2]) }), unitPrice: amount(m[2]), vat: Number(m[3]), doubtful: false };
  }
  return null;
}

// Drops OCR crumbs at the end of the name ("ΒΑΣΙΛ. Ιορδ" keeps, "ΕΛΛΗΝΙΚΗ κ" -> "ΕΛΛΗΝΙΚΗ").
function cleanName(name) {
  const letters = (String(name).match(/\p{L}/gu) || []).join('');
  const upper = (letters.match(/\p{Lu}/gu) || []).length;
  const base = upper >= letters.length * 0.7 ? String(name).toLocaleUpperCase('el-GR') : String(name);
  // OCR often mixes Latin look-alikes into Greek words (ANAΛATO): map them back when the line is Greek.
  const greek = (letters.match(/\p{Script=Greek}/gu) || []).length;
  const fixed = greek >= letters.length * 0.4 ? base.replace(/[ABEHIKMNOPTXYZ]/g, (c) => LOOKALIKE[c]) : base;
  return fixed.replace(/\s+\S$/u, '').replace(/[\s.,:;-]+$/u, '').trim();
}

export function parseReceiptText(text) {
  const rows = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lines = [];
  for (const row of rows) { const item = parseItemLine(row); if (item && item.rawName.length >= 3) lines.push(item); }
  let date = '';
  for (const row of rows) { const m = row.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/); if (m) { date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; break; } }
  let total = 0;
  rows.forEach((row, index) => {
    const p = plain(row);
    if (total || !/ΣΥΝΟΛΟ|TOTAL|ΠΛΗΡΩΤΕΟ/.test(p) || /ΦΠΑ|ΠΟΣΟΤ|ΑΞΙΑ|ΚΑΘ/.test(p)) return;
    const here = row.match(new RegExp(`(${MONEY})\\s*€?\\s*$`)) || (rows[index + 1] || '').match(new RegExp(`^\\s*€?\\s*(${MONEY})\\s*€?\\s*$`));
    if (here) total = amount(here[1]);
  });
  const sum = Math.round(lines.reduce((s, l) => s + l.price, 0) * 100) / 100;
  if (!total) total = sum;
  let issuerName = '';
  for (const row of rows.slice(0, 8)) {
    const letters = (row.match(/\p{L}/gu) || []).join('');
    if (letters.length >= 4 && letters === letters.toLocaleUpperCase('el-GR') && !NOT_STORE.test(plain(row)) && !/\d{4,}/.test(row)) { issuerName = row.replace(/[^\p{L}\p{N}&.\s-]/gu, '').replace(/\s+/g, ' ').trim(); break; }
  }
  return { format: 'photo', issuerName, issuerVat: '', date, series: '', number: '', uid: '', total: Math.round(total * 100) / 100, linesTotal: sum, totalMismatch: lines.length > 0 && Math.abs(sum - total) > 0.05, lines };
}

// ---------- Browser side: preprocessing + OCR ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Δεν ήταν δυνατό να ανοίξει η φωτογραφία.')); };
    img.src = url;
  });
}

// Grayscale + contrast stretch (1st-99th percentile), resized so the long side is ~2200px, rotated by `angle`.
export function preprocess(img, angle = 0) {
  const scale = Math.min(3, 2200 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.round((img.naturalWidth || img.width) * scale); const h = Math.round((img.naturalHeight || img.height) * scale);
  const swap = angle % 180 !== 0;
  const canvas = document.createElement('canvas'); canvas.width = swap ? h : w; canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate((angle * Math.PI) / 180); ctx.drawImage(img, -w / 2, -h / 2, w, h);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height); const px = data.data;
  const hist = new Uint32Array(256); const gray = new Uint8ClampedArray(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) { const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000; gray[j] = g; hist[gray[j]] += 1; }
  const pct = (p) => { let acc = 0; const target = gray.length * p; for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= target) return v; } return 255; };
  const lo = pct(0.01); const hi = Math.max(lo + 1, pct(0.99));
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) { const v = Math.max(0, Math.min(255, ((gray[j] - lo) * 255) / (hi - lo))); px[i] = px[i + 1] = px[i + 2] = v; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(data, 0, 0);
  return canvas;
}

let workerPromise = null;
export async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await import(TESSERACT_URL);
      const createWorker = Tesseract.createWorker || Tesseract.default?.createWorker;
      return createWorker(['ell', 'eng'], 1, { logger: (m) => onProgress?.(m) });
    })().catch((error) => { workerPromise = null; throw error; });
  }
  return workerPromise;
}

const score = (result) => result.parsed.lines.length * 25 + (result.parsed.date ? 10 : 0) + (result.parsed.total ? 5 : 0) + result.confidence / 4;

// OCRs the photo, trying the other orientations when the upright read finds nothing useful.
export async function ocrReceipt(file, { onProgress, recognizeImpl } = {}) {
  const img = await loadImage(file);
  const recognize = recognizeImpl || (async (canvas) => {
    const worker = await getWorker(onProgress);
    const { data } = await worker.recognize(canvas, { rotateAuto: true });
    return { text: data.text, confidence: data.confidence };
  });
  let best = null;
  for (const angle of [0, 90, 270, 180]) {
    onProgress?.({ status: 'orientation', angle });
    const { text, confidence } = await recognize(preprocess(img, angle));
    const result = { angle, text, confidence, parsed: parseReceiptText(text) };
    if (!best || score(result) > score(best)) best = result;
    if (result.parsed.lines.length && confidence >= 60) break;
  }
  return best;
}
