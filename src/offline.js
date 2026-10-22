// v1.4: offline helpers: queued receipt QR links, backup reminder, network-error detection. Unit-tested.
export const QUEUE_KEY = 'spitothiki:receipt-queue';
export const LAST_BACKUP_KEY = 'spitothiki:last-backup';
export const BACKUP_SNOOZE_KEY = 'spitothiki:backup-snooze';
const DAY = 86400000;

export function loadQueue(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage?.getItem(QUEUE_KEY) || '[]'); return Array.isArray(v) ? v.filter((e) => e && typeof e.link === 'string') : []; } catch { return []; }
}
export function saveQueue(list, storage = globalThis.localStorage) { try { storage?.setItem(QUEUE_KEY, JSON.stringify(list)); } catch {} }
export function enqueue(list, link, now = new Date().toISOString()) {
  const value = String(link || '').trim();
  if (!value || list.some((e) => e.link === value)) return list;
  return [...list, { link: value, savedAt: now }];
}
export function dequeue(list, link) { return list.filter((e) => e.link !== link); }

export function isNetworkError(error, online = globalThis.navigator?.onLine) {
  if (online === false) return true;
  if (!error) return false;
  if (error.cors) return false;
  return error.name === 'TypeError' || /Failed to fetch|NetworkError|Load failed|network/i.test(String(error.message || ''));
}

// Show the reminder when not signed in, there is data, and (never backed up or >30 days) and not snoozed.
export function backupReminderDue({ signedIn, hasData, lastBackup = 0, snoozeUntil = 0, now = Date.now() }) {
  if (signedIn || !hasData) return false;
  if (snoozeUntil && now < snoozeUntil) return false;
  return !lastBackup || now - lastBackup > 30 * DAY;
}
export function hasData(state) {
  return ['items', 'receipts', 'purchases', 'bills', 'transport', 'extras'].some((k) => Array.isArray(state?.[k]) && state[k].length > 0);
}
