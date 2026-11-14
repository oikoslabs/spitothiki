import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadTtf } from '../src/pdf-doc.js';
import { buildReceiptPdf, createReceiptPdf, periodBoundsForMonth, receiptExportSummary, receiptPdfFilename, receiptsInRange, RECEIPT_PDF_EN, resetPdfFont } from '../src/receipt-pdf.js';
import { dictionaries } from '../src/i18n.js';

const font = loadTtf(readFileSync(new URL('../fonts/pdf-sans-el.ttf', import.meta.url)));
const receipts = [
  { id: 'r1', date: '2026-11-05', store: 'Σκλαβενίτης', total: 38.4, items: [{ name: 'Γάλα', price: 1.2, quantity: 2 }, { name: 'Ψωμί', price: 1.1 }], category: 'Αγορές' },
  { id: 'r2', date: '2026-11-12', store: 'Lidl', total: 22, items: [], format: 'manual' },
  { id: 'r3', date: '2026-10-02', store: 'Μασούτης', total: 15, items: [{ name: 'Ντομάτες', price: 15 }] }
];

test('range filter, month bounds and filename', () => {
  assert.deepEqual(periodBoundsForMonth('2026-11'), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(periodBoundsForMonth('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(receiptsInRange(receipts, '2026-11-01', '2026-11-30').length, 2);
  assert.equal(receiptsInRange(receipts, '2026-11-12', '2026-11-12').map((r) => r.id).join(), 'r2');
  assert.deepEqual(receiptsInRange(receipts, '2026-12-01', '2026-12-31'), []);
  assert.equal(receiptPdfFilename('2026-11-01', '2026-11-30'), 'spitothiki-apodeixeis-2026-11.pdf');
  assert.equal(receiptPdfFilename('2026-11-01', '2026-11-12'), 'spitothiki-apodeixeis-2026-11-01-2026-11-12.pdf');
});

test('summary lists totals and item details, no network', () => {
  const s = receiptExportSummary(receipts, '2026-11-01', '2026-11-30');
  assert.equal(s.count, 2);
  assert.equal(s.total, 60.4);
  assert.equal(s.rows[0].store, 'Lidl'); // newest first
  assert.equal(s.rows[1].items.length, 2);
  assert.doesNotMatch(readFileSync(new URL('../src/pdf-doc.js', import.meta.url), 'utf8'), /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.doesNotMatch(readFileSync(new URL('../src/receipt-pdf.js', import.meta.url), 'utf8'), /XMLHttpRequest|sendBeacon/);
});

test('generated PDF is valid, has Greek text, list, totals and items', () => {
  const summary = receiptExportSummary(receipts, '2026-11-01', '2026-11-30');
  const bytes = buildReceiptPdf(summary, font, { locale: 'el-GR' });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  assert.match(Buffer.from(bytes.subarray(bytes.length - 8)).toString(), /%%EOF/);
  const tmp = '/tmp/spitothiki-receipt-export-test.pdf';
  writeFileSync(tmp, bytes);
  const text = execFileSync('pdftotext', ['-layout', tmp, '-'], { encoding: 'utf8' });
  try { unlinkSync(tmp); } catch {}
  assert.match(text, /Σπιτοθήκη/);
  assert.match(text, /Αποδείξεις/);
  assert.match(text, /Σκλαβενίτης/);
  assert.match(text, /Γάλα/);
  assert.match(text, /Lidl/);
  assert.match(text, /2 αποδείξεις/);
  assert.match(text, /δεν στάλθηκε πουθενά/);
  assert.doesNotMatch(text, /Μασούτης/); // outside the period
});

test('createReceiptPdf accepts a provided font and returns a filename', async () => {
  resetPdfFont();
  const { summary, filename, bytes } = await createReceiptPdf({ receipts, purchases: [] }, '2026-11-01', '2026-11-12', { font });
  assert.equal(summary.count, 2);
  assert.equal(filename, 'spitothiki-apodeixeis-2026-11-01-2026-11-12.pdf');
  assert.ok(bytes.length > 1000);
});

test('receipts screen, dialog, English strings, SW cache and font are wired', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(app, /data-action="receipts-export"/);
  assert.match(app, /function openReceiptExport/);
  assert.match(app, /createReceiptPdf/);
  assert.match(html, /id="receipt-export-dialog"/);
  assert.match(html, /Εξαγωγή αποδείξεων σε PDF/);
  assert.match(sw, /CACHE_VERSION = 'v138'/);
  assert.match(sw, /month-insights\.js/);
  assert.match(sw, /receipt-pdf\.js/);
  assert.match(sw, /pdf-doc\.js/);
  assert.match(sw, /pdf-sans-el\.ttf/);
  for (const [el, en] of Object.entries(RECEIPT_PDF_EN)) {
    assert.ok(String(en).trim(), el);
    assert.equal(dictionaries.en[el], en);
  }
});
