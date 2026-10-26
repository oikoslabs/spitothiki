// Spitothiki anonymous source counter (Cloudflare Worker + Workers Analytics Engine, free plan).
// Receives {type:'visit'|'signup', src:<one word>} and writes ONLY those two words to the dataset
// spitothiki_sources. It never reads, logs or stores the IP, headers, user agent or location of the request;
// observability/logs are off for this worker (see wrangler.toml).
import { EVENT_TYPES, SOURCE_WORDS, validEvent } from '../src/source.js';
export { EVENT_TYPES, SOURCE_WORDS };

const ORIGIN = /^https:\/\/spitothiki(--[a-z0-9-]{1,60})?\.web\.app$/;
export const allowedOrigin = (origin) => ORIGIN.test(String(origin || ''));

const cors = (origin) => ({ 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigin(origin)) return new Response('Forbidden', { status: 403 });
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/e') return new Response(null, { status: 404, headers });
    let body;
    try { const text = await request.text(); if (text.length > 200) throw new Error('size'); body = JSON.parse(text); } catch { return new Response(null, { status: 400, headers }); }
    const type = String(body?.type || ''); const src = String(body?.src || '');
    if (!validEvent(type, src)) return new Response(null, { status: 400, headers });
    try { env.SOURCES?.writeDataPoint({ indexes: [src], blobs: [type, src] }); } catch {}
    return new Response(null, { status: 204, headers });
  }
};
