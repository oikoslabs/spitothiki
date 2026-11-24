// iOS / iPadOS install hint. There is no beforeinstallprompt on WebKit
// (Safari, Chrome/CriOS, Brave, Firefox/FxiOS, Edge/EdgiOS), so the app
// shows a short, dismissible “add to Home Screen” card instead.
// Desktop testing: append ?ios-hint=1 (or ?ios-hint=safari|chrome|brave|firefox|edge|other).

export const IOS_INSTALL_DISMISS_KEY = 'spitothiki:ios-install-hint-dismissed';

export const IOS_INSTALL_TITLE = 'Βάλε τη Σπιτοθήκη στην αρχική οθόνη';
export const IOS_INSTALL_INTRO = 'Στο iPhone και το iPad δεν υπάρχει κουμπί «Εγκατάσταση». Γίνεται από το μενού κοινοποίησης.';
export const IOS_INSTALL_CLOSE = 'Απόκρυψη οδηγιών εγκατάστασης';
export const IOS_INSTALL_RESHOW = 'Δείξε ξανά τις οδηγίες στην αρχική';
export const IOS_INSTALL_SETTINGS = 'Προσθήκη στην οθόνη Αφετηρίας (iPhone / iPad)';

export const IOS_INSTALL_STEPS = {
  safari: 'Στο Safari: πάτα το κουμπί κοινοποίησης (τετράγωνο με βελάκι πάνω) → «Προσθήκη στην οθόνη Αφετηρίας» → «Προσθήκη».',
  chrome: 'Στο Chrome: πάτα κοινοποίηση (πάνω δεξιά ή στο μενού ⋯) → «Προσθήκη στην οθόνη Αφετηρίας». Αν δεν υπάρχει, άνοιξε τη σελίδα στο Safari.',
  brave: 'Στο Brave: πάτα κοινοποίηση (πάνω δεξιά ή στο μενού ⋯) → «Προσθήκη στην οθόνη Αφετηρίας». Αν δεν υπάρχει, άνοιξε τη σελίδα στο Safari.',
  firefox: 'Στο Firefox: πάτα κοινοποίηση (πάνω δεξιά ή στο μενού ⋯) → «Προσθήκη στην οθόνη Αφετηρίας». Αν δεν υπάρχει, άνοιξε τη σελίδα στο Safari.',
  edge: 'Στο Edge: πάτα κοινοποίηση (πάνω δεξιά ή στο μενού ⋯) → «Προσθήκη στην οθόνη Αφετηρίας». Αν δεν υπάρχει, άνοιξε τη σελίδα στο Safari.',
  other: 'Πάτα κοινοποίηση (πάνω δεξιά ή στο μενού ⋯) → «Προσθήκη στην οθόνη Αφετηρίας». Αν δεν υπάρχει, άνοιξε τη σελίδα στο Safari.'
};

export const IOS_INSTALL_OTHER = {
  safari: 'Σε Chrome, Brave ή άλλο browser: πάτα κοινοποίηση (πάνω δεξιά ή στο μενού ⋯) → «Προσθήκη στην οθόνη Αφετηρίας». Αν δεν υπάρχει, άνοιξε τη σελίδα στο Safari.',
  other: 'Στο Safari: πάτα το κουμπί κοινοποίησης (τετράγωνο με βελάκι πάνω) → «Προσθήκη στην οθόνη Αφετηρίας» → «Προσθήκη».'
};

export const IOS_INSTALL_EN = {
  [IOS_INSTALL_TITLE]: 'Add Spitothiki to your home screen',
  [IOS_INSTALL_INTRO]: 'On iPhone and iPad there is no «Install» button. You add it from the share menu.',
  [IOS_INSTALL_CLOSE]: 'Hide the install instructions',
  [IOS_INSTALL_RESHOW]: 'Show the instructions on the home screen again',
  [IOS_INSTALL_SETTINGS]: 'Add to the Home Screen (iPhone / iPad)',
  [IOS_INSTALL_STEPS.safari]: 'In Safari: tap the share button (square with an arrow up) → “Add to Home Screen” → “Add”.',
  [IOS_INSTALL_STEPS.chrome]: 'In Chrome: tap share (top right or in the ⋯ menu) → “Add to Home Screen”. If it is not there, open the page in Safari.',
  [IOS_INSTALL_STEPS.brave]: 'In Brave: tap share (top right or in the ⋯ menu) → “Add to Home Screen”. If it is not there, open the page in Safari.',
  [IOS_INSTALL_STEPS.firefox]: 'In Firefox: tap share (top right or in the ⋯ menu) → “Add to Home Screen”. If it is not there, open the page in Safari.',
  [IOS_INSTALL_STEPS.edge]: 'In Edge: tap share (top right or in the ⋯ menu) → “Add to Home Screen”. If it is not there, open the page in Safari.',
  [IOS_INSTALL_STEPS.other]: 'Tap share (top right or in the ⋯ menu) → “Add to Home Screen”. If it is not there, open the page in Safari.',
  [IOS_INSTALL_OTHER.safari]: 'In Chrome, Brave or another browser: tap share (top right or in the ⋯ menu) → “Add to Home Screen”. If it is not there, open the page in Safari.',
  [IOS_INSTALL_OTHER.other]: 'In Safari: tap the share button (square with an arrow up) → “Add to Home Screen” → “Add”.'
};

