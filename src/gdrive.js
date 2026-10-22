// v1.5: backup to the user's own Google Drive (hidden appDataFolder, scope drive.appdata only).
// No backend: Google Identity Services gives a short-lived access token in the browser.
// The Drive REST helpers take `fetch` and `getToken` so they are unit-tested with mocks.
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const DRIVE_PREFIX = 'spitothiki-backup-';
export const DRIVE_KEEP = 5;
export const DRIVE_ENABLED_KEY = 'spitothiki:drive-enabled';
export const DRIVE_AUTO_KEY = 'spitothiki:drive-auto';
export const DRIVE_LAST_KEY = 'spitothiki:drive-last';
export const DRIVE_HASH_KEY = 'spitothiki:drive-hash';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DAY = 86400000;

export class DriveError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'DriveError'; this.status = status; }
}

export function driveMessage(status, body = '') {
  if (status === 401) return 'Η σύνδεση με το Google Drive έληξε. Σύνδεσε ξανά.';
  if (status === 403 && /accessNotConfigured|has not been used|disabled/i.test(body)) return 'Το Google Drive δεν έχει ενεργοποιηθεί ακόμα για τη Σπιτοθήκη.';
  if (status === 403 && /storageQuota|quota/i.test(body)) return 'Το Google Drive σου είναι γεμάτο.';
  if (status === 403) return 'Το Google Drive αρνήθηκε την πρόσβαση. Σύνδεσε ξανά.';
  if (status === 404) return 'Το αντίγραφο δεν βρέθηκε στο Drive.';
  return 'Δεν ήταν δυνατή η επικοινωνία με το Google Drive. Δοκίμασε ξανά.';
}

// Calls Drive with a bearer token; on 401 asks once for a fresh token (silent re-auth) and retries.
export function createDriveClient({ fetch: f = globalThis.fetch, getToken }) {
  async function call(url, init = {}, retry = true) {
    const token = await getToken(false);
    let res;
    try { res = await f(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } }); }
    catch { throw new DriveError(driveMessage(0), 0); }
    if (res.status === 401 && retry) { await getToken(true); return call(url, init, false); }
    if (!res.ok) { const body = await res.text().catch(() => ''); throw new DriveError(driveMessage(res.status, body), res.status); }
    return res;
  }
  async function list() {
    const q = encodeURIComponent(`name contains '${DRIVE_PREFIX}' and trashed = false`);
    const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&orderBy=createdTime%20desc&pageSize=50&fields=files(id,name,size,createdTime)`);
    const { files = [] } = await res.json();
    return files.filter((x) => String(x.name || '').startsWith(DRIVE_PREFIX)).sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  }
  async function upload(text, name = `${DRIVE_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.spitobak`) {
    const boundary = `spito${Math.random().toString(36).slice(2)}`;
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/octet-stream' })}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${text}\r\n--${boundary}--`;
    const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=id,name,size,createdTime`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return res.json();
  }
  async function download(id) { return (await call(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text(); }
  async function remove(id) { await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  // Keep only the newest `keep` versions.
  async function prune(keep = DRIVE_KEEP) {
    const files = await list();
    const old = files.slice(keep);
    for (const file of old) await remove(file.id);
    return old.length;
  }
  return { list, upload, download, remove, prune };
}

// Small, stable fingerprint of the data so auto-backup only uploads when something changed.
export function stateHash(state) {
  const text = JSON.stringify(state ?? null);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${(h >>> 0).toString(16)}-${text.length}`;
}

// Auto-backup at most once a day, only if the data changed since the last Drive backup.
export function autoBackupDue({ enabled, auto, hasKey, lastAt = 0, lastHash = '', hash, now = Date.now() }) {
  if (!enabled || !auto || !hasKey) return false;
  if (lastHash && lastHash === hash) return false;
  return !lastAt || now - lastAt >= DAY;
}

// Token cache with expiry (kept in memory only).
export function tokenValid(token, now = Date.now()) {
  return Boolean(token && token.value && token.expiresAt - 60000 > now);
}
