// «Σκάναρε οτιδήποτε»: decides where a scanned value goes. Pure, so it is unit-tested.
//   receipt  – e-receipt / AADE / fuel-station receipt link (QR)  → receipt flow (fuel receipts are offered to Μετακινήσεις there)
//   toll     – motorway toll receipt barcode (Code 128)            → Μετακινήσεις
//   bill     – EPC payment QR or a payment code (RF)               → new bill
//   product  – retail barcode (EAN/UPC) or GS1 DataMatrix/QR        → pantry or shopping list (user chooses)
//   unknown  – anything else: show the raw value with choices
import { parseBillCode } from './bills.js';
import { interpretCode } from './gs1.js';
import { isUrlCode, parseTollBarcode } from './toll-barcode.js';

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
  const bill = parseBillCode(raw);
  if (bill && (bill.kind === 'epc' || bill.kind === 'rf')) return { route: 'bill', raw, bill };
  const product = interpretCode(raw);
  if (product.barcode) return { route: 'product', raw, barcode: product.barcode, info: product };
  return { route: 'unknown', raw };
}
