// v1.8.2: anonymous count of where people came from (TikTok, Facebook, …), e.g. spitothiki.web.app/?src=tiktok
// Privacy: only ONE word (the source) is kept on the device and sent once, with the event type ('visit' or
// 'signup'), plus an optional t=1 flag when the event is a test (preview host or the signed-in owner).
// No user id, email, device info, IP or time is sent; no third-party pixel/SDK; nothing goes to Firestore.
// Fire-and-forget: never blocks the app, never shows an error; offline = try again on a later open.
import { classifyStore } from './receipt-store.js';
export const STATS_URL = 'https://spitothiki-stats.cornerstore553.workers.dev/e';
export const SOURCES = ['tiktok', 'facebook', 'instagram', 'telegram', 'viber', 'reddit', 'pinterest', 'sofisstore', 'play'];
export const SOURCE_WORDS = [...SOURCES, 'other', 'direct', 'existing'];
export const EVENT_TYPES = ['visit', 'signup'];
// v1.8.9: 'play' = opened from the Google Play app (Android, start address /?src=play).
export const SOURCE_KEY = 'spitothiki:src';
const TRACK_PARAMS = /^(src|utm_[a-z_]+|fbclid|ttclid|gclid)$/i;
// v1.8.3: short links people can type (TikTok bio is not clickable): /tiktok, /TikTok/, … = ?src=tiktok.
// Firebase Hosting redirects them (302) to /?src=<word>; the service worker does the same offline; this is the fallback.
export const SHORT_PATH = new RegExp(`^/(${SOURCES.join('|')})/?$`, 'i');
const LIVE_ORIGIN = /^https:\/\/spitothiki(--[a-z0-9-]{1,60})?\.web\.app$/;

export const isStatsOrigin = (origin) => LIVE_ORIGIN.test(String(origin || ''));
export const validEvent = (type, src) => EVENT_TYPES.includes(type) && SOURCE_WORDS.includes(src);

export function isPreviewOrigin(origin) {
  try {
    const host = new URL(String(origin || '')).hostname.toLowerCase();
    return (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) && host.startsWith('spitothiki--');
  } catch {
    return false;
  }
}

let ownerTestFlag = false;
export function setOwnerTestFlag(on) { ownerTestFlag = Boolean(on); }
export function isStatsTest({ origin, test } = {}) {
  if (test === true || test === 1 || test === '1') return true;
  if (ownerTestFlag) return true;
  const src = origin ?? (typeof location !== 'undefined' ? location.origin : '');
  return isPreviewOrigin(src);
}

// '?src=TikTok' -> 'tiktok'; '?utm_source=sofisstore' -> 'sofisstore'; unknown -> 'other'; nothing -> 'direct'.
export function parseSource(search = '', pathname = '/') {
  const params = new URLSearchParams(String(search || ''));
  const short = String(pathname || '').match(SHORT_PATH)?.[1] || '';
  const raw = (params.get('src') || params.get('utm_source') || short).trim().toLowerCase();
  if (!raw) return 'direct';
  return SOURCES.includes(raw) ? raw : 'other';
}

// The address without ?src / utm_* (and ad click ids), keeping the path, other params and the #view.
export function cleanUrl(href) {
  const url = new URL(href);
  const keys = [...url.searchParams.keys()].filter((key) => TRACK_PARAMS.test(key));
  const short = SHORT_PATH.test(url.pathname);
  if (!keys.length && !short) return null;
  if (short) url.pathname = '/';
  for (const key of keys) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

function read(storage) { try { return JSON.parse(storage.getItem(SOURCE_KEY) || 'null'); } catch { return null; } }
function write(storage, value) { try { storage.setItem(SOURCE_KEY, JSON.stringify(value)); } catch {} }

export async function sendEvent(type, src, { fetchImpl = globalThis.fetch, online = globalThis.navigator?.onLine !== false, origin = globalThis.location?.origin, test } = {}) {
  if (!online || !isStatsOrigin(origin) || !validEvent(type, src) || typeof fetchImpl !== 'function') return false;
  try {
    // text/plain = no CORS preflight; credentials omitted; keepalive so it finishes even if the page closes.
    const body = isStatsTest({ origin, test }) ? { type, src, t: 1 } : { type, src };
    const res = await fetchImpl(STATS_URL, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'text/plain' }, credentials: 'omit', keepalive: true, referrerPolicy: 'no-referrer' });
    return Boolean(res?.ok);
  } catch { return false; }
}

