// v1.9.5: small, dismissible invite to join the Google Play closed test. Shown only in an Android browser,
// never inside the installed Play app (TWA). Hidden for good after × or the button (localStorage).
// v1.9.19: two clear steps (Google Group, then Play opt-in) instead of an email. Opening a link does NOT hide the card
// and does not mean the user is a tester (the app cannot know). Only × hides it. Nothing is collected by the app.
export const TESTER_GROUP_URL = 'https://groups.google.com/g/spitothiki-testers/about';
export const TESTER_PLAY_URL = 'https://play.google.com/apps/testing/com.oikoslabs.spitothiki';
export const TESTER_KEY = 'spitothiki:tester-card-done';
export const TWA_SESSION_KEY = 'spitothiki:in-play-app';

export function isPlayApp({ search = '', referrer = '', session = null } = {}) {
  if (/(^|[?&])src=play(&|$)/i.test(String(search))) return true;
  if (String(referrer).startsWith('android-app://')) return true;
  try { return session?.getItem(TWA_SESSION_KEY) === '1'; } catch { return false; }
}

export function showTesterCard({ userAgent = '', playApp = false, done = false } = {}) {
  return /Android/i.test(String(userAgent)) && !playApp && !done;
}

