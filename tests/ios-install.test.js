import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IOS_INSTALL_DISMISS_KEY,
  IOS_INSTALL_EN,
  IOS_INSTALL_OTHER,
  IOS_INSTALL_SETTINGS,
  IOS_INSTALL_STEPS,
  IOS_INSTALL_TITLE,
  clearIosInstallDismiss,
  dismissIosInstallHint,
  iosBrowser,
  iosHintParam,
  iosInstallBrowserForHint,
  iosInstallCopy,
  iosInstallDismissed,
  isIosDevice,
  isStandalone,
  shouldShowIosInstallHint
} from '../src/ios-install.js';
import { dictionaries } from '../src/i18n.js';
import { GUIDE_SECTIONS } from '../src/guide.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1';
const IPHONE_BRAVE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Brave/1.70 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15';
const IPHONE_EDGE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/129.0.2792.70 Mobile/15E148 Safari/605.1.15';
const IPAD_SAFARI = 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
const IPADOS_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';
const IPADOS_DESKTOP_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Safari/604.1';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

test('isIosDevice: iPhone, iPad, iPod, and iPadOS desktop UA with touches', () => {
  assert.equal(isIosDevice({ userAgent: IPHONE_SAFARI }), true);
  assert.equal(isIosDevice({ userAgent: IPHONE_CHROME }), true);
  assert.equal(isIosDevice({ userAgent: IPAD_SAFARI }), true);
  assert.equal(isIosDevice({ userAgent: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 14_0 like Mac OS X)' }), true);
  assert.equal(isIosDevice({ userAgent: IPADOS_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isIosDevice({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 }), false);
  assert.equal(isIosDevice({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 1 }), false);
  assert.equal(isIosDevice({ platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(isIosDevice({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l', maxTouchPoints: 5 }), false);
  assert.equal(isIosDevice({ userAgent: DESKTOP_CHROME, platform: 'Win32', maxTouchPoints: 0 }), false);
});

test('iosBrowser: Safari, CriOS, Brave, FxiOS, EdgiOS, and iPad desktop Chrome', () => {
  assert.equal(iosBrowser(IPHONE_SAFARI), 'safari');
  assert.equal(iosBrowser(IPAD_SAFARI), 'safari');
  assert.equal(iosBrowser(IPHONE_CHROME), 'chrome');
  assert.equal(iosBrowser(IPADOS_DESKTOP_CHROME), 'chrome');
  assert.equal(iosBrowser(IPHONE_BRAVE), 'brave');
  assert.equal(iosBrowser(IPHONE_FIREFOX), 'firefox');
  assert.equal(iosBrowser(IPHONE_EDGE), 'edge');
  assert.equal(iosBrowser(ANDROID_CHROME), 'chrome');
  assert.equal(iosBrowser('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 OPiOS/4.0.2'), 'other');
  // Safari’s UA also contains “Safari/”; Chrome/CriOS must not be classified as Safari.
  assert.notEqual(iosBrowser(IPHONE_CHROME), 'safari');
  assert.notEqual(iosBrowser(IPHONE_FIREFOX), 'safari');
});

test('isStandalone follows navigator.standalone or display-mode: standalone', () => {
  assert.equal(isStandalone({}), false);
  assert.equal(isStandalone({ standalone: true }), true);
  assert.equal(isStandalone({ displayModeStandalone: true }), true);
  assert.equal(isStandalone({ standalone: false, displayModeStandalone: false }), false);
});

test('shouldShowIosInstallHint: iOS browser, not standalone, not dismissed', () => {
  const ios = { userAgent: IPHONE_SAFARI };
  assert.equal(shouldShowIosInstallHint(ios), true);
  assert.equal(shouldShowIosInstallHint({ userAgent: IPHONE_CHROME }), true);
  assert.equal(shouldShowIosInstallHint({ userAgent: IPADOS_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(shouldShowIosInstallHint({ ...ios, standalone: true }), false);
  assert.equal(shouldShowIosInstallHint({ ...ios, displayModeStandalone: true }), false);
  assert.equal(shouldShowIosInstallHint({ ...ios, dismissed: true }), false);
  assert.equal(shouldShowIosInstallHint({ userAgent: ANDROID_CHROME }), false);
  assert.equal(shouldShowIosInstallHint({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 }), false);
});

test('?ios-hint=1 forces the hint on desktop; a named value picks the browser text', () => {
  assert.deepEqual(iosHintParam('?ios-hint=1'), { force: true, browser: null });
  assert.deepEqual(iosHintParam('https://example.com/?foo=1&ios-hint=safari'), { force: true, browser: 'safari' });
  assert.deepEqual(iosHintParam('ios-hint=chrome'), { force: true, browser: 'chrome' });
  assert.equal(iosHintParam('?ios-hint=0'), null);
  assert.equal(iosHintParam('?ios-hint=false'), null);
  assert.equal(iosHintParam(''), null);

  assert.equal(shouldShowIosInstallHint({ userAgent: DESKTOP_CHROME, search: '?ios-hint=1' }), true);
  assert.equal(shouldShowIosInstallHint({ userAgent: ANDROID_CHROME, search: '?ios-hint=brave' }), true);
  assert.equal(shouldShowIosInstallHint({ userAgent: IPHONE_SAFARI, dismissed: true, search: '?ios-hint=1' }), true);
  assert.equal(shouldShowIosInstallHint({ userAgent: IPHONE_SAFARI, standalone: true, search: '?ios-hint=1' }), true);
  assert.equal(shouldShowIosInstallHint({ userAgent: DESKTOP_CHROME, search: '?ios-hint=0' }), false);
  assert.equal(shouldShowIosInstallHint({ userAgent: DESKTOP_CHROME, forceOnce: true }), true);

  assert.equal(iosInstallBrowserForHint({ userAgent: DESKTOP_CHROME, search: '?ios-hint=safari' }), 'safari');
  assert.equal(iosInstallBrowserForHint({ userAgent: IPHONE_CHROME, search: '?ios-hint=1' }), 'chrome');
  assert.equal(iosInstallBrowserForHint({ userAgent: IPHONE_SAFARI }), 'safari');
});

test('matching browser steps come first, and dismissal is stored only as a local flag', () => {
  const safari = iosInstallCopy('safari');
  assert.equal(safari.title, IOS_INSTALL_TITLE);
  assert.equal(safari.primary, IOS_INSTALL_STEPS.safari);
  assert.equal(safari.secondary, IOS_INSTALL_OTHER.safari);
  assert.match(safari.primary, /^Στο Safari:/);
  assert.match(safari.secondary, /Chrome, Brave/);

  const chrome = iosInstallCopy('chrome');
  assert.equal(chrome.primary, IOS_INSTALL_STEPS.chrome);
  assert.match(chrome.primary, /^Στο Chrome:/);
  assert.match(chrome.secondary, /^Στο Safari:/);

  assert.match(iosInstallCopy('brave').primary, /Brave/);
  assert.match(iosInstallCopy('firefox').primary, /Firefox/);
  assert.match(iosInstallCopy('edge').primary, /Edge/);
  assert.match(iosInstallCopy('other').primary, /κοινοποίηση/);

  const store = {};
  const memory = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  assert.equal(IOS_INSTALL_DISMISS_KEY, 'spitothiki:ios-install-hint-dismissed');
  assert.equal(iosInstallDismissed(memory), false);
  dismissIosInstallHint(memory);
  assert.equal(store[IOS_INSTALL_DISMISS_KEY], '1');
  assert.equal(iosInstallDismissed(memory), true);
  clearIosInstallDismiss(memory);
  assert.equal(iosInstallDismissed(memory), false);
});

test('home card, guide, settings and styles wire up the iOS hint; English exists; no personal names', () => {
  const app = read('src/app.js');
  assert.match(app, /from '\.\/ios-install\.js'/);
  assert.match(app, /function renderIosInstallHint/);
  assert.match(app, /id="home-ios-install"/);
  assert.match(app, /data-action="ios-install-dismiss"/);
  assert.match(app, /data-action="ios-install-reshow"/);
  assert.match(app, /id="settings-ios-install"/);
  assert.match(app, /id="guide-ios-install"/);
  const home = app.slice(app.indexOf('function renderOverview()'), app.indexOf('function renderPantryList'));
  assert.match(home, /renderIosInstallHint\(\)/);

  const tips = GUIDE_SECTIONS.find((section) => section.id === 'tips');
  assert.ok(tips);
  const text = [tips.intro, ...tips.bullets].join('\n');
  assert.match(text, /iPhone ή iPad/);
  assert.match(text, /Safari/);
  assert.match(text, /Προσθήκη στην οθόνη Αφετηρίας/);
  assert.match(text, /Chrome, Brave/);
  assert.match(text, /άνοιξε τη σελίδα στο Safari/);

  const css = read('styles.css');
  assert.match(css, /\.ios-install-hint/);
  assert.match(css, /:root\[data-theme="dark"\] \.ios-install-hint/);
  // Body text uses --ink (not --muted) so contrast stays AA in light and dark.
  assert.match(css, /\.ios-install-hint [^{]*\{[^}]*color:\s*var\(--ink\)/);

  const sw = read('sw.js');
  assert.match(sw, /'\.\/src\/ios-install\.js'/);
  assert.match(read('index.html'), /src\/ios-install\.js/);

  for (const [el, en] of Object.entries(IOS_INSTALL_EN)) {
    assert.ok(String(en).trim(), el);
    assert.equal(dictionaries.en[el], en);
    assert.equal(dictionaries.el[el], el);
  }
  assert.equal(dictionaries.en[IOS_INSTALL_SETTINGS], 'Add to the Home Screen (iPhone / iPad)');

  for (const file of ['src/ios-install.js', 'src/guide.js', 'src/app.js']) {
    const src = read(file);
    assert.doesNotMatch(src, /Γιάννης /);
    assert.doesNotMatch(src, /Σκολαρ|Skolarikis/);
  }
});
