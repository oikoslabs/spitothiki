import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MARKETING_CONSENT_VERSION, MARKETING_HINT, MARKETING_LABEL,
  marketingFields, normalizeMarketingOptIn, readMarketingCheckbox, shouldApplySignupMarketing
} from '../src/marketing-consent.js';
import { dictionaries } from '../src/i18n.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('v1.9.18 normalizeMarketingOptIn: missing/false stay opted out (no auto-enroll)', () => {
  assert.equal(normalizeMarketingOptIn(undefined), false);
  assert.equal(normalizeMarketingOptIn({}), false);
  assert.equal(normalizeMarketingOptIn({ marketingOptIn: false }), false);
  assert.equal(normalizeMarketingOptIn({ marketingOptIn: true }), true);
  assert.equal(normalizeMarketingOptIn({ marketingOptIn: 'true' }), false);
});

test('v1.9.18 signup consent applies only to brand-new accounts', () => {
  const pending = { optIn: true, source: 'google-signup' };
  assert.equal(shouldApplySignupMarketing({ isNewUser: true, pending }), true);
  assert.equal(shouldApplySignupMarketing({ isNewUser: false, pending }), false);
  assert.equal(shouldApplySignupMarketing({ isNewUser: true, pending: null }), false);
  assert.equal(shouldApplySignupMarketing({ isNewUser: undefined, pending }), false);
  assert.equal(shouldApplySignupMarketing({ isNewUser: true, pending: { optIn: false, source: 'email-signup' } }), true);
});

test('v1.9.18 marketingFields: records decision, settings opt-out sets withdrawal flag', () => {
  const on = marketingFields({ optIn: true, source: 'email-signup' });
  assert.equal(on.marketingOptIn, true);
  assert.equal(on.marketingConsentVersion, MARKETING_CONSENT_VERSION);
  assert.equal(on.marketingConsentSource, 'email-signup');
  assert.equal(on.setOptInAt, true);
  assert.equal(on.setOptOutAt, false);

  const offSignup = marketingFields({ optIn: false, source: 'google-signup' });
  assert.equal(offSignup.marketingOptIn, false);
  assert.equal(offSignup.setOptInAt, false);
  assert.equal(offSignup.setOptOutAt, false); // signup decline is not a Settings withdrawal

  const withdraw = marketingFields({ optIn: false, source: 'settings' });
  assert.equal(withdraw.setOptOutAt, true);
});

test('v1.9.18 readMarketingCheckbox: unchecked by default', () => {
  const doc = {
    querySelector(sel) {
      if (sel !== '#marketing-optin') return null;
      return { checked: false };
    }
  };
  assert.equal(readMarketingCheckbox(doc), false);
  doc.querySelector = () => ({ checked: true });
  assert.equal(readMarketingCheckbox(doc), true);
  assert.equal(readMarketingCheckbox(null), false);
});

test('v1.9.18 UI: signup checkbox + Settings withdrawal wired; Google/email use helpers', () => {
  const app = read('src/app.js');
  const sync = read('src/sync-firebase.js');
  assert.match(app, /id="marketing-optin"/);
  assert.match(app, /t\(MARKETING_LABEL\)/);
  assert.match(app, /t\(MARKETING_HINT\)/);
  assert.match(app, /id="marketing-optin-settings"/);
  assert.match(app, /readMarketingCheckbox\(\)/);
  assert.match(app, /signInWithGoogle\(\{ marketingOptIn: readMarketingCheckbox\(\) \}\)/);
  assert.match(app, /signUpWithEmail\(email, password, \{ marketingOptIn: readMarketingCheckbox/);
  assert.match(app, /setMarketingOptIn/);
  // Login path must not pass marketingOptIn
  assert.match(app, /mode === 'signup' \? sync\.signUpWithEmail/);
  assert.match(sync, /signInWithEmail: \(email, password\) => \{\s*\/\/ Login must never apply/);
  assert.match(sync, /clearPending\(\);\s*return auth\.signInWithEmailAndPassword/);
  assert.match(sync, /additionalUserInfo\?\.isNewUser/);
  assert.match(sync, /getRedirectResult/);
  assert.match(sync, /PENDING_MARKETING_KEY/);
  assert.match(sync, /setMarketingOptIn/);
  assert.ok(!/checked(?![^<]*>)/.test(app.match(/id="marketing-optin"[^>]*>/)?.[0] || ''), 'signup checkbox not pre-checked');
  const box = app.match(/id="marketing-optin"[^>]*>/)?.[0] || '';
  assert.ok(!/\schecked[\s>]/.test(box), `signup checkbox must be unchecked: ${box}`);
});

test('v1.9.18 bilingual strings + SW precache + version bump', () => {
  assert.equal(dictionaries.en[MARKETING_LABEL].includes('occasional news'), true);
  assert.equal(dictionaries.en[MARKETING_HINT].includes('Necessary service messages'), true);
  assert.match(read('sw.js'), /marketing-consent\.js/);
  assert.match(read('sw.js'), /CACHE_VERSION = 'v124'/);
  assert.match(read('package.json'), /"version": "1\.9\.23"/);
  assert.match(read('index.html'), /1\.9\.23/);
});
