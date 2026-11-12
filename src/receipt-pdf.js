// Export saved receipts for a chosen period as one PDF, generated entirely on the device.
// No new service, no upload. Receipt photos are not stored by the app, so the PDF has
// the list, totals and item details (and a JPEG only if a receipt happens to carry one).
import { listReceipts, receiptCategory, receiptItems } from './receipts.js';
import { A4, loadTtf, wrapText, writePdf } from './pdf-doc.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const PDF_FONT_URL = new URL('../fonts/pdf-sans-el.ttf', import.meta.url).href;

export const RECEIPT_PDF_EN = {
  'Εξαγωγή PDF': 'Export PDF',
  'Εξαγωγή αποδείξεων σε PDF': 'Export receipts as PDF',
  'Διάλεξε έναν μήνα ή δικές σου ημερομηνίες. Το PDF φτιάχνεται στο κινητό σου και δεν στέλνεται πουθενά.': 'Pick a month or your own dates. The PDF is made on your phone and is not sent anywhere.',
  'Μήνας': 'Month',
  'Δικές μου ημερομηνίες': 'My own dates',
  'Από': 'From',
  'Έως': 'To',
  'Λήψη PDF': 'Download PDF',
  'Δημιουργία PDF…': 'Creating PDF…',
  'Δεν υπάρχουν αποδείξεις σε αυτή την περίοδο.': 'There are no receipts in this period.',
  'Το PDF αποθηκεύτηκε.': 'The PDF was saved.',
  'Δεν μπόρεσα να φτιάξω το PDF. Δοκίμασε ξανά.': 'I couldn’t create the PDF. Try again.',
  'Οι φωτογραφίες αποδείξεων δεν φυλάγονται στην εφαρμογή, οπότε το PDF έχει τα στοιχεία και τα είδη, όχι φωτογραφίες.': 'Receipt photos are not kept in the app, so the PDF has the details and the items, not photos.',
  'Αποδείξεις': 'Receipts',
  '{count} αποδείξεις · σύνολο {total}': '{count} receipts · total {total}',
  '1 απόδειξη · σύνολο {total}': '1 receipt · total {total}',
  'Δημιουργήθηκε στη συσκευή σου · δεν στάλθηκε πουθενά': 'Created on your device · not sent anywhere',
  'Σελίδα {page} από {pages}': 'Page {page} of {pages}',
  'Άκυρο': 'Cancel'
};

export function receiptsInRange(receipts = [], from, to) {
  if (!DATE.test(from) || !DATE.test(to) || from > to) return [];
  return listReceipts(receipts, '').filter((r) => {
    const d = String(r.date || '').slice(0, 10);
    return DATE.test(d) && d >= from && d <= to;
  });
}

export function receiptExportSummary(receipts, from, to, purchases = []) {
  const rows = receiptsInRange(receipts, from, to).map((r) => ({
    id: r.id,
    date: r.date,
    store: r.store || '',
    total: Number(r.total) || 0,
    category: receiptCategory(r, purchases),
    items: receiptItems(r, purchases),
    url: r.url || '',
    format: r.format || '',
    image: r.image || r.photo || ''
  }));
  const total = Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100;
  return { from, to, rows, count: rows.length, total };
}

export function receiptPdfFilename(from, to) {
  if (from.slice(0, 7) === to.slice(0, 7) && from.endsWith('-01') && to.slice(8) === new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)).getUTCDate().toString().padStart(2, '0')) {
    return `spitothiki-apodeixeis-${from.slice(0, 7)}.pdf`;
  }
  return `spitothiki-apodeixeis-${from}-${to}.pdf`;
}

export function periodBoundsForMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

let fontPromise;
export function loadPdfFont(fetchImpl = fetch, url = PDF_FONT_URL) {
  if (!fontPromise) {
    fontPromise = Promise.resolve(fetchImpl(url))
      .then((res) => { if (!res?.ok) throw new Error('font'); return res.arrayBuffer(); })
      .then((buf) => loadTtf(buf))
      .catch((err) => { fontPromise = null; throw err; });
  }
  return fontPromise;
}
export const resetPdfFont = () => { fontPromise = null; };

const shortDate = (iso, locale = 'el-GR') => {
  if (!DATE.test(iso)) return iso || '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00`));
};

export function formatPeriodLabel(from, to, locale = 'el-GR') {
  if (from === to) return shortDate(from, locale);
  const a = new Intl.DateTimeFormat(locale, { day: 'numeric', month: from.slice(0, 7) === to.slice(0, 7) ? undefined : 'short', year: from.slice(0, 4) === to.slice(0, 4) ? undefined : 'numeric' }).format(new Date(`${from}T00:00:00`));
  const b = shortDate(to, locale);
  return `${a} – ${b}`;
}

