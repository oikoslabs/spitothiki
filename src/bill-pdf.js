// Import a utility bill from a PDF (or photo): text via pdf.js (lazy, SW-cached), OCR fallback via Tesseract.js.
import { findEydapCode, guessBillType, parseBillCode, validRf } from './bills.js';

// v1.9.4: self-hosted pdf.js 6.4.299 (vendor/, fingerprints in vendor/SHA256SUMS).
export const PDFJS_URL = new URL('../vendor/pdfjs-6.4.299/pdf.min.mjs', import.meta.url).href;
export const PDFJS_WORKER_URL = new URL('../vendor/pdfjs-6.4.299/pdf.worker.min.mjs', import.meta.url).href;

export const PROVIDERS = [
  { name: 'ΔΕΗ', type: 'electricity', re: /\bΔΕΗ\b|\bDEI\b|ΔΗΜΟΣΙΑ ΕΠΙΧΕΙΡΗΣΗ ΗΛΕΚΤΡΙΣΜΟΥ|\bPPC\b|MYDEI|DEI\.GR/ },
  { name: 'ΕΥΔΑΠ', type: 'water', re: /ΕΥΔΑΠ|E\.?Y\.?D\.?A\.?P|ΕΤΑΙΡΕΙΑ ΥΔΡΕΥΣΗΣ (ΚΑΙ|&) ΑΠΟΧΕΤΕΥΣΗΣ ΠΡΩΤΕΥΟΥΣ[ΗΑ]Σ|ΛΟΓΑΡΙΑΣΜΟΣ ΥΔΡΕΥΣΗΣ (ΚΑΙ|&) ΑΠΟΧΕΤΕΥΣΗΣ/ },
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
const DUE_LABELS = ['ΛΗΞΗ ΠΡΟΘΕΣΜΙΑΣ ΠΛΗΡΩΜΗΣ', 'ΗΜΕΡΟΜΗΝΙΑ ΛΗΞΗΣ ΠΛΗΡΩΜΗΣ', 'ΗΜΕΡΟΜΗΝΙΑ ΛΗΞΗΣ', 'ΗΜ(?:\\/ΝΙΑ|\\.)? ΛΗΞΗΣ', 'ΛΗΞΗ ΠΡΟΘΕΣΜΙΑΣ', 'ΠΡΟΘΕΣΜΙΑ ΠΛΗΡΩΜΗΣ', 'ΠΡΟΘΕΣΜΙΑ ΕΞΟΦΛΗΣΗΣ', 'ΛΗΞΗ ΠΛΗΡΩΜΗΣ', 'ΕΞΟΦΛΗΣΗ ΕΩΣ', 'ΕΞΟΦΛΗΤΕΟ(?:Σ)? ΕΩΣ', 'ΠΛΗΡΩΤΕΟ(?:Σ)? (?:ΕΩΣ|ΜΕΧΡΙ)', 'ΠΛΗΡΩΜΗ (?:ΕΩΣ|ΜΕΧΡΙ)', 'ΠΛΗΡΩΣΤΕ (?:ΕΩΣ|ΜΕΧΡΙ)', 'ΠΛΗΡΩΜΗΣ ΕΩΣ', 'ΗΜΕΡΟΜΗΝΙΑ ΠΛΗΡΩΜΗΣ', 'ΛΗΞΗ(?!\\s*(ΣΥΜΒ|ΠΡΟΣΦ|ΔΕΣΜ|ΙΣΧΥ|ΠΕΡΙΟΔ|ΚΑΡΤ))', 'PAYMENT DUE', 'DUE DATE', 'PAY BY']
  .map((l) => new RegExp(w(l)));
const DUE_SKIP = /ΕΚΔΟΣΗΣ|ΠΕΡΙΟΔΟΣ|ΣΥΜΒΟΛΑΙ|ΣΥΜΒΑΣ|ΠΡΟΗΓΟΥΜΕΝ|ΕΠΟΜΕΝ/;
const HEADER_WORD = /ΠΟΣΟ|ΣΥΝΟΛ|ΠΛΗΡΩΤΕΟ|ΥΠΟΛΟΙΠ|ΦΠΑ|ΑΞΙΑ|ΧΡΕΩΣ|ΟΦΕΙΛ|ΗΜΕΡΟΜΗΝΙΑ|ΗΜ\.|ΛΗΞΗ|ΕΚΔΟΣ|ΕΩΣ|ΠΡΟΘΕΣΜΙΑ|ΠΕΡΙΟΔ|ΑΡΙΘΜ|ΚΩΔΙΚ|DATE|AMOUNT|TOTAL/;
const DATE_HEADERS = /(?:ΗΜΕΡΟΜΗΝΙΑ|ΗΜ\/ΝΙΑ|ΗΜ\.)\s*[Α-ΩA-Z]+|ΛΗΞΗ\s*[Α-ΩA-Z]*|[Α-Ω]+\s+ΕΩΣ|ΠΡΟΘΕΣΜΙΑ\s*[Α-Ω]*/g;
const MONEY_HEADERS = /(?:ΣΥΝΟΛΙΚΟ\s+|ΤΕΛΙΚΟ\s+)?ΠΟΣΟ(?:\s+ΠΡΟΣ)?\s*[Α-Ω]*|ΣΥΝΟΛ[Α-Ω]*(?:\s+ΠΡΟΣ)?\s*[Α-Ω]*|ΠΛΗΡΩΤΕΟ\s*[Α-Ω]*|ΥΠΟΛΟΙΠ[Α-Ω]*|ΦΠΑ|ΑΞΙΑ\s*[Α-Ω]*|ΟΦΕΙΛ[Α-Ω]*/g;
const ANY_LABEL = (p) => AMOUNT_LABELS.some((re) => re.test(p)) || DUE_LABELS.some((re) => re.test(p));
const PERIOD = /(?:ΠΕΡΙΟΔΟΣ[^\d]{0,30}|ΑΠΟ\s)(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})\s*(?:-|–|ΕΩΣ|ΜΕΧΡΙ|ΩΣ|TO)\s*(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})/;
const INVOICE = /ΑΡΙΘΜΟΣ ΠΑΡΑΣΤΑΤΙΚΟΥ[^\d]{0,16}(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{4})\s*(\d{2})/;

