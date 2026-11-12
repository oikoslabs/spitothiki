import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const FACEBOOK = 'https://www.facebook.com/people/SpitoThiki/61596458362898/';
const TELEGRAM = 'https://t.me/spitothiki';

function settingsFn() {
  const app = read('src/app.js');
  const start = app.indexOf('function renderSettings()');
  const end = app.indexOf('\nfunction ', start + 1);
  return app.slice(start, end);
}

test('Settings has a Σχετικά card with Facebook and Telegram links in a new tab', () => {
  const settings = settingsFn();
  assert.match(settings, /id="about"/);
  assert.match(settings, /t\('Σχετικά'\)/);
  assert.match(settings, /t\('Ακολούθησε τη Σπιτοθήκη για νέα και tips\.'\)/);
  const facebook = settings.match(/<a class="button button-quiet" data-link="facebook-about"[^>]*>/);
  const telegram = settings.match(/<a class="button button-quiet" data-link="telegram-about"[^>]*>/);
  assert.ok(facebook, 'Facebook link is missing');
  assert.ok(telegram, 'Telegram link is missing');
  assert.match(facebook[0], new RegExp(`href="${FACEBOOK.replace(/[./]/g, '\\$&')}"`));
  assert.match(telegram[0], new RegExp(`href="${TELEGRAM.replace(/[./]/g, '\\$&')}"`));
  for (const tag of [facebook[0], telegram[0]]) {
    assert.match(tag, /target="_blank"/);
    assert.match(tag, /rel="noopener"/);
  }
});

test('About strings have English translations', () => {
  assert.equal(dictionaries.en['Σχετικά'], 'About');
  assert.equal(dictionaries.en['Ακολούθησε τη Σπιτοθήκη για νέα και tips.'], 'Follow Spitothiki for news and tips.');
});

test('the in-app guide points to About in Settings for the official channels', () => {
  const section = GUIDE_SECTIONS.find((entry) => entry.id === 'settings');
  const bullet = section.bullets.find((text) => text.includes('Σχετικά'));
  assert.ok(bullet);
  assert.match(bullet, /Facebook/);
  assert.match(bullet, /Telegram/);
  assert.equal(
    dictionaries.en[bullet],
    'In Settings, under «About», you will find our Facebook page and Telegram channel for news and tips.'
  );
});

test('About card ships in SW cache v124, app version stays 1.9.22', () => {
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v124'/);
  assert.match(sw, /About card in Settings with Facebook and Telegram links/);
  assert.match(read('package.json'), /"version": "1\.9\.22"/);
});
