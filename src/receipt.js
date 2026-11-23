// Greek e-receipts (ηλεκτρονικές αποδείξεις): the QR on the receipt points to the e-invoicing provider's page.
// Appending /myDATA gives the AADE InvoicesDoc XML with the item lines; /EN16931 gives a UBL invoice.
import { normalizeSearch } from './domain.js';
import { matchIngredient } from './recipes.js';
import { allowedAadePage, allowedHost } from './receipt-domains.js';
import { isStatsTest } from './source.js';
import { stripReceiptMarkup } from './receipt-store.js';

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
  ['Ξηρά τρόφιμα', ['καρυδ', 'κασιου', 'αμυγδαλ', 'φιστικ', 'φουντουκ', 'χουρμα', 'σταφιδ', 'ξηροι καρπ', 'αλευρ', 'ρυζι', 'μακαρον', 'ζυμαρικ', 'ψωμι', 'αρτοσ', 'αρτ/σ', 'φρυγαν', 'ζαχαρ', 'αλατι', 'λαδι', 'ελαιολ', 'φακ', 'φασολ', 'ρεβιθ', 'δημητρ', 'μπισκοτ', 'κρακερ', 'μελι', 'σοκολατ', 'ελιε', 'κονσερ']]
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

export function makeLine({ name, quantity, unit, price }) {
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
  const paymentMethods = kids(invoice, 'paymentMethods').flatMap((block) => kids(block, 'paymentMethodDetails')).map((d) => ({
    type: val(d, 'type'), amount: num(val(d, 'amount'))
  })).filter((m) => m.type);
  return {
    format: 'myDATA',
    issuerVat: val(invoice, 'issuer', 'vatNumber'), issuerName: '',
    date: val(header, 'issueDate').slice(0, 10), series: val(header, 'series'), number: val(header, 'aa'),
    uid: val(invoice, 'uid') || val(invoice, 'mark'), total: round2(total), lines,
    // v1.9.7: links to an earlier document (restaurant order slip → retail receipt) so the slip can be replaced, not doubled.
    mark: val(invoice, 'mark'), invoiceType: val(header, 'invoiceType'),
    connectedMarks: kids(header, 'multipleConnectedMarks').map((n) => n.text).filter(Boolean), related: [],
    ...(paymentMethods.length ? { paymentMethods } : {})
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
  const partyName = val(supplier, 'PartyName', 'Name');
  const legalName = val(supplier, 'PartyLegalEntity', 'RegistrationName');
  const id = val(root, 'ID');
  const totals = kid(root, 'LegalMonetaryTotal');
  const paymentMethods = kids(root, 'PaymentMeans').map((m) => ({
    type: val(m, 'PaymentMeansCode'), amount: num(val(m, 'PaymentDueAmount') || val(m, 'PaymentAmount'))
  })).filter((m) => m.type);
  return {
    format: 'EN16931',
    issuerVat: val(supplier, 'PartyTaxScheme', 'CompanyID').replace(/^EL/, ''),
    issuerName: partyName || legalName,
    ...(partyName && legalName && partyName !== legalName ? { issuerTradeName: legalName } : {}),
    date: val(root, 'IssueDate').slice(0, 10), series: '', number: id, uid: id,
    total: round2(num(val(totals, 'PayableAmount')) || num(val(totals, 'TaxInclusiveAmount')) || lines.reduce((s, l) => s + l.price, 0)), lines,
    ...ublRefs(root),
    ...(paymentMethods.length ? { paymentMethods } : {})
  };
}

// v1.9.7: IMPACT puts the mark and «Σχετικά παραστατικά» (e.g. «ΔΠΑ 38258,» = order slip) in AdditionalDocumentReference.
function ublRefs(root) {
  const refs = kids(root, 'AdditionalDocumentReference').map((r) => ({ id: val(r, 'ID'), what: val(r, 'DocumentDescription') }));
  const mark = refs.find((r) => /M\.?AR\.?K/i.test(r.what))?.id || '';
  const related = refs.filter((r) => /DELTIO|ΣΧΕΤ|RELATED/i.test(r.what)).flatMap((r) => r.id.split(/[,;]/)).map((x) => x.trim()).filter(Boolean);
  return { mark, related, connectedMarks: [] };
}

// Normalised «series number» of a document, for matching «ΔΠΑ 38258» against a saved slip.
export const docRef = (series, number) => normalizeSearch(`${series || ''} ${number || ''}`).replace(/[\s_.\-/]+/g, ' ').trim();

// v1.9.7: a saved order slip / earlier document that this receipt replaces (same shop, linked mark or «Σχετικά παραστατικά»).
// Older saved receipts have no mark/series: then the same shop + same day + same total counts, only if the receipt says it has a related document.
export function findRelatedReceipt(receipt, saved = [], selfId = '') {
  const marks = new Set((receipt.connectedMarks || []).map(String));
  const refs = new Set((receipt.related || []).map((r) => docRef('', r)));
  if (!marks.size && !refs.size) return null;
  const vat = String(receipt.issuerVat || '');
  const same = saved.filter((r) => r.id !== selfId && r.format !== 'transport' && (!vat || !r.issuerVat || String(r.issuerVat) === vat));
  return same.find((r) => r.mark && marks.has(String(r.mark)))
    || same.find((r) => r.number && refs.has(docRef(r.series, r.number)))
    || same.find((r) => !r.mark && !r.number && vat && String(r.issuerVat) === vat && r.date === receipt.date && Math.abs(Number(r.total) - Number(receipt.total)) < 0.005)
    || null;
}

// ---------- URLs ----------
export function classifyReceiptUrl(input) {
  let url;
  try { url = new URL(String(input || '').trim()); } catch { return { kind: 'invalid' }; }
  if (url.protocol !== 'https:') return { kind: 'insecure' };
  if (/(^|\.)aade\.gr$/i.test(url.hostname) || /tameiakes/i.test(url.hostname)) return { kind: 'aade', url: url.href };
  // Provider page: strip a trailing slash and any known format suffix, keep the receipt key.
  const base = url.href.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/(myDATA|EN16931|pdf|xml)$/i, '');
  return { kind: 'provider', url: base, host: url.hostname };
}

