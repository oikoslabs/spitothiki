// v1.9.16: block disposable / temporary emails on email+password sign-up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DISPOSABLE_DOMAINS,
  DISPOSABLE_EMAIL_MSG,
  assertNotDisposableEmail,
  emailDomain,
  isDisposableEmail,
} from '../src/disposable-email.js';
import { dictionaries } from '../src/i18n.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('v1.9.16 disposable: domain parse and known throwaway providers', () => {
  assert.equal(emailDomain('user@EmailHook.site'), 'emailhook.site');
  assert.equal(emailDomain('  a.b@Mailinator.com '), 'mailinator.com');
  assert.equal(emailDomain('nope'), '');
  assert.equal(emailDomain('@only'), '');
  assert.ok(isDisposableEmail('bot@emailhook.site'));
  assert.ok(isDisposableEmail('x@sub.emailhook.site'));
  assert.ok(isDisposableEmail('a@yopmail.com'));
  assert.ok(isDisposableEmail('a@guerrillamail.com'));
  assert.ok(isDisposableEmail('a@10minutemail.com'));
  assert.ok(isDisposableEmail('a@temp-mail.org'));
  assert.ok(isDisposableEmail('a@mailinator.com'));
  assert.equal(isDisposableEmail('giannis@gmail.com'), false);
  assert.equal(isDisposableEmail('user@outlook.com'), false);
  assert.equal(isDisposableEmail('me@oikoslabs.apps'), false);
  assert.ok(DISPOSABLE_DOMAINS.has('emailhook.site'));
});

test('v1.9.16 disposable: assert throws Greek message with code', () => {
  assert.doesNotThrow(() => assertNotDisposableEmail('ok@gmail.com'));
  assert.throws(() => assertNotDisposableEmail('x@emailhook.site'), (err) => {
    assert.equal(err.message, DISPOSABLE_EMAIL_MSG);
    assert.equal(err.code, 'auth/disposable-email');
    return true;
  });
});

test('v1.9.16 disposable: wired into signup (app + firebase) and English string', () => {
  const app = read('src/app.js');
  assert.match(app, /isDisposableEmail/);
  assert.match(app, /mode === 'signup' && isDisposableEmail/);
  assert.match(app, /auth\/disposable-email/);
  const sync = read('src/sync-firebase.js');
  assert.match(sync, /assertNotDisposableEmail\(email\)/);
  assert.match(sync, /createUserWithEmailAndPassword/);
  assert.equal(
    dictionaries.en[DISPOSABLE_EMAIL_MSG],
    'Temporary emails are not accepted. Please use a regular Gmail or another real address.',
  );
  // Google path unchanged (no disposable check on signInWithGoogle).
  assert.doesNotMatch(sync.slice(sync.indexOf('signInWithGoogle'), sync.indexOf('signInWithEmail')), /disposable/i);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v124'/);
  assert.ok(sw.includes("'./src/disposable-email.js'"));
  assert.match(read('package.json'), /"version": "1\.9\.22"/);
  assert.match(read('index.html'), /data-no-i18n>1\.9\.22</);
});
