// Greek e-receipts (ηλεκτρονικές αποδείξεις): the QR on the receipt points to the e-invoicing provider's page.
// Appending /myDATA gives the AADE InvoicesDoc XML with the item lines; /EN16931 gives a UBL invoice.
import { normalizeSearch } from './domain.js';
import { matchIngredient } from './recipes.js';

// ---------- Minimal namespace-agnostic XML tree ----------
// Node: { name (local name), children: Node[], text }. Uses DOMParser in the browser, a tiny parser elsewhere (tests).
function fromDom(el) {
  const children = Array.from(el.children || []).map(fromDom);
  return { name: el.localName, children, text: children.length ? '' : (el.textContent || '').trim(), unitCode: el.getAttribute?.('unitCode') || '' };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m));

function miniParse(xml) {
  const root = { name: '#root', children: [], text: '' };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[3]) {
      const name = m[3].includes(':') ? m[3].split(':').pop() : m[3];
      if (m[2]) { if (stack.length > 1) stack.pop(); }
      else { const node = { name, children: [], text: '', unitCode: (m[4].match(/unitCode="([^"]*)"/) || [])[1] || '' }; top.children.push(node); if (!m[5]) stack.push(node); }
    } else if (m[6] !== undefined) top.text += decode(m[6]);
  }
  const clean = (n) => { n.text = n.children.length ? '' : n.text.trim(); n.children.forEach(clean); return n; };
  return clean(root).children[0] || null;
}

export function parseXml(xml) {
  const text = String(xml || '');
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    return doc.documentElement ? fromDom(doc.documentElement) : null;
  }
  return miniParse(text);
}

