// Import a utility bill from a PDF (or photo): text via pdf.js (lazy, SW-cached), OCR fallback via Tesseract.js.
import { guessBillType, parseBillCode, validRf } from './bills.js';

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
// Amounts: 1.031,40 · 32,45 · 32.90 — never part of a date such as 05.11.2026.
const MONEY_G = /(?<![\d.,/-])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})(?![\d/-]|[.,]\d)/g;
const NUM_DATE = /(?<!\d)(\d{1,2})\s?([/.-])\s?(\d{1,2})\s?\2\s?(\d{4}|\d{2})(?!\d)/g;
const MONTHS = [/^ΙΑΝ/, /^ΦΕΒ/, /^ΜΑΡ/, /^ΑΠΡ/, /^ΜΑ[ΙΪΗ]/, /^ΙΟΥΝ/, /^ΙΟΥΛ/, /^ΑΥΓ/, /^ΣΕΠ/, /^ΟΚΤ/, /^ΝΟΕ/, /^ΔΕΚ/];
const EN_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WORD_DATE = /(?<!\d)(\d{1,2})\s+([Α-ΩA-Z]{3,12})\.?,?\s+(\d{4})(?!\d)/g;
const toAmount = (s) => Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
const isoDate = (d, m, y) => {
  const year = String(y).length === 2 ? `20${y}` : String(y);
  const day = Number(d); const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31 || Number(year) < 2000 || Number(year) > 2099) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const toDate = (m) => isoDate(m[1], m[2], m[3]);
// All dates in a (plain, uppercase) string, in order: numeric and «5 Νοεμβρίου 2026» / «5 Nov 2026».
export function findDates(text) {
  const p = plain(text); const out = [];
  for (const m of p.matchAll(NUM_DATE)) { const iso = isoDate(m[1], m[3], m[4]); if (iso) out.push({ index: m.index, iso }); }
  for (const m of p.matchAll(WORD_DATE)) {
    let month = MONTHS.findIndex((re) => re.test(m[2])) + 1;
    if (!month) month = EN_MONTHS.findIndex((en) => m[2].startsWith(en)) + 1;
    const iso = month ? isoDate(m[1], month, m[3]) : '';
    if (iso) out.push({ index: m.index, iso });
  }
  return out.sort((a, b) => a.index - b.index);
}
export const findAmounts = (text) => [...String(text || '').matchAll(MONEY_G)].map((m) => ({ index: m.index, value: toAmount(m[1]) }));

// Labels, best first. The "to pay" total beats bill totals/subtotals; the payment deadline beats a bare «Λήξη».
const w = (s) => s.replace(/ /g, '\\s*');
const AMOUNT_LABELS = ['ΣΥΝΟΛΙΚΟ ΠΟΣΟ ΠΛΗΡΩΜΗΣ', 'ΣΥΝΟΛΟ ΠΡΟΣ ΠΛΗΡΩΜΗ', 'ΣΥΝΟΛΙΚΟ ΠΟΣΟ ΠΡΟΣ ΠΛΗΡΩΜΗ', 'ΠΟΣΟ ΠΡΟΣ ΠΛΗΡΩΜΗ', 'ΠΟΣΟ ΠΛΗΡΩΜΗΣ', 'ΠΛΗΡΩΤΕΟ ΠΟΣΟ', 'ΣΥΝΟΛΙΚΟ ΠΛΗΡΩΤΕΟ', 'ΣΥΝΟΛΟ ΠΛΗΡΩΤΕΟ', 'ΤΕΛΙΚΟ ΠΛΗΡΩΤΕΟ', 'ΤΕΛΙΚΟ ΠΟΣΟ', 'ΑΣΦΑΛΙΣΤΡΟ ΠΛΗΡΩΤΕΟ', 'ΠΛΗΡΩΤΕΟ ΑΣΦΑΛΙΣΤΡΟ', 'ΣΥΝΟΛΙΚΗ ΟΦΕΙΛΗ', 'ΣΥΝΟΛΟ ΟΦΕΙΛΗΣ', 'ΠΟΣΟ ΟΦΕΙΛΗΣ', 'ΣΥΝΟΛΟ ΛΟΓΑΡΙΑΣΜΟΥ', 'ΠΟΣΟ ΛΟΓΑΡΙΑΣΜΟΥ', 'ΣΥΝΟΛΙΚΟ ΑΣΦΑΛΙΣΤΡΟ', 'ΣΥΝΟΛΙΚΟ ΠΟΣΟ', 'ΠΛΗΡΩΤΕΟ(?!Σ?\\s*(ΕΩΣ|ΜΕΧΡΙ))', 'AMOUNT TO PAY', 'TOTAL TO PAY', 'TOTAL AMOUNT DUE', 'AMOUNT DUE', 'TOTAL DUE']
  .map((l) => new RegExp(w(l)));
