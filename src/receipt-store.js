// Anonymous store/type labels for on-device receipt counts (same names as the receipt proxy).
// Keep in sync with oikoslabs/spitothiki-workers proxy/worker.js classify().
const STORES = { sklavenitis: 'Sklavenitis', masoutis: 'Masoutis', lidl: 'Lidl', mymarket: 'My Market', kritikos: 'Kritikos', galaxias: 'Galaxias', bazaar: 'Bazaar', 'ab vassilopoulos': 'AB Vassilopoulos', 'βασιλόπουλος': 'AB Vassilopoulos', 'σκλαβενίτης': 'Sklavenitis', 'μασούτης': 'Masoutis', 'κρητικός': 'Kritikos', eko: 'EKO', shell: 'Shell', aegean: 'Aegean', avin: 'Avin', bp: 'BP', revoil: 'Revoil', elin: 'Elin', 'αττική οδός': 'Attiki Odos', 'attiki odos': 'Attiki Odos', 'ολυμπία οδός': 'Olympia Odos', 'olympia odos': 'Olympia Odos', 'εγνατία': 'Egnatia Odos', egnatia: 'Egnatia Odos', 'νέα οδός': 'Nea Odos', 'nea odos': 'Nea Odos', 'μορέας': 'Moreas', moreas: 'Moreas', 'κεντρική οδός': 'Kentriki Odos' };
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
  for (const [k, v] of STORE_ENTRIES) if (new RegExp(`(^|[^a-zα-ω])${k}([^a-zα-ω]|$)`).test(t)) { store = v; break; }
  const m = /epsilondigital-([a-z0-9]+)\./.exec(foldGreek(host || ''));
  if (!store && m) store = m[1];
  const type = TOLL_RE.test(t) ? 'toll' : FUEL_RE.test(t) ? 'fuel' : SUPER_RE.test(t) ? 'supermarket' : 'other';
  return { type, store };
}
