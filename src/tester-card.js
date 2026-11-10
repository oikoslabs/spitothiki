// Play Store tester invite on the home screen.
// TESTER_INVITE_UNTIL_LAUNCH: set to false when the app launches publicly — that single change hides the card.
// Until then the invite stays visible for everyone (except the installed Play/TWA app), even if they dismissed
// it in the past. × only collapses it to a one-line banner; it never disappears completely.
export const TESTER_INVITE_UNTIL_LAUNCH = true;
export const TESTER_GROUP_URL = 'https://groups.google.com/g/spitothiki-testers/about';
export const TESTER_PLAY_URL = 'https://play.google.com/apps/testing/com.oikoslabs.spitothiki';
export const TESTER_KEY = 'spitothiki:tester-card-done'; // leftover from the old dismiss; ignored while the flag is on
export const TESTER_COLLAPSE_KEY = 'spitothiki:tester-card-collapsed';
export const TWA_SESSION_KEY = 'spitothiki:in-play-app';

export function isPlayApp({ search = '', referrer = '', session = null } = {}) {
  if (/(^|[?&])src=play(&|$)/i.test(String(search))) return true;
  if (String(referrer).startsWith('android-app://')) return true;
  try { return session?.getItem(TWA_SESSION_KEY) === '1'; } catch { return false; }
}

export function showTesterCard({ playApp = false, untilLaunch = TESTER_INVITE_UNTIL_LAUNCH } = {}) {
  return Boolean(untilLaunch) && !playApp;
}