const AMOUNT_SKIP = /ΧΩΡΙΣ|ΠΡΟ\s*ΦΠΑ|ΥΠΟΣΥΝΟΛΟ|ΠΡΟΗΓΟΥΜΕΝ|ΜΕΡΙΚ|ΚΑΘΑΡ|ΕΛΑΧΙΣΤ|ΔΟΣΗ/;
const DUE_LABELS = ['ΛΗΞΗ ΠΡΟΘΕΣΜΙΑΣ ΠΛΗΡΩΜΗΣ', 'ΗΜΕΡΟΜΗΝΙΑ ΛΗΞΗΣ ΠΛΗΡΩΜΗΣ', 'ΗΜΕΡΟΜΗΝΙΑ ΛΗΞΗΣ', 'ΗΜ(?:\\/ΝΙΑ|\\.)? ΛΗΞΗΣ', 'ΛΗΞΗ ΠΡΟΘΕΣΜΙΑΣ', 'ΠΡΟΘΕΣΜΙΑ ΠΛΗΡΩΜΗΣ', 'ΛΗΞΗ ΠΛΗΡΩΜΗΣ', 'ΕΞΟΦΛΗΣΗ ΕΩΣ', 'ΕΞΟΦΛΗΤΕΟ(?:Σ)? ΕΩΣ', 'ΠΛΗΡΩΤΕΟ(?:Σ)? (?:ΕΩΣ|ΜΕΧΡΙ)', 'ΠΛΗΡΩΜΗ (?:ΕΩΣ|ΜΕΧΡΙ)', 'ΠΛΗΡΩΣΤΕ (?:ΕΩΣ|ΜΕΧΡΙ)', 'ΠΛΗΡΩΜΗΣ ΕΩΣ', 'ΗΜΕΡΟΜΗΝΙΑ ΠΛΗΡΩΜΗΣ', 'ΛΗΞΗ(?!\\s*(ΣΥΜΒ|ΠΡΟΣΦ|ΔΕΣΜ|ΙΣΧΥ|ΠΕΡΙΟΔ|ΚΑΡΤ))', 'PAYMENT DUE', 'DUE DATE', 'PAY BY']
  .map((l) => new RegExp(w(l)));
