// Spitothiki push reminders (Cloudflare Worker + KV + daily cron). Free plan friendly, no Firebase Blaze needed.
// Privacy: the app sends only its Web Push address and a list of dates (YYYY-MM-DD) on which it has something
// to remind. No bill names, amounts or products leave the phone. On those dates the cron sends an empty
// ("tickle") Web Push signed with VAPID; the app's service worker builds the notification from local data.
const ALLOWED_ORIGINS = ['https://spitothiki.web.app', 'https://spitothiki.firebaseapp.com', 'http://localhost:8080', 'http://127.0.0.1:8080'];
export const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^[a-z0-9-]+\.push\.services\.mozilla\.com$/, /^[a-z0-9.-]+\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TTL = 70 * 86400;

export function validEndpoint(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname)) && value.length < 1000; } catch { return false; }
}
export function cleanDates(dates, today) {
  if (!Array.isArray(dates)) return [];
  return [...new Set(dates.filter((d) => typeof d === 'string' && DATE.test(d) && d >= today))].sort().slice(0, 120);
}
export const athensHour = (now = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(now));
export const athensToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(now);

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
async function sha(text) { return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }

let keyPromise;
function signingKey(env) {
  keyPromise ||= crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return keyPromise;
}
export async function vapidAuth(endpoint, env, now = Date.now()) {
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(env), new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${b64url(sig)}, k=${env.VAPID_PUBLIC}`;
}

async function sendTickle(endpoint, env) {
  return fetch(endpoint, { method: 'POST', headers: { TTL: '43200', Urgency: 'normal', Authorization: await vapidAuth(endpoint, env), 'Content-Length': '0' } });
}

function cors(origin) {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'method' }, 405, headers);
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) return json({ error: 'rate' }, 429, headers);
    let body; try { body = await request.json(); } catch { return json({ error: 'json' }, 400, headers); }
    const endpoint = String(body?.endpoint || '');
    if (!validEndpoint(endpoint)) return json({ error: 'endpoint' }, 400, headers);
    const key = await sha(endpoint);
    const path = new URL(request.url).pathname;
    if (path === '/unsubscribe') { await env.PUSH_SUBS.delete(key); return json({ ok: true }, 200, headers); }
    if (path === '/subscribe') {
      const dates = cleanDates(body.dates, athensToday());
      const old = await env.PUSH_SUBS.get(key, 'json');
      await env.PUSH_SUBS.put(key, JSON.stringify({ endpoint, dates, lastSent: old?.lastSent || '' }), { expirationTtl: TTL });
      if (body.test) { const r = await sendTickle(endpoint, env); console.log(`push test: ${r.status}`); return json({ ok: r.ok, status: r.status, count: dates.length }, 200, headers); }
      return json({ ok: true, count: dates.length }, 200, headers);
    }
    return json({ error: 'path' }, 404, headers);
  },

  async scheduled(event, env, ctx) {
    const when = new Date(event.scheduledTime);
    // Two crons (06:00 and 07:00 UTC); only the one that is 09:00 in Athens runs (summer: 06 UTC, winter: 07 UTC).
    if (athensHour(when) !== 9) return;
    const today = athensToday(when);
    let cursor; let sent = 0;
    do {
      const page = await env.PUSH_SUBS.list({ cursor });
      for (const { name } of page.keys) {
        const sub = await env.PUSH_SUBS.get(name, 'json');
        if (!sub?.dates?.includes(today) || sub.lastSent === today) continue;
        try {
          const res = await sendTickle(sub.endpoint, env);
          if (res.status === 404 || res.status === 410) { await env.PUSH_SUBS.delete(name); continue; }
          if (res.ok) { sent += 1; await env.PUSH_SUBS.put(name, JSON.stringify({ ...sub, dates: sub.dates.filter((d) => d > today), lastSent: today }), { expirationTtl: TTL }); }
        } catch {}
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    console.log(`push: ${today} sent ${sent}`);
  }
};
