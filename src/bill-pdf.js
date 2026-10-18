// Import a utility bill from a PDF (or photo): text via pdf.js (lazy, SW-cached), OCR fallback via Tesseract.js.
import { guessBillType, validRf } from './bills.js';

export const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs';
export const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';

export const PROVIDERS = [
  { name: 'ΔΕΗ', type: 'electricity', re: /\bΔΕΗ\b|\bDEI\b|ΔΗΜΟΣΙΑ ΕΠΙΧΕΙΡΗΣΗ ΗΛΕΚΤΡΙΣΜΟΥ|\bPPC\b|MYDEI|DEI\.GR/ },
  { name: 'ΕΥΔΑΠ', type: 'water', re: /ΕΥΔΑΠ|E\.?Y\.?D\.?A\.?P|ΕΤΑΙΡΕΙΑ ΥΔΡΕΥΣΗΣ (ΚΑΙ|&) ΑΠΟΧΕΤΕΥΣΗΣ ΠΡΩΤΕΥΟΥΣΗΣ/ },
  { name: 'ΕΥΑΘ', type: 'water', re: /ΕΥΑΘ|EYATH|ΥΔΡΕΥΣΗΣ (ΚΑΙ|&) ΑΠΟΧΕΤΕΥΣΗΣ ΘΕΣΣΑΛΟΝΙΚΗΣ/ },
  { name: 'ΔΕΥΑ', type: 'water', re: /Δ\.?Ε\.?Υ\.?Α\.?\s?[Α-Ω]/ },
  { name: 'Cosmote', type: 'phone', re: /COSMOTE|\bΟΤΕ\b|\bOTE\b/ },
  { name: 'Vodafone', type: 'phone', re: /VODAFONE/ },
  { name: 'Nova', type: 'internet', re: /\bNOVA\b|NOVA\.GR/ },
  { name: 'ΖΕΝΙΘ', type: 'electricity', re: /ΖΕΝΙΘ|ZENITH/ },
  { name: 'Protergia', type: 'electricity', re: /PROTERGIA/ },
  { name: 'Ήρων', type: 'electricity', re: /ΗΡΩΝ|HERON/ },
  { name: 'Elpedison', type: 'electricity', re: /ELPEDISON/ },
  { name: 'NRG', type: 'electricity', re: /\bNRG\b/ },
  { name: 'Watt+Volt', type: 'electricity', re: /WATT\s?\+?\s?VOLT/ },
  { name: 'Volton', type: 'electricity', re: /VOLTON/ },
  { name: 'Φυσικό Αέριο', type: 'gas', re: /ΦΥΣΙΚΟ ΑΕΡΙΟ ΕΛΛΗΝΙΚΗ|ΕΠΑ ΑΤΤΙΚΗΣ|ΦΥΣΙΚΟ ΑΕΡΙΟ/ }
];