const DUE_SKIP = /ΕΚΔΟΣΗΣ|ΠΕΡΙΟΔΟΣ|ΣΥΜΒΟΛΑΙ|ΣΥΜΒΑΣ|ΠΡΟΗΓΟΥΜΕΝ|ΕΠΟΜΕΝ/;
const HEADER_WORD = /ΠΟΣΟ|ΣΥΝΟΛ|ΠΛΗΡΩΤΕΟ|ΥΠΟΛΟΙΠ|ΦΠΑ|ΑΞΙΑ|ΧΡΕΩΣ|ΟΦΕΙΛ|ΗΜΕΡΟΜΗΝΙΑ|ΗΜ\.|ΛΗΞΗ|ΕΚΔΟΣ|ΕΩΣ|ΠΡΟΘΕΣΜΙΑ|ΠΕΡΙΟΔ|ΑΡΙΘΜ|ΚΩΔΙΚ|DATE|AMOUNT|TOTAL/;
const DATE_HEADERS = /(?:ΗΜΕΡΟΜΗΝΙΑ|ΗΜ\/ΝΙΑ|ΗΜ\.)\s*[Α-ΩA-Z]+|ΛΗΞΗ\s*[Α-ΩA-Z]*|[Α-Ω]+\s+ΕΩΣ|ΠΡΟΘΕΣΜΙΑ\s*[Α-Ω]*/g;
const MONEY_HEADERS = /(?:ΣΥΝΟΛΙΚΟ\s+|ΤΕΛΙΚΟ\s+)?ΠΟΣΟ(?:\s+ΠΡΟΣ)?\s*[Α-Ω]*|ΣΥΝΟΛ[Α-Ω]*(?:\s+ΠΡΟΣ)?\s*[Α-Ω]*|ΠΛΗΡΩΤΕΟ\s*[Α-Ω]*|ΥΠΟΛΟΙΠ[Α-Ω]*|ΦΠΑ|ΑΞΙΑ\s*[Α-Ω]*|ΟΦΕΙΛ[Α-Ω]*/g;
const ANY_LABEL = (p) => AMOUNT_LABELS.some((re) => re.test(p)) || DUE_LABELS.some((re) => re.test(p));
const PERIOD = /(?:ΠΕΡΙΟΔΟΣ[^\d]{0,30}|ΑΠΟ\s)(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})\s*(?:-|–|ΕΩΣ|ΜΕΧΡΙ|ΩΣ|TO)\s*(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})/;

// Label → value: same cell/line after the label, else the same column (cells split by 2+ spaces) or
// the only value in the next two lines; header rows with several columns are matched by position.
function findLabeled(rows, labels, skip, values, kindHeaders) {
  let best = null;
  rows.forEach((row, i) => {
    row.cells.forEach((cell, c) => {
      const p = plain(cell);
      const rank = labels.findIndex((re) => re.test(p));
      if (rank < 0 || (best && best.rank <= rank)) return;
      const m = p.match(labels[rank]);
      const prevWord = skip === AMOUNT_SKIP ? (p.slice(0, m.index).match(/(\S+)\s*$/) || [])[1] || '' : '';
      if (skip.test(`${prevWord} ${p.slice(m.index, m.index + m[0].length + 12)}`)) return;
      let value = values(cell.slice(m.index + m[0].length))[0]?.v;
      if (value == null) for (const cc of row.cells.slice(c + 1)) { const v = values(cc); if (v.length) { if (!ANY_LABEL(plain(cc))) value = v[0].v; break; } if (HEADER_WORD.test(plain(cc))) break; }
      if (value == null) for (const next of rows.slice(i + 1, i + 3)) {
        if (next.cells.length > 1 && next.cells.length === row.cells.length) { const v = values(next.cells[c]); if (v.length) { value = v[0].v; break; } }
        const all = values(next.text);
        if (all.length === 1 && !ANY_LABEL(plain(next.text).slice(0, all[0].index))) { value = all[0].v; break; }
        if (all.length > 1) { // header row with several columns, single-spaced: k-th header ↔ k-th value
          const headers = row.cells.length > 1 ? row.cells.filter((h) => HEADER_WORD.test(plain(h))) : [];
          const k = headers.indexOf(cell);
          if (k >= 0 && headers.length === all.length) { value = all[k].v; break; }
          if (row.cells.length === 1) { // single-spaced (OCR): count headers of this value kind before the label
            const hs = [...p.matchAll(kindHeaders)];
            const pos = hs.findIndex((h) => h.index <= m.index && m.index < h.index + h[0].length + 1);
            if (pos >= 0 && hs.length === all.length) { value = all[pos].v; break; }
          }
          if (!ANY_LABEL(plain(next.text).slice(0, all[0].index))) { value = all[0].v; break; }
        }
        if (ANY_LABEL(plain(next.text))) break;
      }
      if (value != null) best = { rank, value };
    });
  });
  return best?.value ?? null;
}
const amountValues = (s) => findAmounts(s).map((a) => ({ index: a.index, v: a.value }));
const dateValues = (s) => findDates(s).map((d) => ({ index: d.index, v: d.iso }));

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
  const raw = String(text || '').split(/\r?\n/).map((l) => l.replace(/\t/g, '   ').trim()).filter(Boolean);
  const rows = raw.map((l) => ({ text: l.replace(/\s+/g, ' '), cells: l.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean) }));
  const lines = rows.map((r) => r.text);
  const all = plain(lines.join('\n'));
  let provider = null; let at = Infinity;
  for (const entry of PROVIDERS) { const m = all.match(entry.re); if (m && m.index < at) { provider = entry; at = m.index; } }
  const amount = findLabeled(rows, AMOUNT_LABELS, AMOUNT_SKIP, amountValues, MONEY_HEADERS);
  const due = findLabeled(rows, DUE_LABELS, DUE_SKIP, dateValues, DATE_HEADERS);
  const periodMatch = all.match(PERIOD);
  const rf = findRf(lines.join('\n'));
  const name = provider?.name || '';
  return {
    name, provider: name, type: provider?.type || (name ? guessBillType(name) : 'other'),
    amount, due: due || '',
    period: periodMatch ? { from: isoDate(periodMatch[1], periodMatch[2], periodMatch[3]), to: isoDate(periodMatch[4], periodMatch[5], periodMatch[6]) } : null,
    reference: rf.reference, rfValid: rf.rfValid
  };
}