// First open on this device: remember the source word and send one 'visit'. Devices that already used the app
// before v1.8.2 are marked 'existing' and send nothing. Then the ?src/utm params leave the address bar.
export async function initSource({ storage = globalThis.localStorage, loc = globalThis.location, hist = globalThis.history, hasData = false, send = sendEvent, sendScan = sendScanEvent } = {}) {
  try {
    const clean = loc && cleanUrl(loc.href);
    let saved = read(storage);
    if (!saved) {
      saved = hasData ? { src: 'existing', visit: true } : { src: parseSource(loc?.search, loc?.pathname), visit: false };
      write(storage, saved);
    }
    if (clean && hist?.replaceState) { try { hist.replaceState(hist.state ?? null, '', clean); } catch {} }
    if (!saved.visit && await send('visit', saved.src)) write(storage, { ...read(storage), visit: true });
    await flushScans({ storage, sendScan });
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

// v1.9.23: one anonymous count when a receipt is read on the device (AADE, photo, or a direct
// provider fetch that never used the proxy). Body is only {type, store, success, via} — no URL,
// amounts, user or household ids. Optional t=1 marks a test (preview or owner). Offline events are queued and retried on a later open.
export const SCAN_KEY = 'spitothiki:pending-scans';
export const SCAN_KINDS = ['supermarket', 'fuel', 'toll', 'other'];
export const SCAN_VIA = ['aade', 'photo', 'direct', 'on-device'];
const word = (v, max = 40) => String(v ?? '').replace(/[^\p{L}\p{N} ._:/-]/gu, '').trim().slice(0, max);
const readScans = (storage) => { try { const rows = JSON.parse(storage.getItem(SCAN_KEY) || '[]'); return Array.isArray(rows) ? rows : []; } catch { return []; } };
const writeScans = (storage, rows) => { try { storage.setItem(SCAN_KEY, JSON.stringify(rows.slice(0, 20))); } catch {} };

export function validScan(event) {
  return Boolean(event && SCAN_KINDS.includes(event.type) && typeof event.success === 'boolean' && SCAN_VIA.includes(event.via || 'on-device'));
}

export async function sendScanEvent(event, { fetchImpl = globalThis.fetch, online = globalThis.navigator?.onLine !== false, origin = globalThis.location?.origin, test } = {}) {
  const via = SCAN_VIA.includes(event?.via) ? event.via : 'on-device';
  const type = SCAN_KINDS.includes(event?.type) ? event.type : '';
  if (!online || !isStatsOrigin(origin) || !type || typeof event?.success !== 'boolean' || typeof fetchImpl !== 'function') return false;
  try {
    const body = { type, store: word(event.store), success: event.success, via };
    if (isStatsTest({ origin, test })) body.t = 1;
    const res = await fetchImpl(STATS_URL, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'text/plain' }, credentials: 'omit', keepalive: true, referrerPolicy: 'no-referrer' });
    return Boolean(res?.ok);
  } catch { return false; }
}

export async function flushScans({ storage = globalThis.localStorage, sendScan = sendScanEvent } = {}) {
  const rows = readScans(storage);
  if (!rows.length) return 0;
  const left = [];
  for (const event of rows) {
    if (!validScan(event)) continue;
    if (!await sendScan(event)) left.push(event);
  }
  writeScans(storage, left);
  return rows.length - left.length;
}

// Fire-and-forget. If the lookup already went through the receipt proxy, do nothing (it was counted there).
export async function reportScan({ receipt, text = '', success, via, proxied } = {}, { storage = globalThis.localStorage, sendScan = sendScanEvent } = {}) {
  try {
    if (proxied || via === 'proxy') return false;
    const viaWord = SCAN_VIA.includes(via) ? via : 'on-device';
    const found = classifyStore(`${receipt?.issuerName || ''} ${text}`, '');
    const event = { type: found.type, store: found.store, success: Boolean(success), via: viaWord };
    if (await sendScan(event)) return true;
    writeScans(storage, [...readScans(storage), event]);
    return false;
  } catch { return false; }
}
