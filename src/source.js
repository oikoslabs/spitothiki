// v1.8.2: anonymous count of where people came from (TikTok, Facebook, …), e.g. spitothiki.web.app/?src=tiktok
// Privacy: only ONE word (the source) is kept on the device and sent once, with the event type ('visit' or
// 'signup'). No user id, email, device info or time is sent; no third-party pixel/SDK; nothing goes to Firestore.
// Fire-and-forget: never blocks the app, never shows an error; offline = try again on a later open.
export const STATS_URL = 'https://spitothiki-stats.cornerstore553.workers.dev/e';
export const SOURCES = ['tiktok', 'facebook', 'instagram', 'telegram', 'viber', 'reddit', 'pinterest', 'sofisstore'];
export const SOURCE_WORDS = [...SOURCES, 'other', 'direct', 'existing'];
export const EVENT_TYPES = ['visit', 'signup'];
export const SOURCE_KEY = 'spitothiki:src';
const TRACK_PARAMS = /^(src|utm_[a-z_]+|fbclid|ttclid|gclid)$/i;
const LIVE_ORIGIN = /^https:\/\/spitothiki(--[a-z0-9-]{1,60})?\.web\.app$/;

export const isStatsOrigin = (origin) => LIVE_ORIGIN.test(String(origin || ''));
export const validEvent = (type, src) => EVENT_TYPES.includes(type) && SOURCE_WORDS.includes(src);

// '?src=TikTok' -> 'tiktok'; '?utm_source=sofisstore' -> 'sofisstore'; unknown -> 'other'; nothing -> 'direct'.
export function parseSource(search = '') {
  const params = new URLSearchParams(String(search || ''));
  const raw = (params.get('src') || params.get('utm_source') || '').trim().toLowerCase();
  if (!raw) return 'direct';
  return SOURCES.includes(raw) ? raw : 'other';
}

// The address without ?src / utm_* (and ad click ids), keeping the path, other params and the #view.
export function cleanUrl(href) {
  const url = new URL(href);
  const keys = [...url.searchParams.keys()].filter((key) => TRACK_PARAMS.test(key));
  if (!keys.length) return null;
  for (const key of keys) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

function read(storage) { try { return JSON.parse(storage.getItem(SOURCE_KEY) || 'null'); } catch { return null; } }
function write(storage, value) { try { storage.setItem(SOURCE_KEY, JSON.stringify(value)); } catch {} }

export async function sendEvent(type, src, { fetchImpl = globalThis.fetch, online = globalThis.navigator?.onLine !== false, origin = globalThis.location?.origin } = {}) {
  if (!online || !isStatsOrigin(origin) || !validEvent(type, src) || typeof fetchImpl !== 'function') return false;
  try {
    // text/plain = no CORS preflight; credentials omitted; keepalive so it finishes even if the page closes.
    const res = await fetchImpl(STATS_URL, { method: 'POST', body: JSON.stringify({ type, src }), headers: { 'content-type': 'text/plain' }, credentials: 'omit', keepalive: true, referrerPolicy: 'no-referrer' });
    return Boolean(res?.ok);
  } catch { return false; }
}

// First open on this device: remember the source word and send one 'visit'. Devices that already used the app
// before v1.8.2 are marked 'existing' and send nothing. Then the ?src/utm params leave the address bar.
export async function initSource({ storage = globalThis.localStorage, loc = globalThis.location, hist = globalThis.history, hasData = false, send = sendEvent } = {}) {
  try {
    const clean = loc && cleanUrl(loc.href);
    let saved = read(storage);
    if (!saved) {
      saved = hasData ? { src: 'existing', visit: true } : { src: parseSource(loc?.search), visit: false };
      write(storage, saved);
    }
    if (clean && hist?.replaceState) { try { hist.replaceState(hist.state ?? null, '', clean); } catch {} }
    if (!saved.visit && await send('visit', saved.src)) write(storage, { ...read(storage), visit: true });
  } catch {}
}

// A brand-new account/household was created (once per device).
export async function sourceSignup({ storage = globalThis.localStorage, send = sendEvent } = {}) {
  try {
    const saved = read(storage) || { src: 'direct', visit: true };
    if (saved.signup) return;
    if (await send('signup', SOURCE_WORDS.includes(saved.src) ? saved.src : 'other')) write(storage, { ...saved, signup: true });
  } catch {}
}