// Codes found on the bill (EPC/SEPA QR, RF barcodes) win over text for the amount and a valid RF;
// text fills the rest; a later source (OCR) only fills what is still missing. `sources` says where each came from.
export function mergeBill(base, extra = [], codes = []) {
  const out = { ...base, sources: { ...(base.sources || {}) } };
  for (const k of ['name', 'amount', 'due', 'reference']) if (out[k] != null && out[k] !== '' && !out.sources[k]) out.sources[k] = 'text';
  for (const raw of codes) {
    const c = parseBillCode(raw);
    if (!c) continue;
    if (c.amount != null && c.amount > 0) { out.amount = c.amount; out.sources.amount = 'code'; }
    if (c.rfValid && (!out.rfValid || !out.reference)) { out.reference = c.reference; out.rfValid = true; out.sources.reference = 'code'; }
    if (c.due) { out.due = c.due; out.sources.due = 'code'; }
  }
  for (const e of extra) {
    if (!e) continue;
    if (!out.name && e.name) { out.name = e.name; out.provider = e.name; out.type = e.type; out.sources.name = 'ocr'; }
    if (out.amount == null && e.amount != null) { out.amount = e.amount; out.sources.amount = 'ocr'; }
    if (!out.due && e.due) { out.due = e.due; out.sources.due = 'ocr'; }
    if (!out.reference && e.reference) { out.reference = e.reference; out.rfValid = e.rfValid; out.sources.reference = 'ocr'; }
    if (!out.period && e.period) out.period = e.period;
  }
  return out;
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

// Text of the first pages, one line per text row. Items are grouped by baseline with a tolerance
// (pdf.js often splits a label and its value into items a point or two apart) and a wide horizontal gap
// becomes "   " so columns survive as cells.
export function itemsToLines(items) {
  const list = items.filter((it) => it.str?.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.height || it.transform[3] || 10), s: it.str }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of list) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, Math.min(r.h, it.h) * 0.45));
    if (row) row.items.push(it); else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => {
    const items = r.items.sort((a, b) => a.x - b.x);
    let line = ''; let end = null;
    for (const it of items) {
      const gap = end == null ? 0 : it.x - end;
      line += end == null ? it.s : gap > it.h * 1.2 ? `   ${it.s}` : gap > it.h * 0.15 || !/\S$/.test(line) ? ` ${it.s}` : it.s;
      end = it.x + it.w;
    }
    return line.trim();
  });
}
async function pdfText(doc, maxPages = 3) {
  const out = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n);
    out.push(...itemsToLines((await page.getTextContent()).items));
  }
  return out.join('\n');
}
async function renderPage(doc, n, scale) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
  return canvas;
}
async function pageCodes(canvas, decodeImpl) {
  try {
    if (decodeImpl) return await decodeImpl(canvas);
    const { decodeImageCodes } = await import('./barcode.js');
    return await decodeImageCodes(canvas, { mode: 'bill', timeBudgetMs: 2500 });
  } catch { return []; }
}

