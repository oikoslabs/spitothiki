import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_DOMAINS, allowedHost, isAllowedOrigin } from '../src/receipt-domains.js';

test('app provider list', () => {
  assert.ok(ALLOWED_DOMAINS.length > 0);
  assert.ok(allowedHost('epsilondigital-sklavenitis.epsilonnet.gr'));
  assert.ok(allowedHost('e-invoicing.gr'));
  assert.ok(!allowedHost('epsilonnet.gr.evil.com'));
  assert.ok(!allowedHost(''));
});

test('allowed origins: live, Firebase preview channels, local — nothing else', () => {
  assert.ok(isAllowedOrigin('https://spitothiki.web.app'));
  assert.ok(isAllowedOrigin('https://spitothiki--manual-expense-qjqnqtg6.web.app'));
  assert.ok(isAllowedOrigin('http://localhost:8080'));
  assert.ok(!isAllowedOrigin('https://spitothiki--x.web.app.evil.com'));
  assert.ok(!isAllowedOrigin('https://evil--x.web.app'));
  assert.ok(!isAllowedOrigin('http://spitothiki--x.web.app'));
  assert.ok(!isAllowedOrigin('https://spitothiki--x.firebaseapp.com.evil.com'));
  assert.ok(!isAllowedOrigin(''));
});

