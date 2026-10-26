// Spitothiki receipt proxy (Cloudflare Worker).
// Forwards GET requests only to known Greek e-invoicing provider domains and adds CORS for the app,
// for providers whose receipt pages don't allow direct browser access. Usage: GET /?url=<https receipt url>
import { ALLOWED_DOMAINS, ALLOWED_ORIGINS, allowedHost, isAllowedOrigin } from '../src/receipt-domains.js';
export { ALLOWED_DOMAINS, ALLOWED_ORIGINS };

const MAX_BYTES = 2 * 1024 * 1024;


function cors(origin) {
  const allow = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
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
    try { res = await handle(request, info, env); } catch { res = new Response('Upstream error', { status: 502, headers: cors(request.headers.get('origin') || '') }); }
    if (request.method === 'GET') log(env, { ...info, ms: Date.now() - t0, status: res.status });
    return res;
  }
};

// Backstop limiter inside one Worker instance (the binding is eventually consistent): 30 requests/minute per IP.
const hits = new Map();
export function isolateAllow(ip, now = Date.now()) {
  const w = Math.floor(now / 60000); const h = hits.get(ip);
  if (!h || h.w !== w) { if (hits.size > 5000) hits.clear(); hits.set(ip, { w, n: 1 }); return true; }
  return ++h.n <= 30;
}

async function handle(request, info, env) {
  {
    const origin = request.headers.get('origin') || '';
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
    // Browsers always send Origin on the app's cross-origin fetch; requests without one are scripts, not the app.
    if (!isAllowedOrigin(origin)) return new Response('Origin not allowed', { status: 403, headers });
    // Per-IP rate limit (Workers Rate Limiting binding): stops one client from burning the free daily quota.
    if (!isolateAllow(request.headers.get('cf-connecting-ip') || 'unknown')) { info.host = 'rate-limited'; return new Response('Too many requests', { status: 429, headers: { ...headers, 'retry-after': '60' } }); }
    if (env?.LIMITER) {
      const { success } = await env.LIMITER.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
      if (!success) { info.host = 'rate-limited'; return new Response('Too many requests', { status: 429, headers: { ...headers, 'retry-after': '60' } }); }
    }
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
