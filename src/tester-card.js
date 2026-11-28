// Play Store tester invite on the home screen.
// TESTER_INVITE_UNTIL_LAUNCH: set to false when the app launches publicly — that single change hides the card.
// Shown only on Android browsers (not the installed Play/TWA app). × dismisses it for good (localStorage).
export const TESTER_INVITE_UNTIL_LAUNCH = true;
export const TESTER_GROUP_URL = 'https://groups.google.com/g/spitothiki-testers/about';
export const TESTER_PLAY_URL = 'https://play.google.com/apps/testing/com.oikoslabs.spitothiki';
export const TESTER_KEY = 'spitothiki:tester-card-done';
export const TWA_SESSION_KEY = 'spitothiki:in-play-app';

export function isAndroid(userAgent = '') {
  return /Android/i.test(String(userAgent));
}

export function isPlayApp({ search = '', referrer = '', session = null } = {}) {
  if (/(^|[?&])src=play(&|$)/i.test(String(search))) return true;
  if (String(referrer).startsWith('android-app://')) return true;
  try { return session?.getItem(TWA_SESSION_KEY) === '1'; } catch { return false; }
}

export function showTesterCard({
  playApp = false,
  android = false,
  done = false,
  untilLaunch = TESTER_INVITE_UNTIL_LAUNCH,
} = {}) {
  return Boolean(untilLaunch) && android && !playApp && !done;
}
