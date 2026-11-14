import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIGNIN_PROMPT_KEYS,
  SIGNIN_PROMPT_SCANS,
  SIGNIN_PROMPT_ENTRIES,
  shouldShowSigninPrompt,
  promptSeen,
  markPromptSeen,
  countEntries,
  isSignedOutForPrompt
} from '../src/features.js';
import { GUIDE_SECTIONS, searchGuide } from '../src/guide.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const signedOut = { state: 'signed-out' };
const memory = (data = {}) => ({
  getItem: (k) => (k in data ? data[k] : null),
  setItem: (k, v) => { data[k] = String(v); }
});

test('countEntries skips demo items and sums local records', () => {
  assert.equal(countEntries({}), 0);
  assert.equal(countEntries({ items: [{ name: 'Γάλα', demo: true }, { name: 'Ψωμί' }], receipts: [{ id: 'a' }, { id: 'b' }], bills: [{ id: 'b1' }] }), 4);
  assert.equal(countEntries({ shopping: [{}, {}], chores: [{}], events: [{}], purchases: [{}] }), 5);
});

test('shouldShowSigninPrompt: signed-out only, each kind has its threshold, seen hides it', () => {
  assert.equal(SIGNIN_PROMPT_SCANS, 3);
  assert.equal(SIGNIN_PROMPT_ENTRIES, 10);
  assert.equal(isSignedOutForPrompt(signedOut), true);
  assert.equal(isSignedOutForPrompt({ state: 'error' }), true);
  assert.equal(isSignedOutForPrompt({ state: 'error', user: { uid: 'u' } }), false);
  assert.equal(isSignedOutForPrompt({ state: 'synced', user: { uid: 'u' } }), false);
  assert.equal(isSignedOutForPrompt({ state: 'loading' }), false);

  assert.equal(shouldShowSigninPrompt({ kind: 'scans', status: signedOut, seen: false, scanCount: 2 }), false);
  assert.equal(shouldShowSigninPrompt({ kind: 'scans', status: signedOut, seen: false, scanCount: 3 }), true);
  assert.equal(shouldShowSigninPrompt({ kind: 'scans', status: signedOut, seen: true, scanCount: 5 }), false);
  assert.equal(shouldShowSigninPrompt({ kind: 'scans', status: { state: 'synced', user: { uid: 'u' } }, seen: false, scanCount: 5 }), false);

  assert.equal(shouldShowSigninPrompt({ kind: 'entries', status: signedOut, seen: false, entryCount: 9 }), false);
  assert.equal(shouldShowSigninPrompt({ kind: 'entries', status: signedOut, seen: false, entryCount: 10 }), true);
  assert.equal(shouldShowSigninPrompt({ kind: 'entries', status: signedOut, seen: true, entryCount: 20 }), false);

  assert.equal(shouldShowSigninPrompt({ kind: 'share', status: signedOut, seen: false }), true);
  assert.equal(shouldShowSigninPrompt({ kind: 'share', status: signedOut, seen: true }), false);
  assert.equal(shouldShowSigninPrompt({ kind: 'share', status: { state: 'synced', user: { uid: 'u' } }, seen: false }), false);
  assert.equal(shouldShowSigninPrompt({ kind: 'other', status: signedOut, seen: false }), false);
});

test('promptSeen / markPromptSeen use only a local flag, no personal data', () => {
  const store = memory();
  assert.equal(promptSeen(SIGNIN_PROMPT_KEYS.scans, store), false);
  markPromptSeen(SIGNIN_PROMPT_KEYS.scans, store);
  assert.equal(store.getItem(SIGNIN_PROMPT_KEYS.scans), '1');
  assert.equal(promptSeen(SIGNIN_PROMPT_KEYS.scans, store), true);
  assert.equal(promptSeen(SIGNIN_PROMPT_KEYS.share, store), false);
  for (const key of Object.values(SIGNIN_PROMPT_KEYS)) assert.match(key, /^spitothiki:signin-prompt-/);
});

test('app hooks one-time prompts after 3rd scan, share/invite, and 10+ entries, after paint, skipping open dialogs', () => {
  const app = read('src/app.js');
  assert.match(app, /offerSigninPrompt\('scans'/);
  assert.match(app, /offerSigninPrompt\('share'/);
  assert.match(app, /offerSigninPrompt\('member'/);
  assert.match(app, /offerSigninPrompt\('entries'/);
  assert.match(app, /skipEntriesSigninPrompt/);
  assert.match(app, /id="sync-invite-signed-out"/);
  assert.match(app, /label: 'Σύνδεση'/);
  assert.match(app, /label: 'Όχι τώρα'/);
  const offer = app.slice(app.indexOf('function offerSigninPrompt'), app.indexOf('async function addBarcodeToList'));
  assert.match(offer, /afterPaint/);
  assert.match(offer, /dialog\[open\]/);
  assert.match(offer, /markPromptSeen/);
  assert.doesNotMatch(offer, /analytics|gtag|logEvent|track\(/);
  const share = app.slice(app.indexOf("action === 'share-shopping'"), app.indexOf("action === 'share-shopping'") + 500);
  assert.match(share, /onLater: \(\) => shareShoppingList\(\)/);
});

test('guide «Τι νέο στην 1.9.35» and recap of earlier releases', () => {
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.equal(whats.title, 'Τι νέο στην 1.9.35');
  assert.match(whats.bullets.join(' '), /3η αποθηκευμένη απόδειξη/);
  assert.match(whats.bullets.join(' '), /10 ή περισσότερες καταχωρήσεις/);
  assert.match(whats.bullets.join(' '), /Όχι τώρα/);
  for (const ver of ['1.9.35', '1.9.34', '1.9.33', '1.9.30', '1.9.29']) {
    assert.ok(searchGuide(ver).some((s) => s.id === 'whats-new'), ver);
  }
});