const BROWSERS = ['safari', 'chrome', 'brave', 'firefox', 'edge', 'other'];

export function isIosDevice({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ua = String(userAgent);
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  // iPadOS 13+ often reports a desktop Mac UA. Touch points distinguish it from a real Mac.
  if (String(platform) === 'MacIntel' && Number(maxTouchPoints) > 1) return true;
  return false;
}

export function iosBrowser(userAgent = '') {
  const ua = String(userAgent);
  if (/CriOS/i.test(ua)) return 'chrome';
  if (/FxiOS/i.test(ua)) return 'firefox';
  if (/EdgiOS/i.test(ua) || /Edg\//i.test(ua)) return 'edge';
  if (/Brave/i.test(ua)) return 'brave';
  // iPadOS desktop-mode Chrome may expose Chrome/ without CriOS. Safari never has Chrome/.
  if (/Chrome\//i.test(ua) && !/OPR|Opera|OPiOS/i.test(ua)) return 'chrome';
  if (/Version\/[\d.]+.*Safari\//i.test(ua) || (/Safari\//i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Brave|OPR|OPiOS/i.test(ua))) return 'safari';
  return 'other';
}

export function isStandalone({ standalone = false, displayModeStandalone = false } = {}) {
  return Boolean(standalone) || Boolean(displayModeStandalone);
}

export function iosHintParam(search = '') {
  const raw = String(search || '');
  let query = raw;
  if (/^[a-z]+:\/\//i.test(raw)) {
    try { query = new URL(raw).search; } catch { query = raw; }
  }
  if (query.startsWith('?')) query = query.slice(1);
  const value = new URLSearchParams(query).get('ios-hint');
  if (value == null || value === '' || value === '0' || /^false|no|off$/i.test(value)) return null;
  const browser = String(value).toLowerCase();
  if (BROWSERS.includes(browser)) return { force: true, browser };
  return { force: true, browser: null };
}

export function shouldShowIosInstallHint({
  userAgent = '',
  platform = '',
  maxTouchPoints = 0,
  standalone = false,
  displayModeStandalone = false,
  dismissed = false,
  search = '',
  forceOnce = false
} = {}) {
  if (forceOnce) return true;
  if (iosHintParam(search)?.force) return true;
  if (!isIosDevice({ userAgent, platform, maxTouchPoints })) return false;
  if (isStandalone({ standalone, displayModeStandalone })) return false;
  if (dismissed) return false;
  return true;
}

export function iosInstallBrowserForHint({ userAgent = '', search = '' } = {}) {
  return iosHintParam(search)?.browser || iosBrowser(userAgent);
}

export function iosInstallCopy(browser = 'other') {
  const kind = BROWSERS.includes(browser) ? browser : 'other';
  const primary = IOS_INSTALL_STEPS[kind] || IOS_INSTALL_STEPS.other;
  const secondary = kind === 'safari' ? IOS_INSTALL_OTHER.safari : IOS_INSTALL_OTHER.other;
  return { title: IOS_INSTALL_TITLE, intro: IOS_INSTALL_INTRO, primary, secondary };
}

export function iosInstallDismissed(storage) {
  try { return storage?.getItem?.(IOS_INSTALL_DISMISS_KEY) === '1'; } catch { return false; }
}

export function dismissIosInstallHint(storage) {
  try { storage?.setItem?.(IOS_INSTALL_DISMISS_KEY, '1'); } catch {}
}

export function clearIosInstallDismiss(storage) {
  try { storage?.removeItem?.(IOS_INSTALL_DISMISS_KEY); } catch {}
}
