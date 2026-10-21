// Push reminders (app closed). The Cloudflare Worker «spitothiki-push» only learns the push address and the
// dates that need a reminder; on those mornings it wakes the service worker, which builds the text locally.
export const PUSH_URL = 'https://spitothiki-push.cornerstore553.workers.dev';
export const VAPID_PUBLIC = 'BIdTZDXO2Xq81aSHMGLX1znbzY3u1aH9MGKqG-IavVGpz2MyP8BQ8lbfAUulAQu_ZFJWN1slv4tj6xPKb4uesLg';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// Dates (today … +90 days) on which something is due: bills (remind days before + the due day, not direct debit,
// not paid) and pantry expiries (`days` before; or today if already inside the window).
export function pushDates({ bills = [], items = [] } = {}, { days = 3, today }) {
  const end = addDays(today, 90);
  const out = new Set();
  const add = (d) => { const x = d < today ? today : d; if (x <= end) out.add(x); };
  for (const b of bills) {
    if (b.paid || b.autoPay || !DATE.test(String(b.due || ''))) continue;
    if (b.due < today) continue;
    add(addDays(b.due, -Math.max(0, Number(b.remind ?? 3) || 0)));
    add(b.due);
  }
  for (const i of items) {
    if (!DATE.test(String(i.expiry || '')) || i.expiry < today) continue;
    add(addDays(i.expiry, -Math.max(0, Number(days) || 0)));
  }
  return [...out].sort().slice(0, 120);
}

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

function keyBytes(b64) { const s = b64.replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(s + '='.repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); }

export async function pushSubscription(create = false) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub || !create) return sub;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) });
}

export async function syncPush(dates, { test = false, fetchImpl = fetch } = {}) {
  const sub = await pushSubscription(false);
  if (!sub) return null;
  const res = await fetchImpl(`${PUSH_URL}/subscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, dates, test }) });
  if (!res.ok) throw new Error(`push ${res.status}`);
  return res.json();
}

export async function stopPush() {
  const sub = await pushSubscription(false).catch(() => null);
  if (!sub) return;
  await fetch(`${PUSH_URL}/unsubscribe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