async function ocrCanvas(canvas, onProgress, recognizeImpl) {
  if (recognizeImpl) return (await recognizeImpl(canvas)).text;
  const { getWorker } = await import('./receipt-photo.js');
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas, { rotateAuto: true });
  return data.text;
}

// File (PDF or image) -> { text, source: 'pdf' | 'ocr', parsed } with parsed.sources = { amount: 'code'|'text'|'ocr', … }.
// Never guesses: what isn't found stays empty for manual entry.
export const withTimeout = (promise, ms, fallback) => Promise.race([Promise.resolve(promise).catch(() => fallback), new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
// onParsed(parsed, stage) is called as soon as the text is parsed ('text'), then again if QR/OCR add anything.
// QR and OCR are best effort with their own timeouts: a failure or hang there never loses the text fields.
export async function readBillFile(file, { onProgress, onParsed, recognizeImpl, decodeImpl, codeTimeoutMs = 8000, ocrTimeoutMs = 60000 } = {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (!isPdf) {
    const { preprocess } = await import('./receipt-photo.js');
    const img = await new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error('Δεν ήταν δυνατό να ανοίξει το αρχείο.')); el.src = url; });
    onProgress?.({ status: 'ocr' });
    const text = await ocrCanvas(preprocess(img), onProgress, recognizeImpl);
    const parsed = mergeBill(parseBillText(text));
    return { text, source: 'ocr', parsed };
  }
  onProgress?.({ status: 'pdf' });
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  let text = await pdfText(doc);
  let source = 'pdf';
  const scanned = text.replace(/\s/g, '').length < 40;
  let parsed = mergeBill(parseBillText(text));
  if (!scanned) { try { onParsed?.(parsed, 'text'); } catch {} }
  let canvas = null;
  const page1 = async () => (canvas ||= await renderPage(doc, 1, 2));
  // QR / barcodes on page 1 (EPC QR carries the amount).
  const codes = await withTimeout((async () => pageCodes(await page1(), decodeImpl))(), codeTimeoutMs, []);
  if (codes.length) { parsed = mergeBill(parsed, [], codes); if (!scanned) { try { onParsed?.(parsed, 'code'); } catch {} } }
  if (scanned || parsed.amount == null || !parsed.due) {
    // Scanned PDF, or the text layer lacks amount/due (often printed as an image): OCR page 1 for what's missing.
    onProgress?.({ status: 'ocr' });
    const ocrText = await withTimeout((async () => ocrCanvas(await page1(), onProgress, recognizeImpl))(), ocrTimeoutMs, '');
    if (ocrText) {
      if (scanned) { text = ocrText; source = 'ocr'; parsed = mergeBill(parseBillText(ocrText), [], codes); for (const k of Object.keys(parsed.sources)) if (parsed.sources[k] === 'text') parsed.sources[k] = 'ocr'; }
      else parsed = mergeBill(parsed, [parseBillText(ocrText)]);
    }
  }
  return { text, source, parsed };
}