const plain = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('el-GR');
const MONEY = /(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})(?!\d)/;
const DATE = /(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})(?!\d)/;
const toAmount = (s) => Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
const toDate = (m) => {
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const day = Number(m[1]); const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const AMOUNT_LABELS = /ΣΥΝΟΛΙΚΟ ΠΟΣΟ ΠΛΗΡΩΜΗΣ|ΠΟΣΟ ΠΛΗΡΩΜΗΣ|ΣΥΝΟΛΟ ΠΛΗΡΩΤΕΟ|ΠΛΗΡΩΤΕΟ ΠΟΣΟ|ΠΟΣΟ ΠΡΟΣ ΠΛΗΡΩΜΗ|ΣΥΝΟΛΟ ΠΡΟΣ ΠΛΗΡΩΜΗ|ΣΥΝΟΛΙΚΗ ΟΦΕΙΛΗ|ΣΥΝΟΛΟ ΛΟΓΑΡΙΑΣΜΟΥ|ΠΟΣΟ ΟΦΕΙΛΗΣ|ΤΕΛΙΚΟ ΠΟΣΟ|ΠΛΗΡΩΤΕΟ|AMOUNT DUE|TOTAL DUE|TOTAL TO PAY/;
const DUE_LABELS = /ΛΗΞΗ ΠΡΟΘΕΣΜΙΑΣ ΠΛΗΡΩΜΗΣ|ΗΜΕΡΟΜΗΝΙΑ ΛΗΞΗΣ|ΛΗΞΗ ΠΛΗΡΩΜΗΣ|ΕΞΟΦΛΗΣΗ ΕΩΣ|ΠΛΗΡΩΤΕΟ ΕΩΣ|ΠΛΗΡΩΤΕΟΣ ΕΩΣ|ΠΛΗΡΩΜΗ ΕΩΣ|ΠΛΗΡΩΣΤΕ ΕΩΣ|ΛΗΞΗ|DUE DATE|PAY BY/;
const PERIOD = new RegExp(`(?:ΠΕΡΙΟΔΟΣ[^\\d]{0,30}|ΑΠΟ\\s)${DATE.source}\\s*(?:-|–|ΕΩΣ|ΜΕΧΡΙ|ΩΣ|TO)\\s*${DATE.source}`);

// Value after a label: same line first, then the next two lines.
function afterLabel(lines, labelRe, valueRe) {
  for (let i = 0; i < lines.length; i++) {
    const p = plain(lines[i]);
    const label = p.match(labelRe);
    if (!label) continue;
    const rest = lines[i].slice(label.index + label[0].length);
    const here = rest.match(valueRe);
    if (here) return here;
    for (const next of [lines[i + 1], lines[i + 2]]) { const m = String(next || '').match(valueRe); if (m) return m; }
  }
  return null;
}

export function findRf(text) {
  const candidates = plain(text).match(/RF\s?\d{2}(?:\s?[0-9A-Z]){1,23}/g) || [];
  let fallback = '';
  for (const raw of candidates) {
    const compact = raw.replace(/\s+/g, '');
    for (let len = Math.min(25, compact.length); len >= 5; len--) if (validRf(compact.slice(0, len))) return { reference: compact.slice(0, len), rfValid: true };
    fallback ||= compact.slice(0, 25);
  }
  return fallback ? { reference: fallback, rfValid: false } : { reference: '', rfValid: false };
}

export function parseBillText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const all = plain(lines.join('\n'));
  let provider = null; let at = Infinity;
  for (const entry of PROVIDERS) { const m = all.match(entry.re); if (m && m.index < at) { provider = entry; at = m.index; } }
  const amountMatch = afterLabel(lines, AMOUNT_LABELS, MONEY);
  const dueMatch = afterLabel(lines, DUE_LABELS, DATE);
  const periodMatch = all.match(PERIOD);
  const rf = findRf(lines.join('\n'));
  const name = provider?.name || '';
  return {
    name, provider: name, type: provider?.type || (name ? guessBillType(name) : 'other'),
    amount: amountMatch ? toAmount(amountMatch[1]) : null,
    due: dueMatch ? toDate(dueMatch) : '',
    period: periodMatch ? { from: toDate(periodMatch.slice(0, 4)), to: toDate([null, ...periodMatch.slice(4, 7)]) } : null,
    reference: rf.reference, rfValid: rf.rfValid
  };
}

export const billKey = (bill) => [plain(bill.name).replace(/[^A-ZΑ-Ω0-9]/g, ''), bill.reference ? bill.reference : `${Number(bill.amount || 0).toFixed(2)}`, bill.due || ''].join('|');
export function findDuplicateBill(bills = [], parsed) {
  const key = billKey(parsed);
  return bills.find((bill) => billKey(bill) === key || (parsed.reference && bill.reference === parsed.reference && bill.due === parsed.due)) || null;
}

// ---------- Browser side ----------
let pdfjsPromise = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then((lib) => { lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL; return lib; })
      .catch((error) => { pdfjsPromise = null; throw error; });
  }
  return pdfjsPromise;
}

// Text of the first pages, one line per text row (items grouped by their y position).
async function pdfText(doc, maxPages = 3) {
  const out = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], s: item.str });
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) out.push(rows.get(y).sort((a, b) => a.x - b.x).map((r) => r.s).join(' '));
  }
  return out.join('\n');
}

async function ocrCanvas(canvas, onProgress, recognizeImpl) {
  if (recognizeImpl) return (await recognizeImpl(canvas)).text;
  const { getWorker } = await import('./receipt-photo.js');
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas, { rotateAuto: true });
  return data.text;
}

// File (PDF or image) -> { text, source: 'pdf' | 'ocr', parsed }.
export async function readBillFile(file, { onProgress, recognizeImpl } = {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) {
    const { preprocess } = await import('./receipt-photo.js');
    const img = await new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error('Δεν ήταν δυνατό να ανοίξει το αρχείο.')); el.src = url; });
    onProgress?.({ status: 'ocr' });
    const text = await ocrCanvas(preprocess(img), onProgress, recognizeImpl);
    return { text, source: 'ocr', parsed: parseBillText(text) };
  }
  onProgress?.({ status: 'pdf' });
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  let text = await pdfText(doc);
  let source = 'pdf';
  if (text.replace(/\s/g, '').length < 40) {
    // Scanned PDF: render page 1 and OCR it.
    onProgress?.({ status: 'ocr' });
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
    text = await ocrCanvas(canvas, onProgress, recognizeImpl);
    source = 'ocr';
  }
  return { text, source, parsed: parseBillText(text) };
}
