// v1.9.5: small, dismissible invite to join the Google Play closed test. Shown only in an Android browser,
// never inside the installed Play app (TWA). Hidden for good after × or the button (localStorage).
// Privacy: nothing is collected by the app; the button only opens the user's own mail app (they choose to send).
export const TESTER_KEY = 'spitothiki:tester-card-done';
export const TESTER_EMAIL = 'oikoslabs.apps@gmail.com';
export const TWA_SESSION_KEY = 'spitothiki:in-play-app';

export function isPlayApp({ search = '', referrer = '', session = null } = {}) {
  if (/(^|[?&])src=play(&|$)/i.test(String(search))) return true;
  if (String(referrer).startsWith('android-app://')) return true;
  try { return session?.getItem(TWA_SESSION_KEY) === '1'; } catch { return false; }
}

export function showTesterCard({ userAgent = '', playApp = false, done = false } = {}) {
  return /Android/i.test(String(userAgent)) && !playApp && !done;
}

export function testerMailto(subject, body) {
  return `mailto:${TESTER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
