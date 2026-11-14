// Owner check used to tag anonymous stats as test (t=1) when the signed-in
// user is the app owner. Comparison is against SHA-256 of the lowercase
// trimmed email — the same allowlist shape as the Pro preview entitlement.
// Never send, store, log, or print the email, uid, or hash.

export async function hashEmail(email, subtle = globalThis.crypto?.subtle) {
  const value = String(email || '').trim().toLowerCase();
  if (!value || !subtle) return '';
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const OWNER_EMAIL_HASHES = new Set([
'262e152d3dcc4a69d260b4df30b6cb4c60c4a6e6ef29c1cedc1f0cfdd94662bf'
]);

export function isOwnerHash(hash, hashes = OWNER_EMAIL_HASHES) {
  return hashes.has(String(hash || '').toLowerCase());
}

export async function isOwnerEmail(email, hashes = OWNER_EMAIL_HASHES, subtle) {
  const hash = await hashEmail(email, subtle);
  return Boolean(hash && isOwnerHash(hash, hashes));
}

export function isPreviewHost(hostname) {
  const host = String(hostname ?? (typeof location !== 'undefined' ? location.hostname : '')).toLowerCase();
  return (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) && host.includes('--');
}
