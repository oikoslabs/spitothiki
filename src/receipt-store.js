// Anonymous store/type labels for on-device receipt counts (same names as the receipt proxy).
// Keep in sync with oikoslabs/spitothiki-workers proxy/worker.js classify().
const STORES = { sklavenitis: 'Sklavenitis', masoutis: 'Masoutis', lidl: 'Lidl', mymarket: 'My Market', 'my market': 'My Market', kritikos: 'Kritikos', galaxias: 'Galaxias', 'γαλαξίας': 'Galaxias', bazaar: 'Bazaar', 'μπαζάρ': 'Bazaar', 'ab vassilopoulos': 'AB Vassilopoulos', 'βασιλόπουλος': 'AB Vassilopoulos', 'σκλαβενίτης': 'Sklavenitis', 'μασούτης': 'Masoutis', 'κρητικός': 'Kritikos', 'market in': 'Market In', 'μαρκετ ιν': 'Market In', 'discount markt': 'Discount Markt', 'θανόπουλος': 'Thanopoulos', thanopoulos: 'Thanopoulos', 'χαλκιαδάκης': 'Chalkiadakis', chalkiadakis: 'Chalkiadakis', halkiadakis: 'Chalkiadakis', synka: 'Synka', 'συνκα': 'Synka', 'συν.κα': 'Synka', 'συν. κα': 'Synka', 'προμηθευτική': 'Promitheftiki', promitheftiki: 'Promitheftiki', eko: 'EKO', shell: 'Shell', aegean: 'Aegean', avin: 'Avin', bp: 'BP', revoil: 'Revoil', elin: 'Elin', elinoil: 'Elin', 'elin oil': 'Elin', 'ελινόιλ': 'Elin', 'jet oil': 'Jet Oil', jetoil: 'Jet Oil', coral: 'Coral', cyclon: 'Cyclon', 'silk oil': 'Silk Oil', silkoil: 'Silk Oil', eteka: 'ETEKA', 'ετεκα': 'ETEKA', dracoil: 'Dracoil', kmoil: 'Kmoil', 'αττική οδός': 'Attiki Odos', 'attiki odos': 'Attiki Odos', 'ολυμπία οδός': 'Olympia Odos', 'olympia odos': 'Olympia Odos', 'εγνατία': 'Egnatia Odos', egnatia: 'Egnatia Odos', 'νέα οδός': 'Nea Odos', 'nea odos': 'Nea Odos', 'μορέας': 'Moreas', moreas: 'Moreas', 'κεντρική οδός': 'Kentriki Odos' };
const FUEL_STORES = new Set(['EKO', 'Shell', 'Aegean', 'Avin', 'BP', 'Revoil', 'Elin', 'Jet Oil', 'Coral', 'Cyclon', 'Silk Oil', 'ETEKA', 'Dracoil', 'Kmoil']);
const SUPER_STORES = new Set(['Sklavenitis', 'Masoutis', 'Lidl', 'My Market', 'Kritikos', 'Galaxias', 'Bazaar', 'AB Vassilopoulos', 'Market In', 'Discount Markt', 'Thanopoulos', 'Chalkiadakis', 'Synka', 'Promitheftiki']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const foldGreek = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '');
const foldRe = (re) => new RegExp(foldGreek(re.source), 'i');
const FUEL_RE = foldRe(/βενζ|αμόλυβδ|αμολυβδ|diesel|πετρέλαιο κίνησης|καυσιμ|unleaded|lpg|υγραέριο/i);
const TOLL_RE = foldRe(/διόδι|διοδι|toll|αττική οδός|attiki odos|ολυμπία οδός|olympia odos|εγνατία οδός|νέα οδός|μορέας|moreas/i);
const SUPER_RE = foldRe(/super ?market|σούπερ|sklavenitis|masoutis|lidl|mymarket|kritikos|galaxias|bazaar|βασιλόπουλος|σκλαβενίτης|μασούτης/i);
export const stripReceiptMarkup = (raw, max = 200000) => String(raw || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

// Local text only, for classifyStore. Never sent: issuer name, trade name, address, item lines,
// stripped page/XML (pageText, if the fetch kept it) and any extra text the caller already has (e.g. OCR).
export function receiptClassifyText(receipt = {}, extra = '') {
  const lines = (receipt.lines || []).map((l) => l.rawName || l.name || '');
  return stripReceiptMarkup([receipt.issuerName, receipt.issuerTradeName, receipt.issuerAddress, receipt.pageText, ...lines, extra].filter(Boolean).join(' '));
}

const STORE_ENTRIES = Object.entries(STORES).map(([k, v]) => [foldGreek(k), v]);
export function classifyStore(text, host) {
  const t = foldGreek(`${text || ''} ${host || ''}`);
  let store = '';
  for (const [k, v] of STORE_ENTRIES) if (new RegExp(`(^|[^a-zα-ω])${escapeRe(k)}([^a-zα-ω]|$)`).test(t)) { store = v; break; }
  const m = /epsilondigital-([a-z0-9]+)\./.exec(foldGreek(host || ''));
  if (!store && m) store = m[1];
  const type = TOLL_RE.test(t) ? 'toll' : (FUEL_RE.test(t) || FUEL_STORES.has(store)) ? 'fuel' : (SUPER_RE.test(t) || SUPER_STORES.has(store)) ? 'supermarket' : 'other';
  return { type, store };
}