const BARE_PERIOD = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})\s*[-–]\s*(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/;
// No labels in the text (some bills draw them as graphics, e.g. Vodafone Business / SOFTONE): use the payment
// block around the RF code. Amount only if one non-zero amount is repeated there (amount to pay printed twice);
// due date only if exactly one date follows the RF, it isn't a period date and it is later than every other date
// (there must be at least one, e.g. the issue date).
function paymentBlock(lines, reference, period) {
  const r = lines.findIndex((l) => plain(l).replace(/\s+/g, '').includes(reference));
  if (r < 0) return {};
  const win = lines.slice(r, r + 7);
  const counts = new Map();
  for (const l of win) for (const a of findAmounts(l)) if (a.value > 0) counts.set(a.value, (counts.get(a.value) || 0) + 1);
  const repeated = [...counts].filter(([, n]) => n >= 2).map(([v]) => v);
  const skip = new Set([period?.from, period?.to].filter(Boolean));
  const near = [...new Set(win.flatMap((l) => findDates(l).map((d) => d.iso)))].filter((d) => !skip.has(d));
  const others = lines.flatMap((l, i) => (i >= r && i < r + 7 ? [] : findDates(l).map((d) => d.iso))).filter((d) => !skip.has(d));
  const due = near.length === 1 && others.length > 0 && others.every((d) => d < near[0]) ? near[0] : '';
  return { amount: repeated.length === 1 ? repeated[0] : null, due };
}

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

export function isUtilityBill(parsed) {
  return Boolean(parsed && parsed.name && (parsed.amount != null || parsed.due || parsed.reference));
}
export function parseBillText(text) {
  const raw = String(text || '').split(/\r?\n/).map((l) => l.replace(/\t/g, '   ').trim()).filter(Boolean);
  const rows = raw.map((l) => ({ text: l.replace(/\s+/g, ' '), cells: l.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean) }));
  const lines = rows.map((r) => r.text);
  const all = plain(lines.join('\n'));
  let provider = null; let at = Infinity;
  for (const entry of PROVIDERS) { const m = all.match(entry.re); if (m && m.index < at) { provider = entry; at = m.index; } }
  const labeledAmount = findLabeled(rows, AMOUNT_LABELS, AMOUNT_SKIP, amountValues, MONEY_HEADERS);
  const labeledDue = findLabeled(rows, DUE_LABELS, DUE_SKIP, dateValues, DATE_HEADERS);
  const periodMatch = all.match(PERIOD) || lines.map((l) => plain(l).match(BARE_PERIOD)).find(Boolean);
  const rf = findRf(lines.join('\n'));
  const eydap = findEydapCode(text);
  const invoice = all.match(INVOICE);
  const invoiceRef = invoice ? invoice.slice(1).join('') : '';
  const period = periodMatch ? { from: isoDate(periodMatch[1], periodMatch[2], periodMatch[3]), to: isoDate(periodMatch[4], periodMatch[5], periodMatch[6]) } : null;
  const block = (labeledAmount == null || !labeledDue) && rf.reference ? paymentBlock(lines, rf.reference, period) : {};
  if (!provider && eydap) provider = { name: 'ΕΥΔΑΠ', type: 'water' };
  const name = provider?.name || '';
  return {
    name, provider: name, type: provider?.type || (name ? guessBillType(name) : 'other'),
    amount: labeledAmount ?? block.amount ?? eydap?.amount ?? null, due: labeledDue || block.due || eydap?.due || '',
    period,
    reference: rf.reference || invoiceRef || eydap?.reference || '', rfValid: rf.rfValid
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
    if (c.due) { out.due = c.due; out.sources.due = 'code'; }
    if (c.reference && (!out.reference || (c.rfValid && !out.rfValid))) {
      if (c.rfValid || c.kind === 'eydap' || c.kind === 'epc' || c.kind === 'rf' || c.kind === 'barcode') {
        out.reference = c.reference; out.rfValid = Boolean(c.rfValid); out.sources.reference = 'code';
      }
    }
    if (!out.name && c.name) { out.name = c.name; out.provider = c.name; out.type = c.type || guessBillType(c.name); out.sources.name = 'code'; }
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
// Cap PDF/photo canvases so mobile Chrome does not OOM Tesseract (pixdata_malloc fail)
// or freeze the UI. ~2500px long side / 8 MP is enough for OCR and barcodes.
export const MAX_BILL_CANVAS_SIDE = 2500;
export const MAX_BILL_CANVAS_PIXELS = 8_000_000;
export function pdfRenderScale(pageWidth, pageHeight, preferredScale = 3.5) {
  const w = Math.max(1, Number(pageWidth) || 1);
  const h = Math.max(1, Number(pageHeight) || 1);
  const bySide = MAX_BILL_CANVAS_SIDE / Math.max(w, h);
  const byPixels = Math.sqrt(MAX_BILL_CANVAS_PIXELS / (w * h));
  const scale = Math.min(preferredScale, bySide, byPixels);
  return Math.max(0.25, Math.round(scale * 100) / 100);
}
export function fitBillCanvas(source, maxSide = MAX_BILL_CANVAS_SIDE, maxPixels = MAX_BILL_CANVAS_PIXELS) {
  const w = source.width || source.naturalWidth || 0;
  const h = source.height || source.naturalHeight || 0;
  if (!w || !h) return source;
  const scale = Math.min(1, maxSide / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
  if (scale >= 0.99) return source;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function renderPage(doc, n, preferredScale = 2) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = pdfRenderScale(base.width, base.height, preferredScale);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return fitBillCanvas(canvas);
}
async function pageCodes(canvas, decodeImpl) {
  try {
    if (decodeImpl) return await decodeImpl(canvas);
    const { decodeImageCodes } = await import('./barcode.js');
    return await decodeImageCodes(canvas, { mode: 'bill', timeBudgetMs: 2500 });
  } catch { return []; }
}

async function ocrCanvas(canvas, onProgress, recognizeImpl) {
  const input = fitBillCanvas(canvas);
  if (recognizeImpl) return (await recognizeImpl(input)).text || '';
  const { getWorker } = await import('./receipt-photo.js');
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(input, { rotateAuto: true });
  return data?.text || '';
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
    const img = await new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const el = new Image(); el.onload = () => { URL.revokeObjectURL(url); resolve(el); }; el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Δεν ήταν δυνατό να ανοίξει το αρχείο.')); }; el.src = url; });
    onProgress?.({ status: 'ocr' });
    let canvas = fitBillCanvas(preprocess(img));
    let text = '';
    let ocrFailed = false;
    try { text = await withTimeout((async () => ocrCanvas(canvas, onProgress, recognizeImpl))(), ocrTimeoutMs, ''); }
    catch { ocrFailed = true; }
    if (!text) ocrFailed = true;
    const codes = await withTimeout((async () => pageCodes(canvas, decodeImpl))(), codeTimeoutMs, []);
    let parsed = mergeBill(parseBillText(text), [], codes);
    // Same idea as receipt photos: if the upright read missed amount or due, try the other orientations.
    if (parsed.amount == null || !parsed.due) {
      for (const angle of [90, 270, 180]) {
        if (parsed.amount != null && parsed.due) break;
        const rotated = fitBillCanvas(preprocess(img, angle));
        let ocrText = '';
        try { ocrText = await withTimeout((async () => ocrCanvas(rotated, onProgress, recognizeImpl))(), ocrTimeoutMs, ''); }
        catch { ocrText = ''; }
        const moreCodes = await withTimeout((async () => pageCodes(rotated, decodeImpl))(), codeTimeoutMs, []);
        if (ocrText) { text = ocrText; ocrFailed = false; parsed = mergeBill(parsed, [parseBillText(ocrText)], moreCodes); }
        else if (moreCodes.length) parsed = mergeBill(parsed, [], moreCodes);
      }
    }
    if (parsed.amount != null || parsed.due || parsed.name || parsed.reference) ocrFailed = false;
    return { text, source: 'ocr', parsed, ocrFailed };
  }
  onProgress?.({ status: 'pdf' });
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  let text = await pdfText(doc);
  let source = 'pdf';
  // Image-only / CamScanner PDFs often have a short or watermark-only text layer. Those need a
  // higher-resolution render (~250 dpi) so OCR and barcodes can read the page image.
  const scanned = text.replace(/\s/g, '').length < 80 || /CAMSCANNER|SCANNED WITH|SCANNED BY CAM/i.test(text);
  let parsed = mergeBill(parseBillText(text));
  if (!scanned) { try { onParsed?.(parsed, 'text'); } catch {} }
  let canvas = null; let canvasPromise = null;
  const preferredScale = scanned || parsed.amount == null || !parsed.due ? 3.5 : 2;
  const page1 = async () => {
    if (canvas) return canvas;
    if (!canvasPromise) canvasPromise = renderPage(doc, 1, preferredScale).then((c) => { canvas = c; return c; });
    return canvasPromise;
  };
  // QR / barcodes on page 1 (EPC QR carries the amount; EYDAP payment barcodes carry amount + due).
  const codes = await withTimeout((async () => pageCodes(await page1(), decodeImpl))(), codeTimeoutMs, []);
  if (codes.length) { parsed = mergeBill(parsed, [], codes); if (!scanned) { try { onParsed?.(parsed, 'code'); } catch {} } }
  let ocrFailed = false;
  if (scanned || parsed.amount == null || !parsed.due || !parsed.name) {
    // Scanned PDF, or the text layer lacks fields (often printed as an image): OCR page 1 for what's missing.
    onProgress?.({ status: 'ocr' });
    let ocrText = '';
    try { ocrText = await withTimeout((async () => ocrCanvas(await page1(), onProgress, recognizeImpl))(), ocrTimeoutMs, ''); }
    catch { ocrText = ''; }
    if (ocrText) {
      if (scanned) { text = ocrText; source = 'ocr'; parsed = mergeBill(parseBillText(ocrText), [], codes); for (const k of Object.keys(parsed.sources)) if (parsed.sources[k] === 'text') parsed.sources[k] = 'ocr'; }
      else parsed = mergeBill(parsed, [parseBillText(ocrText)]);
    } else if (parsed.amount == null && !parsed.due && !parsed.name) {
      ocrFailed = true;
    }
  }
  return { text, source, parsed, ocrFailed };
}
