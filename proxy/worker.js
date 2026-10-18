// Spitothiki receipt proxy (Cloudflare Worker).
// Forwards GET requests only to known Greek e-invoicing provider domains and adds CORS for the app,
// for providers whose receipt pages don't allow direct browser access. Usage: GET /?url=<https receipt url>
const ALLOWED_ORIGINS = ['https://spitothiki.web.app', 'https://spitothiki.firebaseapp.com', 'http://localhost:8080', 'http://127.0.0.1:8080'];

// Registered domains of AADE-licensed e-invoicing providers (subdomains allowed).
// Keep this list short and explicit: the proxy must never become an open relay.
export const ALLOWED_DOMAINS = [
  'epsilonnet.gr', 'epsilondigital.gr', // Epsilon Digital (e.g. epsilondigital-<chain>.epsilonnet.gr/fd/...)
  'impact.gr', 'mydataconnect.gr', // IMPACT myDATA connect / eInvoicing
  'softone.gr', 'softone.cloud', 's1cloud.net', // SoftOne e-Invoicing
  'entersoft.gr', 'entersoft.eu', 'retail-link.gr', // Entersoft / Retail Link
  'prosvasisgo.com', 'prosvasis.gr', // PROSVASISGO
  'pelatologio.gr', 'oxygen.gr', // Oxygen-Pelatologio
  'primer.gr', 'primersoftware.gr', // Primer MyData
  'ilyda.com', 'megmydata.gr', // Meg myData (ΙΛΥΔΑ)
  'mat.gr', 'matrapidsign.gr', // MAT RapidSign
  'simplyinvoice.gr', 'simply.gr', // SIMPLY
  'tesae.gr', // Pegasus e-invoicing
  'orian.gr', // Orian MyInvoices
  'parochos.gr', 'parochos-online.gr', // Parochos Online
  'vivawallet.com', 'viva.com', // Viva Fiscal
  'wrapp.ai', // WRAPP
  'edicomgroup.com', // EDIWIN
  'invoicelink.gr', 'megasoft.gr', // InvoiceLink
  'onesys.gr', // ONESIGN
  'elorus.com', // Elorus Fuse
  'timologisi.online' // timologisi.online
];

const MAX_BYTES = 2 * 1024 * 1024;

function allowedHost(host) {
  const h = host.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { 'access-control-allow-origin': allow, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'accept', vary: 'Origin' };
}

// --- Anonymous usage logging (Workers Analytics Engine). No personal data: no IPs, users, amounts or items.
const STORES = { sklavenitis: 'Sklavenitis', masoutis: 'Masoutis', lidl: 'Lidl', mymarket: 'My Market', kritikos: 'Kritikos', galaxias: 'Galaxias', bazaar: 'Bazaar', 'ab vassilopoulos': 'AB Vassilopoulos', 'βασιλόπουλος': 'AB Vassilopoulos', 'σκλαβενίτης': 'Sklavenitis', 'μασούτης': 'Masoutis', 'κρητικός': 'Kritikos', eko: 'EKO', shell: 'Shell', aegean: 'Aegean', avin: 'Avin', bp: 'BP', revoil: 'Revoil', elin: 'Elin', 'αττική οδός': 'Attiki Odos', 'attiki odos': 'Attiki Odos', 'ολυμπία οδός': 'Olympia Odos', 'olympia odos': 'Olympia Odos', 'εγνατία': 'Egnatia Odos', egnatia: 'Egnatia Odos', 'νέα οδός': 'Nea Odos', 'nea odos': 'Nea Odos', 'μορέας': 'Moreas', moreas: 'Moreas', 'κεντρική οδός': 'Kentriki Odos' };
const FUEL_RE = /βενζ|αμόλυβδ|αμολυβδ|diesel|πετρέλαιο κίνησης|καυσιμ|unleaded|lpg|υγραέριο/i;
const TOLL_RE = /διόδι|διοδι|toll|αττική οδός|attiki odos|ολυμπία οδός|olympia odos|εγνατία οδός|νέα οδός|μορέας|moreas/i;
const SUPER_RE = /super ?market|σούπερ|sklavenitis|masoutis|lidl|mymarket|kritikos|galaxias|bazaar|βασιλόπουλος|σκλαβενίτης|μασούτης/i;
export function classify(text, host) {
  const t = `${text || ''} ${host || ''}`.toLowerCase();
  let store = '';
  for (const [k, v] of Object.entries(STORES)) if (new RegExp(`(^|[^a-zα-ωά-ώ])${k}([^a-zα-ωά-ώ]|$)`, 'i').test(t)) { store = v; break; }
  const m = /epsilondigital-([a-z0-9]+)\./.exec((host || '').toLowerCase());
  if (!store && m) store = m[1];
  const type = TOLL_RE.test(t) ? 'toll' : FUEL_RE.test(t) ? 'fuel' : SUPER_RE.test(t) ? 'supermarket' : 'other';
  return { type, store };
}
function log(env, d) {
  try {
    env?.RECEIPTS?.writeDataPoint({ indexes: [d.type], blobs: [d.type, d.store, d.host, d.status < 400 ? 'success' : 'error', String(d.status)], doubles: [d.ms, d.status] });
  } catch {}
}

export default {
  async fetch(request, env, ctx) {
    const t0 = Date.now();
    const info = { type: 'other', store: '', host: '' };
    let res;
    try { res = await handle(request, info); } catch { res = new Response('Upstream error', { status: 502, headers: cors(request.headers.get('origin') || '') }); }
    if (request.method === 'GET') log(env, { ...info, ms: Date.now() - t0, status: res.status });
    return res;
  }
};

async function handle(request, info) {
  {
    const origin = request.headers.get('origin') || '';
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return new Response('Origin not allowed', { status: 403, headers });
    let target;
    try { target = new URL(new URL(request.url).searchParams.get('url') || ''); } catch { return new Response('Bad url', { status: 400, headers }); }
    if (target.protocol !== 'https:' || target.username || target.password || target.port) return new Response('Only plain https URLs', { status: 400, headers });
    info.host = target.hostname.toLowerCase();
    if (!allowedHost(target.hostname)) { info.host = 'blocked'; return new Response('Domain not allowed', { status: 403, headers }); }
    const upstream = await fetch(target.href, { method: 'GET', redirect: 'follow', headers: { accept: 'application/xml, text/xml, */*', 'user-agent': 'SpitothikiReceiptProxy/1.0' }, cf: { cacheTtl: 300 } });
    // Re-check after redirects so a provider redirect can't take us elsewhere.
    if (!allowedHost(new URL(upstream.url).hostname)) return new Response('Redirect not allowed', { status: 403, headers });
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response('Too large', { status: 413, headers });
    try { Object.assign(info, classify(new TextDecoder().decode(body.slice(0, 200000)), new URL(upstream.url).hostname)); } catch {}
    return new Response(body, { status: upstream.status, headers: { ...headers, 'content-type': upstream.headers.get('content-type') || 'application/xml', 'cache-control': 'private, max-age=300' } });
  }
}