const kids = (node, name) => (node?.children || []).filter((c) => c.name === name);
const kid = (node, name) => kids(node, name)[0] || null;
const path = (node, ...names) => names.reduce((n, name) => kid(n, name), node);
const val = (node, ...names) => path(node, ...names)?.text || '';
const num = (value) => { const n = Number(String(value).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Units ----------
// AADE myDATA measurementUnit: 1 pieces, 2 kg, 3 litres, 4 metres, 5 m², 6 m³, 7 other pieces.
const AADE_UNITS = { 1: 'τεμ.', 2: 'κιλά', 3: 'λίτρα', 7: 'τεμ.' };
// UN/ECE Rec 20 codes used by EN16931 / UBL.
const UBL_UNITS = { KGM: 'κιλά', GRM: 'γραμμάρια', LTR: 'λίτρα', H87: 'τεμ.', C62: 'τεμ.', EA: 'τεμ.', XPK: 'πακέτα', PK: 'πακέτα' };

// ---------- Category guess from the (usually upper-case, abbreviated) receipt description ----------
const CATEGORY_WORDS = [
  ['Γαλακτοκομικά', ['γαλα', 'γιαουρτ', 'τυρι', 'φετα', 'κασερ', 'γραβιερ', 'πεκοριν', 'ανθοτυρ', 'μυζηθρ', 'γκουντα', 'εμενταλ', 'βουτυρ', 'κρεμα γαλ', 'milk', 'yog', 'cheese']],
  ['Κρέας & ψάρι', ['κοτοπ', 'κιμα', 'μοσχ', 'χοιριν', 'αρνι', 'γαλοπουλ', 'ζαμπον', 'μπεικον', 'λουκανικ', 'ψαρι', 'σολομ', 'τονο', 'γαρ', 'καλαμαρ', 'chicken', 'beef', 'pork', 'ham']],
  ['Φρούτα & λαχανικά', ['μηλα', 'μπαναν', 'πορτοκαλ', 'λεμον', 'ντοματ', 'πατατ', 'κρεμμυδ', 'καροτ', 'αγγουρ', 'μαρουλ', 'σαλατ', 'φρουτ', 'σταφυλ', 'πιπερι', 'κολοκυθ']],
  ['Κατεψυγμένα', ['κατεψ', 'frozen', 'αρακα', 'παγωτ']],
  ['Ροφήματα', ['καφε', 'τσαι', 'χυμο', 'νερο', 'μπυρ', 'κρασι', 'αναψυκτ', 'cola', 'coffee', 'juice', 'σοδα']],
  ['Καθαριότητα', ['απορρυπ', 'σαπουν', 'χαρτι', 'χαρτοπετσ', 'καθαρισ', 'λευκαντ', 'σφουγγ', 'σακουλ', 'μαλακτ', 'οδοντ', 'σαμπουαν']],
  ['Ξηρά τρόφιμα', ['αλευρ', 'ρυζι', 'μακαρον', 'ζυμαρικ', 'ψωμι', 'αρτοσ', 'αρτ/σ', 'φρυγαν', 'ζαχαρ', 'αλατι', 'λαδι', 'ελαιολ', 'φακ', 'φασολ', 'ρεβιθ', 'δημητρ', 'μπισκοτ', 'κρακερ', 'μελι', 'σοκολατ', 'ελιε', 'κονσερ']]
];

export function guessCategory(name) {
  const text = normalizeSearch(name);
  for (const [category, words] of CATEGORY_WORDS) if (words.some((w) => text.includes(w))) return category;
  const ingredient = matchIngredient(name);
  return ingredient ? ({ milk: 'Γαλακτοκομικά', eggs: 'Γαλακτοκομικά', rice: 'Ξηρά τρόφιμα', pasta: 'Ξηρά τρόφιμα' }[ingredient] || 'Άλλο') : 'Άλλο';
}

// Turns "ΑΥΓΑ ΤΣΑΟΥΣΗ ΒΙΟΛΟΓΙΚΑ" into "Αυγα τσαουση βιολογικα" (sentence case, keeps it editable).
export function tidyName(name) {
  const clean = String(name || '').replace(/\s+/g, ' ').replace(/\.+$/, '').trim();
  if (!clean) return '';
  if (clean !== clean.toLocaleUpperCase('el-GR')) return clean;
  const lower = clean.toLocaleLowerCase('el-GR').replace(/σ(?=\s|$|[^\p{L}])/gu, 'ς');
  return lower.charAt(0).toLocaleUpperCase('el-GR') + lower.slice(1);
}

function makeLine({ name, quantity, unit, price }) {
  const qty = quantity > 0 ? quantity : 1;
  return { name: tidyName(name), rawName: String(name || '').trim(), quantity: Math.round(qty * 1000) / 1000, unit, price: round2(price), category: guessCategory(name) };
}

// ---------- myDATA (AADE InvoicesDoc) ----------
export function parseMyData(xml) {
  const root = parseXml(xml);
  if (!root) return null;
  const invoice = root.name === 'invoice' ? root : kid(root, 'invoice');
  if (!invoice) return null;
  const header = kid(invoice, 'invoiceHeader');
  const lines = kids(invoice, 'invoiceDetails').map((line) => makeLine({
    name: val(line, 'itemDescr'), quantity: num(val(line, 'quantity')), unit: AADE_UNITS[val(line, 'measurementUnit')] || 'τεμ.',
    price: num(val(line, 'netValue')) + num(val(line, 'vatAmount'))
  })).filter((line) => line.rawName);
  const summary = kid(invoice, 'invoiceSummary');
  const total = summary ? num(val(summary, 'totalGrossValue')) || num(val(summary, 'totalNetValue')) + num(val(summary, 'totalVatAmount')) : lines.reduce((s, l) => s + l.price, 0);
  return {
    format: 'myDATA',
    issuerVat: val(invoice, 'issuer', 'vatNumber'), issuerName: '',
    date: val(header, 'issueDate').slice(0, 10), series: val(header, 'series'), number: val(header, 'aa'),
    uid: val(invoice, 'uid') || val(invoice, 'mark'), total: round2(total), lines
  };
}

// ---------- EN16931 (UBL Invoice) ----------
export function parseUbl(xml) {
  const root = parseXml(xml);
  if (!root || root.name !== 'Invoice') return null;
  const lines = kids(root, 'InvoiceLine').map((line) => {
    const qtyNode = kid(line, 'InvoicedQuantity');
    const net = num(val(line, 'LineExtensionAmount'));
    const percent = num(val(line, 'Item', 'ClassifiedTaxCategory', 'Percent'));
    return makeLine({ name: val(line, 'Item', 'Name'), quantity: num(qtyNode?.text), unit: UBL_UNITS[qtyNode?.unitCode] || 'τεμ.', price: net * (1 + percent / 100) });
  }).filter((line) => line.rawName);
  const supplier = path(root, 'AccountingSupplierParty', 'Party');
  const id = val(root, 'ID');
  const totals = kid(root, 'LegalMonetaryTotal');
  return {
    format: 'EN16931',
    issuerVat: val(supplier, 'PartyTaxScheme', 'CompanyID').replace(/^EL/, ''), issuerName: val(supplier, 'PartyName', 'Name') || val(supplier, 'PartyLegalEntity', 'RegistrationName'),
    date: val(root, 'IssueDate').slice(0, 10), series: '', number: id, uid: id,
    total: round2(num(val(totals, 'PayableAmount')) || num(val(totals, 'TaxInclusiveAmount')) || lines.reduce((s, l) => s + l.price, 0)), lines
  };
}

// ---------- URLs ----------
export function classifyReceiptUrl(input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch { return { kind: 'invalid' }; }
  if (url.protocol !== 'https:') return { kind: 'insecure' };
  if (/(^|\.)aade\.gr$/i.test(url.hostname)) return { kind: 'aade', url: url.href };
  // Provider page: strip a trailing slash and any known format suffix, keep the receipt key.
  const base = url.href.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/(myDATA|EN16931|pdf|xml)$/i, '');
  return { kind: 'provider', url: base, host: url.hostname };
}

// AADE "TimologioQR" style links carry only the totals in the query string.
export function parseAadeSummary(input) {
  const url = new URL(input);
  const params = Object.fromEntries([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
  const total = num(params.totalgrossvalue || params.gross || params.total || params.amount || (num(params.totalnetvalue) + num(params.totalvatamount)));
  const date = (params.issuedate || params.date || '').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1').slice(0, 10);
  return { format: 'AADE', issuerVat: params.issuervat || params.vat || params.afm || '', issuerName: '', date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    series: params.series || '', number: params.aa || params.number || '', uid: params.mark || params.uid || url.search, total: round2(total), lines: [] };
}

// Stable id of a receipt, used to refuse importing the same one twice.
export async function receiptId(receipt, sourceUrl = '') {
  const key = [receipt.issuerVat, receipt.date, receipt.series, receipt.number, receipt.uid, receipt.total, receipt.uid ? '' : sourceUrl].join('|');
  if (globalThis.crypto?.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return `rcpt-${Array.from(new Uint8Array(hash).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `rcpt-${(h >>> 0).toString(16)}`;
}

// ---------- Fetching ----------
async function getText(url, { fetchImpl, proxy }) {
  const attempt = async (target) => {
    const res = await fetchImpl(target, { headers: { accept: 'application/xml, text/xml, */*' } });
    if (!res.ok) { const error = new Error(`HTTP ${res.status}`); error.status = res.status; throw error; }
    return res.text();
  };
  try { return await attempt(url); }
  catch (error) {
    // A CORS block or network error surfaces as TypeError; retry through the proxy if one is configured.
    if (!proxy || error.status) throw error;
    return attempt(`${proxy.replace(/\/+$/, '')}/?url=${encodeURIComponent(url)}`);
  }
}

export async function fetchReceipt(input, { fetchImpl = fetch, proxy = '' } = {}) {
  const target = classifyReceiptUrl(input);
  if (target.kind === 'invalid') throw new Error('Ο σύνδεσμος δεν είναι έγκυρος.');
  if (target.kind === 'insecure') throw new Error('Ο σύνδεσμος πρέπει να ξεκινά με https://');
  if (target.kind === 'aade') return { ...parseAadeSummary(target.url), sourceUrl: target.url };
  let receipt = null;
  let lastError = null;
  try { receipt = parseMyData(await getText(`${target.url}/myDATA`, { fetchImpl, proxy })); } catch (error) { lastError = error; }
  let ubl = null;
  if (!receipt?.lines.length || !receipt.issuerName) {
    try { ubl = parseUbl(await getText(`${target.url}/EN16931`, { fetchImpl, proxy })); } catch (error) { lastError = lastError || error; }
  }
  if (!receipt?.lines.length && ubl?.lines.length) receipt = ubl;
  else if (receipt && ubl?.issuerName) receipt.issuerName = ubl.issuerName;
  if (!receipt) {
    if (lastError && !lastError.status) throw Object.assign(new Error('Δεν ήταν δυνατή η λήψη της απόδειξης (ο πάροχος δεν επιτρέπει πρόσβαση από την εφαρμογή ή δεν υπάρχει σύνδεση).'), { cors: true });
    throw new Error('Δεν βρέθηκαν είδη σε αυτή την απόδειξη.');
  }
  return { ...receipt, sourceUrl: target.url };
}
