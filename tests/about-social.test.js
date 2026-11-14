import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const LINKS = {
  facebook: 'https://www.facebook.com/people/SpitoThiki/61596458362898/',
  telegram: 'https://t.me/spitothiki',
  tiktok: 'https://www.tiktok.com/@spitothikiapp',
};

function settingsFn() {
  const app = read('src/app.js');
  const start = app.indexOf('function renderSettings()');
  const end = app.indexOf('\nfunction ', start + 1);
  return app.slice(start, end);
}

test('Settings has a Σχετικά card with Facebook, Telegram and TikTok links in a new tab', () => {
  const settings = settingsFn();
  assert.match(settings, /id="about"/);
  assert.match(settings, /t\('Σχετικά'\)/);
  assert.match(settings, /t\('Ακολούθησε τη Σπιτοθήκη για νέα και tips\.'\)/);
  const tags = {};
  for (const name of Object.keys(LINKS)) {
    const match = settings.match(new RegExp(`<a class="button button-quiet" data-link="${name}-about"[^>]*>`));
    assert.ok(match, `${name} link is missing`);
    tags[name] = match[0];
    assert.ok(tags[name].includes(`href="${LINKS[name]}"`), `${name} href`);
    assert.match(tags[name], /target="_blank"/);
    assert.match(tags[name], /rel="noopener"/);
  }
  assert.ok(!LINKS.tiktok.includes('?'), 'TikTok URL must have no tracking params');
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
  assert.match(bullet, /TikTok/);
  assert.equal(
    dictionaries.en[bullet],
    'In Settings, under «About», you will find our Facebook page, Telegram channel and TikTok account for news and tips.'
  );
});

test('About card ships in the service worker cache notes', () => {
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v137'/);
  assert.match(sw, /About card in Settings with Facebook, Telegram and the official TikTok account/);
  assert.match(read('package.json'), /"version": "1\.9\.29"/);
});