function moneyEl(n, locale = 'el-GR') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n || 0);
}

// Build the PDF bytes. `t` translates UI strings; `money` / `formatDate` / `categoryLabel` are display helpers.
export function buildReceiptPdf(summary, font, {
  t = (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => p?.[k] ?? ''),
  money = (n) => moneyEl(n),
  formatDate = (d) => shortDate(d),
  categoryLabel = (s) => s,
  locale = 'el-GR',
  createdOn = ''
} = {}) {
  const margin = 48;
  const width = A4.width;
  const height = A4.height;
  const maxW = width - margin * 2;
  const pages = [];
  let ops = [];
  let y = 0;

  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = height - 50;
  };
  const need = (h) => { if (y - h < 56) newPage(); };
  const text = (x, size, str, nextY) => { ops.push({ type: 'text', x, y: nextY ?? y, size, text: String(str) }); };
  const line = (yPos) => { ops.push({ type: 'line', x1: margin, y1: yPos, x2: width - margin, y2: yPos }); };

  newPage();
  text(margin, 16, 'Σπιτοθήκη');
  y -= 22;
  text(margin, 13, t('Αποδείξεις'));
  y -= 18;
  text(margin, 10, formatPeriodLabel(summary.from, summary.to, locale));
  y -= 16;
  const countLine = summary.count === 1
    ? t('1 απόδειξη · σύνολο {total}', { total: money(summary.total) })
    : t('{count} αποδείξεις · σύνολο {total}', { count: summary.count, total: money(summary.total) });
  text(margin, 10, countLine);
  y -= 10;
  line(y);
  y -= 18;

  if (!summary.rows.length) {
    text(margin, 11, t('Δεν υπάρχουν αποδείξεις σε αυτή την περίοδο.'));
    y -= 16;
  }

  for (const row of summary.rows) {
    const items = Array.isArray(row.items) ? row.items.filter((it) => it && it.name) : [];
    const headerH = 28;
    const itemH = items.length ? items.length * 13 + 4 : 16;
    need(headerH + Math.min(itemH, 40));
    const shop = row.store || t('Απόδειξη');
    const left = `${formatDate(row.date)}  ${shop}`;
    const amount = money(row.total);
    const amountW = font.widthOf(amount, 11);
    text(margin, 11, left);
    text(width - margin - amountW, 11, amount, y);
    y -= 14;
    const cat = categoryLabel(row.category);
    if (cat) { text(margin, 9, cat); y -= 12; }
    if (items.length) {
      for (const it of items) {
        const name = `${it.name}${it.quantity && it.quantity !== 1 ? ` ×${it.quantity}` : ''}`;
        const price = it.price ? money(it.price) : '';
        const lines = wrapText(font, `• ${name}`, 9, maxW - (price ? 70 : 0));
        for (let i = 0; i < lines.length; i++) {
          need(13);
          text(margin, 9, lines[i]);
          if (i === 0 && price) {
            const pw = font.widthOf(price, 9);
            text(width - margin - pw, 9, price, y);
          }
          y -= 12;
        }
      }
    } else {
      text(margin, 9, t('Χωρίς αναλυτικά είδη.'));
      y -= 12;
    }
    y -= 8;
    line(y);
    y -= 14;
  }

  // Footer with page numbers on every page (added after we know the count).
  if (ops.length) pages.push(ops);
  const totalPages = pages.length || 1;
  const footer = createdOn || '';
  const out = pages.map((pageOps, idx) => {
    const copy = pageOps.slice();
    copy.push({ type: 'text', x: margin, y: 32, size: 8, text: t('Δημιουργήθηκε στη συσκευή σου · δεν στάλθηκε πουθενά') });
    if (footer) copy.push({ type: 'text', x: margin, y: 20, size: 8, text: footer });
    const label = t('Σελίδα {page} από {pages}', { page: idx + 1, pages: totalPages });
    const lw = font.widthOf(label, 8);
    copy.push({ type: 'text', x: width - margin - lw, y: 32, size: 8, text: label });
    return copy;
  });
  return writePdf(font, out, { title: `Σπιτοθήκη — ${t('Αποδείξεις')} ${formatPeriodLabel(summary.from, summary.to, locale)}`, author: 'Spitothiki' });
}

export async function createReceiptPdf(state, from, to, opts = {}) {
  const summary = receiptExportSummary(state.receipts || [], from, to, state.purchases || []);
  const font = opts.font || await loadPdfFont(opts.fetch, opts.fontUrl);
  return { summary, filename: receiptPdfFilename(from, to), bytes: buildReceiptPdf(summary, font, opts) };
}
