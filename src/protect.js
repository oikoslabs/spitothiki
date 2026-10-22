// v1.5.1: «protect your data» logic. Data is safe when the user is signed in (Firestore sync) OR has Google Drive
// backup connected. Only then nothing is shown; otherwise one merged home card, a one-time sheet and a Settings badge.
export const PROTECT_SEEN_KEY = 'spitothiki:protect-sheet-seen';
export const PROTECT_SNOOZE_KEY = 'spitothiki:protect-card-snooze';
export const PROTECT_SNOOZE_DAYS = 14;
const DAY = 86_400_000;

export const isProtected = ({ signedIn = false, driveOn = false } = {}) => Boolean(signedIn || driveOn);
// Sign-in state is still unknown while Firebase loads / connects: never nag before we know.
export function authKnown(status = {}) {
  if (status.user) return true;
  return ['signed-out', 'disabled', 'error'].includes(status.state);
}
export const storageMode = (opts) => (isProtected(opts) ? 'synced' : 'local');

export function showProtectCard({ signedIn, driveOn, known = true, snoozeUntil = 0, now = Date.now() } = {}) {
  if (!known || isProtected({ signedIn, driveOn })) return false;
  return !(snoozeUntil && now < Number(snoozeUntil));
}
export const snoozeUntilFrom = (now = Date.now(), days = PROTECT_SNOOZE_DAYS) => now + days * DAY;

// One-time sheet: first use (after the 3 onboarding questions) or the first launch of v1.5.1 for an unprotected user.
export function showProtectSheet({ signedIn, driveOn, known = true, seen = false, onboarding = false } = {}) {
  return Boolean(known && !seen && !onboarding && !isProtected({ signedIn, driveOn }));
}
