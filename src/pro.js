// Pro entitlement. True only for the owner account (hashed email allowlist)
// or a preview-host unlock used for QA. Shaped so Play Billing can plug in later
// via refreshPro(user, { billingEntitled: true }) — no billing is wired yet.
// Never store or print emails, UIDs, or secrets here.

export const PREVIEW_UNLOCK_KEY = 'spitothiki:pro-preview';

// SHA-256 (hex) of the owner's signed-in email, lowercase + trimmed.
const OWNER_EMAIL_HASHES = new Set([
  '262e152d3dcc4a69d260b4df30b6cb4c60c4a6e6ef29c1cedc1f0cfdd94662bf'
]);

let entitled = false;
let source = 'none'; // 'owner' | 'preview' | 'billing' | 'none'

export function isPro() {
  return entitled;
}

export function proSource() {
  return source;
}

// Firebase Hosting preview channels are PROJECT--CHANNEL-HASH.web.app (a double hyphen).
// Live spitothiki.web.app must never honour a public unlock flag.
export function isPreviewHost(hostname) {
  const host = String(hostname ?? (typeof location !== 'undefined' ? location.hostname : '')).toLowerCase();
  return (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) && host.includes('--');
}

export async function hashEmail(email, subtle = globalThis.crypto?.subtle) {
  const value = String(email || '').trim().toLowerCase();
  if (!value || !subtle) return '';
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isOwnerHash(hash) {
  return OWNER_EMAIL_HASHES.has(String(hash || '').toLowerCase());
}

export function previewUnlockOn({ hostname, search, storage } = {}) {
  if (!isPreviewHost(hostname)) return false;
  try {
    const q = search ?? (typeof location !== 'undefined' ? location.search : '');
    if (new URLSearchParams(q).get('pro') === 'preview') return true;
    const store = storage ?? globalThis.localStorage;
    return store?.getItem(PREVIEW_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPreviewUnlock(on, { hostname, storage } = {}) {
  if (!isPreviewHost(hostname)) return false;
  try {
    const store = storage ?? globalThis.localStorage;
    if (on) store?.setItem(PREVIEW_UNLOCK_KEY, '1');
    else store?.removeItem(PREVIEW_UNLOCK_KEY);
    return true;
  } catch {
    return false;
  }
}

// user: { email, uid } from the existing sign-in status. billingEntitled is the future Play hook.
export async function refreshPro(user, { billingEntitled = false, hostname, search, storage, ownerHashes } = {}) {
  if (billingEntitled) {
    entitled = true;
    source = 'billing';
    return entitled;
  }
  const hash = await hashEmail(user?.email);
  const allowed = ownerHashes || OWNER_EMAIL_HASHES;
  if (hash && allowed.has(hash)) {
    entitled = true;
    source = 'owner';
    return entitled;
  }
  if (previewUnlockOn({ hostname, search, storage })) {
    entitled = true;
    source = 'preview';
    return entitled;
  }
  entitled = false;
  source = 'none';
  return entitled;
}

export function resetPro() {
  entitled = false;
  source = 'none';
}

export function proBadge() {
  return '<span class="pro-badge" title="Pro">Pro</span>';
}

export function renderProSoon({ title = 'Pro', intro = '', t = (s) => s, escapeHtml = (s) => String(s ?? '') } = {}) {
  const body = intro || 'Αυτό είναι λειτουργία Pro. Σύντομα θα ανοίξει για όλους. Αν έχεις ήδη πρόσβαση, συνδέσου με τον λογαριασμό σου.';
  return `<div class="pro-soon" id="pro-soon">
    <p class="pro-soon-badge">${proBadge()}</p>
    <h2>${escapeHtml(t(title))}</h2>
    <p>${escapeHtml(t(body))}</p>
    <p class="field-hint">${escapeHtml(t('Ό,τι είναι ήδη δωρεάν στη Σπιτοθήκη μένει δωρεάν — αυτή η ενότητα είναι επιπλέον.'))}</p>
  </div>`;
}

export const PRO_EN = {
  'Pro': 'Pro',
  'Αυτό είναι λειτουργία Pro. Σύντομα θα ανοίξει για όλους. Αν έχεις ήδη πρόσβαση, συνδέσου με τον λογαριασμό σου.': 'This is a Pro feature. It will open for everyone soon. If you already have access, sign in with your account.',
  'Ό,τι είναι ήδη δωρεάν στη Σπιτοθήκη μένει δωρεάν — αυτή η ενότητα είναι επιπλέον.': 'Everything already free in Spitothiki stays free — this section is extra.',
  'Σπιτοθήκη Pro': 'Spitothiki Pro',
  'Πρόσθετες λειτουργίες, προς το παρόν μόνο για τον κάτοχο της εφαρμογής. Αργότερα θα μπορούν να ξεκλειδωθούν με αγορά. Ό,τι είναι δωρεάν μένει δωρεάν.': 'Extra features, for now only for the app owner. Later they will be unlockable with a purchase. Everything that is free stays free.',
  'Έχεις πρόσβαση Pro σε αυτή τη συσκευή.': 'You have Pro access on this device.',
  'Συνδέσου με τον λογαριασμό κατόχου για να ξεκλειδώσεις το Pro, ή (μόνο στο preview) άνοιξέ το προσωρινά παρακάτω.': 'Sign in with the owner account to unlock Pro, or (preview only) turn it on temporarily below.',
  'Προσωρινό ξεκλείδωμα στο preview': 'Temporary preview unlock',
  'Μόνο σε αυτή τη διεύθυνση preview, σε αυτό το κινητό ή υπολογιστή. Δεν ισχύει στο spitothiki.web.app.': 'Only on this preview address, on this phone or computer. It does not apply on spitothiki.web.app.',
  'Ξεκλείδωσε το Pro στο preview': 'Unlock Pro on this preview',
  'Κλείδωσε ξανά': 'Lock again',
  'Φάρμακα': 'Medications',
  'Αναφορές': 'Reports',
  'Εισαγωγή κίνησης': 'Statement import',
  'Τεχνίτες': 'Tradespeople',
  'Σάρωση εγγράφου': 'Document scan'
};