// Pull receipt URLs out of pasted or shared text (e.g. «Δες την απόδειξη: https://…»).
const URL_IN_TEXT = /https?:\/\/[^\s<>"'\\]+/gi;
function urlsInText(text) {
  const out = [];
  const seen = new Set();
  for (const match of String(text || '').matchAll(URL_IN_TEXT)) {
    const href = match[0].replace(/[.,;:!?)\]}>"]+$/g, '');
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

export function isReceiptLink(input) {
  const target = classifyReceiptUrl(input);
  if (target.kind === 'aade') return true;
  return target.kind === 'provider' && allowedHost(target.host);
}

export function extractReceiptLink(text) {
  return urlsInText(text).find(isReceiptLink) || '';
}

export const RECEIPT_LINK_MESSAGES = {
  empty: 'Γράψε ή επικόλλησε τον σύνδεσμο της απόδειξης.',
  missing: 'Δεν βρήκα σύνδεσμο απόδειξης σε αυτό το κείμενο.',
  insecure: 'Ο σύνδεσμος πρέπει να ξεκινά με https://',
  invalid: 'Ο σύνδεσμος δεν είναι έγκυρος.',
  notReceipt: 'Αυτός δεν είναι σύνδεσμος απόδειξης (π.χ. e-invoicing.gr, myDATA ή QR ΑΑΔΕ). Έλεγξε το λινκ ή σκάναρε το QR.'
};

export function receiptLinkError(text) {
  const raw = String(text || '').trim();
  if (!raw) return RECEIPT_LINK_MESSAGES.empty;
  const urls = urlsInText(raw);
  if (!urls.length) return RECEIPT_LINK_MESSAGES.missing;
  if (extractReceiptLink(raw)) return '';
  const kind = classifyReceiptUrl(urls[0]).kind;
  if (kind === 'insecure') return RECEIPT_LINK_MESSAGES.insecure;
  if (kind === 'invalid') return RECEIPT_LINK_MESSAGES.invalid;
  return RECEIPT_LINK_MESSAGES.notReceipt;
}

// AADE "TimologioQR" links carry totals in the query string. Cash-register (ΦΗΜ) links
// (https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=…) pack the total at the end of SIG:
// 11-char device serial + 8-digit mark + 40-char SHA-1 + amount (Α.1024/2020, e.g. 18.35).
function parseFhmSig(sig) {
  const raw = String(sig || '').trim();
  if (raw.length < 60) return null;
  const serial = raw.slice(0, 11);
  const mark = raw.slice(11, 19);
  const sha = raw.slice(19, 59);
  const amountPart = raw.slice(59).trim();
  if (!/^[A-Za-z0-9]{11}$/.test(serial) || !/^\d{8}$/.test(mark) || !/^[0-9A-Fa-f]{40}$/.test(sha)) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(amountPart)) return null;
  const total = num(amountPart);
  if (!Number.isFinite(total) || total < 0) return null;
  return { total: round2(total), serial, mark };
}

export function parseAadeSummary(input) {
  const url = new URL(input);
  const params = Object.fromEntries([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
  let total = num(params.totalgrossvalue || params.gross || params.total || params.amount || (num(params.totalnetvalue) + num(params.totalvatamount)));
  if (!total && params.sig) {
    const parsed = parseFhmSig(params.sig);
    if (parsed) total = parsed.total;
  }
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
// v1.8.0: why a lookup failed decides what the user is told.
//   network     – the phone is offline, or our receipt proxy itself can't be reached / times out → «δοκίμασε ξανά» (can be kept for later)
//   temporary   – the provider/proxy is overloaded or briefly down (429, 502/503/504, Cloudflare timeouts) → «δοκίμασε ξανά»
//   unsupported – a shop whose provider isn't in receipt-domains.js (decided before any lookup), refused by the proxy (403),
//                 or an unknown page layout (HTML instead of receipt data, 404/500…) → «δεν υποστηρίζεται ακόμα»
export const RECEIPT_MESSAGES = {
  unsupported: 'Οι αποδείξεις αυτού του καταστήματος δεν υποστηρίζονται ακόμα από τη Σπιτοθήκη. Γράψε το ποσό με το «＋ Έξοδο με το χέρι» ή βγάλε φωτογραφία την απόδειξη.',
  network: 'Δεν ήταν δυνατή η σύνδεση για να ανοίξει η απόδειξη (δεν υπάρχει internet ή η σύνδεση είναι πολύ αργή). Δοκίμασε ξανά σε λίγο.',
  temporary: 'Η υπηρεσία αποδείξεων δεν απαντά αυτή τη στιγμή. Δοκίμασε ξανά σε λίγα λεπτά.',
  busy: 'Πολλές αναζητήσεις αυτή τη στιγμή. Δοκίμασε ξανά σε λίγα λεπτά ή σκάναρε τη φωτογραφία της απόδειξης.',
  pending: 'Η απόδειξη δεν έχει ανέβει ακόμα στον πάροχο. Συνήθως εμφανίζεται λίγα λεπτά μετά την πληρωμή. Δοκίμασε ξανά σε λίγο.'
};
// v1.9.6: a known provider answering «document … was not found» (IMPACT: 400 text/plain) means the receipt was just
// issued and isn't published yet — not an unsupported shop.
const NOT_YET = /not\s+found|δεν\s+βρέθηκε/i;
const TEMPORARY_STATUSES = new Set([408, 502, 503, 504, 520, 521, 522, 523, 524, 530]);
const FETCH_TIMEOUT_MS = 15000;

export function receiptFailure(error) {
  if (!error) return 'unsupported';
  if (error.status === 429) return 'busy';
  if (error.status && TEMPORARY_STATUSES.has(error.status)) return 'temporary';
  if (!error.status && (error.network || error.name === 'TypeError' || error.name === 'TimeoutError' || error.name === 'AbortError')) return 'network';
  return 'unsupported';
}

// v1.9.39: hosts whose receipt pages never allow a direct browser read (no CORS header; measured 21/11/2026), so the
// app goes straight to the proxy and saves a full failed round trip. Other hosts are learned on the device:
// a direct read that fails as CORS/network and then works through the proxy is remembered for 7 days.
export const PROXY_FIRST_HOSTS = ['e-invoicing.gr', 'www1.aade.gr'];
export const PROXY_HOSTS_KEY = 'spitothiki:proxy-first-hosts';
export const PROXY_HOSTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const hostKey = (host) => String(host || '').toLowerCase().replace(/\.$/, '').replace(/^www\.(?=[^.]+\.[^.]+$)/, '');
const defaultStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
function readProxyHosts(storage) {
  try { const v = JSON.parse(storage?.getItem(PROXY_HOSTS_KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
export function isProxyFirstHost(host, { storage = defaultStorage(), now = Date.now() } = {}) {
  const key = hostKey(host);
  if (!key) return false;
  if (PROXY_FIRST_HOSTS.includes(key)) return true;
  const until = Number(readProxyHosts(storage)[key]);
  return Number.isFinite(until) && until > now;
}
export function rememberProxyHost(host, { storage = defaultStorage(), now = Date.now() } = {}) {
  const key = hostKey(host);
  if (!key || !storage || PROXY_FIRST_HOSTS.includes(key)) return;
  try {
    const rows = Object.entries(readProxyHosts(storage)).filter(([, until]) => Number(until) > now);
    const next = Object.fromEntries([...rows.filter(([h]) => h !== key).slice(-29), [key, now + PROXY_HOSTS_TTL_MS]]);
    storage.setItem(PROXY_HOSTS_KEY, JSON.stringify(next));
  } catch {}
}

async function getText(url, { fetchImpl, proxy, known = true, used, origin, proxyFirst = false, storage, now, timeoutMs = FETCH_TIMEOUT_MS }) {
  const attempt = async (target) => {
    let res;
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
    try { res = await fetchImpl(target, { headers: { accept: 'application/xml, text/xml, */*' }, cache: 'no-store', ...(signal ? { signal } : {}) }); }
    catch (error) { throw Object.assign(error instanceof Error ? error : new Error(String(error)), { network: true }); }
    if (!res.ok) { const error = new Error(`HTTP ${res.status}`); error.status = res.status; try { error.body = String(await res.text()).slice(0, 300); } catch {} throw error; }
    return res.text();
  };
  // q=1: this lookup is part of a scan the app counts once itself, so the proxy keeps it only as an anonymous timing.
  const proxyUrl = () => `${proxy.replace(/\/+$/, '')}/?url=${encodeURIComponent(url)}` + (isStatsTest({ origin }) ? '&t=1' : '') + '&q=1';
  const viaProxy = () => { if (used) { used.proxied = true; used.via = 'proxy'; } return attempt(proxyUrl()); };
  if (proxy && known && proxyFirst) {
    try { return await viaProxy(); }
    catch (error) {
      // The proxy answered (e.g. 404 «not published yet»): that's the answer. Only if the proxy itself
      // can't be reached, try the provider directly once.
      if (error.status) throw error;
      try { return await attempt(url); } catch { throw error; }
    }
  }
  try { return await attempt(url); }
  catch (error) {
    // A CORS block or network error surfaces as TypeError; retry through the proxy if one is configured.
    // Only for known providers: the proxy refuses every other domain anyway.
    if (!proxy || error.status || !known) throw error;
    const text = await viaProxy();
    try { rememberProxyHost(new URL(url).hostname, { storage, ...(now ? { now } : {}) }); } catch {}
    return text;
  }
}

// v1.9.39: the AADE cash-register check page (q1.php) shows the shop's name and address. Pure, unit-tested.
const decodeEntities = (s) => String(s || '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const cellText = (html) => decodeEntities(String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
export function parseAadeFhmPage(html) {
  const rows = [...String(html || '').matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => [cellText(m[1]), cellText(m[2])]);
  const find = (re) => rows.find(([k]) => re.test(k))?.[1] || '';
  const name = find(/^Επωνυμία/i).slice(0, 120);
  let address = find(/^Διεύθυνση/i).slice(0, 160);
  if (/^ΕΞΩΤΕΡΙΚΟ$/i.test(address)) address = '';
  return { issuerName: name, issuerAddress: name ? address : '' };
}
const AADE_PAGE_TIMEOUT_MS = 8000;

// v1.9.39: the shop name (and address) of an AADE cash-register receipt, read from the AADE check page through the
// proxy (the page has no CORS). Runs AFTER the receipt is shown, so the scan is as fast as before; the amount,
// date and id never come from here. Returns null when there's nothing (other AADE links, offline, page error).
export async function fetchAadeShop(input, { fetchImpl = fetch, proxy = '', origin, storage = defaultStorage() } = {}) {
  const target = classifyReceiptUrl(input);
  if (target.kind !== 'aade' || !proxy || !allowedAadePage(target.url) || globalThis.navigator?.onLine === false) return null;
  try {
    const page = parseAadeFhmPage(await getText(target.url, { fetchImpl, proxy, known: true, origin, proxyFirst: true, storage, timeoutMs: AADE_PAGE_TIMEOUT_MS }));
    return page.issuerName ? page : null;
  } catch { return null; }
}

export async function fetchReceipt(input, { fetchImpl = fetch, proxy = '', origin, storage = defaultStorage(), now = Date.now() } = {}) {
  const target = classifyReceiptUrl(input);
  if (target.kind === 'invalid') throw new Error('Ο σύνδεσμος δεν είναι έγκυρος.');
  if (target.kind === 'insecure') throw new Error('Ο σύνδεσμος πρέπει να ξεκινά με https://');
  if (target.kind === 'aade') return { ...parseAadeSummary(target.url), sourceUrl: target.url, via: 'aade', proxied: false };
  if (globalThis.navigator?.onLine === false) throw Object.assign(new Error(RECEIPT_MESSAGES.network), { kind: 'network', cors: true, via: 'direct', proxied: false });
  // v1.8.0: a provider that isn't in our list is «not supported yet» whatever happens next (never «no internet»).
  // One quiet direct read is still tried, in case such a provider happens to allow it; no proxy, no retry.
  const known = allowedHost(target.host);
  const used = { via: 'direct', proxied: false };
  let receipt = null;
  let lastError = null;
  const opts = { fetchImpl, proxy, known, used, origin, storage, now, proxyFirst: known && isProxyFirstHost(target.host, { storage, now }) };
  // v1.9.39: myDATA never carries the shop name, so for a known provider EN16931 was always read next, one after
  // the other. Both are now requested at the same time; the result is decided exactly as before.
  const myRaw = getText(`${target.url}/myDATA`, opts);
  const enRaw = known ? getText(`${target.url}/EN16931`, opts) : null;
  const myData = myRaw.then(parseMyData);
  const en = enRaw ? enRaw.then(parseUbl) : null;
  en?.catch(() => {});
  try { receipt = await myData; } catch (error) { lastError = error; }
  let ubl = null;
  if (known && (!receipt?.lines.length || !receipt.issuerName)) {
    try { ubl = await en; } catch (error) { lastError = lastError || error; }
  }
  if (!receipt?.lines.length && ubl?.lines.length) receipt = ubl;
  else if (receipt && ubl?.issuerName) receipt.issuerName = ubl.issuerName;
  if (receipt && ubl && receipt !== ubl) {
    receipt.related = ubl.related || [];
    receipt.mark ||= ubl.mark || '';
    if (ubl.issuerTradeName && ubl.issuerTradeName !== receipt.issuerName) receipt.issuerTradeName = ubl.issuerTradeName;
  }
  if (!receipt || (!receipt.lines.length && !(receipt.total > 0))) {
    // Body arrived but isn't receipt data (e.g. an HTML page) → unsupported layout; otherwise judge by the error.
    const kind = receipt || !known ? 'unsupported'
      : [400, 404].includes(lastError?.status) && NOT_YET.test(lastError.body || '') ? 'pending' : receiptFailure(lastError);
    throw Object.assign(new Error(RECEIPT_MESSAGES[kind]), { kind, unsupported: kind === 'unsupported', cors: kind !== 'unsupported', via: used.via, proxied: used.proxied, ...(kind === 'network' ? {} : { status: lastError?.status || 0 }) });
  }
  // Keep a stripped copy of the raw page/XML so on-device classifyStore can find a franchise brand
  // (e.g. BP) that is not in the legal issuer name. Not saved with the receipt; never sent to stats.
  const rawBits = await Promise.all([myRaw, enRaw || Promise.resolve('')].map((p) => p.then((t) => t, () => '')));
  const pageText = stripReceiptMarkup(rawBits.join('\n'));
  return { ...receipt, sourceUrl: target.url, via: used.via, proxied: used.proxied, ...(pageText ? { pageText } : {}) };
}
