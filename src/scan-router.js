// «Σκάναρε οτιδήποτε»: decides where a scanned value goes. Pure, so it is unit-tested.
//   receipt  – e-receipt / AADE / fuel-station receipt link (QR)  → receipt flow (fuel receipts are offered to Μετακινήσεις there)
//   toll     – motorway toll receipt barcode (Code 128)            → Μετακινήσεις
//   bill     – EPC payment QR or a payment code (RF)               → new bill
//   product  – retail barcode (EAN/UPC) or GS1 DataMatrix/QR        → pantry or shopping list (user chooses)
//   store-receipt – a shop's own till barcode printed on a receipt (date + till + transaction, e.g. Leroy Merlin):
//              it holds no items and can't be looked up, so the user is told to scan the receipt's QR instead
//   unknown  – anything else: show the raw value with choices
import { parseBillCode } from './bills.js';
import { interpretCode } from './gs1.js';
import { isUrlCode, parseTollBarcode } from './toll-barcode.js';

// Till/transaction barcode printed on retail receipts: digits only, 16–30 long, starting with the issue date YYYYMMDD.
// Real example (Leroy Merlin, Entersoft): 20261024 000021 254205 = 24/10/2026, till 000021, transaction 254205.
// Product codes (≤14 digits) and toll barcodes (35–40 digits) never match.
export function parseStoreReceiptBarcode(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{16,30}$/.test(raw)) return null;
  const y = Number(raw.slice(0, 4)), mo = Number(raw.slice(4, 6)), d = Number(raw.slice(6, 8));
  if (y < 2020 || y > 2035) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { kind: 'store-receipt', date: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`, raw };
}

export function routeCode(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { route: 'unknown', raw };
  if (isUrlCode(raw)) {
    // GS1 Digital Link (https://…/01/<gtin>) is a product, every other link is treated as a receipt.
    const product = interpretCode(raw);
    if (product.kind === 'gs1' && product.barcode) return { route: 'product', raw, barcode: product.barcode, info: product };
    return { route: 'receipt', raw };
  }
  const toll = parseTollBarcode(raw);
  if (toll) return { route: 'toll', raw, toll };
  const till = parseStoreReceiptBarcode(raw);
  if (till) return { route: 'store-receipt', raw, till };
  const bill = parseBillCode(raw);
  if (bill && (bill.kind === 'epc' || bill.kind === 'rf')) return { route: 'bill', raw, bill };
  const product = interpretCode(raw);
  if (product.barcode) return { route: 'product', raw, barcode: product.barcode, info: product };
  return { route: 'unknown', raw };
}
