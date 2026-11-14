import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_EN, GUIDE_SECTIONS, VIEW_TO_SECTION, guideHeading, searchGuide, sectionForView } from '../src/guide.js';
import { dictionaries, setLang, t } from '../src/i18n.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('guide has a numbered manual ending with useful tips, 2–4 bullets each', () => {
  assert.equal(GUIDE_SECTIONS[0].id, 'start');
  assert.match(GUIDE_SECTIONS[0].intro, /κάνε πρώτα αυτά τα 3/);
  assert.equal(GUIDE_SECTIONS.at(-1).id, 'tips');
  assert.equal(GUIDE_SECTIONS.at(-1).numbered, false);
  assert.equal(guideHeading(GUIDE_SECTIONS[0], 0), '1. Ξεκίνημα');
  assert.equal(guideHeading(GUIDE_SECTIONS.at(-1), GUIDE_SECTIONS.length - 1), 'Χρήσιμα tips');
  const numbered = GUIDE_SECTIONS.filter((section) => section.numbered !== false);
  assert.equal(numbered.length, 17);
  for (const section of GUIDE_SECTIONS) {
    assert.ok(section.intro.trim());
    assert.ok(section.bullets.length >= 2 && section.bullets.length <= (section.id === 'shopping' ? 8 : (section.id === 'receipts' || section.id === 'settings') ? 5 : 4), section.id);
  }
});

test('every guide section has English text', () => {
  for (const section of GUIDE_SECTIONS) {
    for (const text of [section.title, section.intro, ...section.bullets]) {
      assert.equal(dictionaries.el[text], text, text);
      assert.ok(String(dictionaries.en[text] || '').trim(), `missing en: ${text}`);
    }
  }
  for (const [el, en] of Object.entries(GUIDE_EN)) {
    assert.ok(String(en).trim(), el);
    assert.equal(dictionaries.en[el], en);
  }
});

test('guide search filters in Greek and English', () => {
  assert.equal(searchGuide('').length, GUIDE_SECTIONS.length);
  const expiry = searchGuide('λήξη').map((section) => section.id);
  assert.ok(expiry.includes('pantry'));
  assert.ok(expiry.includes('receipts'));
  assert.deepEqual(searchGuide('qqqzzz'), []);
  setLang('en');
  const cart = searchGuide('in-store cart', { translate: t }).map((section) => section.id);
  setLang('el');
  assert.deepEqual(cart, ['cart']);
  const auto = searchGuide('ποσότητα γίνει 0').map((section) => section.id);
  assert.deepEqual(auto, ['shopping']);
});

test('header screens map to the matching guide section', () => {
  assert.equal(sectionForView('overview'), 'start');
  assert.equal(sectionForView('pantry'), 'pantry');
  assert.equal(sectionForView('shopping'), 'shopping');
  assert.equal(sectionForView('cart'), 'cart');
  assert.equal(sectionForView('receipts'), 'receipts');
  assert.equal(sectionForView('cook'), 'cook');
  assert.equal(sectionForView('cook', { cookTab: 'plan' }), 'meals');
  assert.equal(sectionForView('bills'), 'bills');
  assert.equal(sectionForView('insights'), 'spending');
  assert.equal(sectionForView('transport'), 'transport');
  assert.equal(sectionForView('extras'), 'extras');
  assert.equal(sectionForView('chores'), 'chores');
  assert.equal(sectionForView('settings'), 'settings');
  assert.equal(sectionForView('guide'), '');
  for (const id of Object.values(VIEW_TO_SECTION)) assert.ok(GUIDE_SECTIONS.some((section) => section.id === id), id);
});

test('guide is in the menu, settings, starter, welcome and SW cache v125', () => {
  const html = read('index.html');
  const block = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  for (const nav of [block('<nav class="primary-nav"', '</nav>'), block('<nav class="menu-list" id="menu-list"', '</nav>')]) {
    assert.match(nav, /data-view="guide"/);
    assert.match(nav, /Οδηγός/);
    assert.ok(nav.indexOf('data-view="guide"') > nav.indexOf('data-view="settings"'));
    assert.ok(nav.trim().endsWith('</a>'), 'Telegram stays last');
  }
  const app = read('src/app.js');
  assert.match(app, /'guide'/);
  assert.match(app, /data-action="open-guide"/);
  assert.match(app, /Διάβασε τον οδηγό/);
  assert.match(app, /onboard-guide/);
  assert.match(app, /function helpButton/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v143'/);
  assert.ok(sw.includes("./src/guide.js"));
});

test('shopping voice text matches the hidden-mic behaviour and names Chrome', () => {
  const shopping = GUIDE_SECTIONS.find((section) => section.id === 'shopping');
  const voice = shopping.bullets.find((bullet) => bullet.includes('🎤'));
  assert.ok(voice);
  assert.match(voice, /Πάτα το 🎤 και πες π\.χ\. «δύο γάλατα»/);
  assert.match(voice, /Αν δεν βλέπεις το μικρόφωνο, άνοιξε την εφαρμογή με Chrome/);
  assert.doesNotMatch(voice, /σε κάποιους browser|Σε πολλούς browsers/i);
  const app = read('src/app.js');
  const form = app.slice(app.indexOf('function renderItemAddForm'), app.indexOf('const SpeechRecognitionApi'));
  assert.match(form, /voice \? '<button class="button button-quiet voice-button"/);
  assert.match(app, /SpeechRecognitionApi = window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(app, /renderItemAddForm\(\{ id: 'shopping-form'[\s\S]*voice: Boolean\(SpeechRecognitionApi\)/);
  assert.equal(dictionaries.en[voice], 'Type a product or tap «To the list» from the pantry. Tap the 🎤 and say e.g. “two milks”. If you don’t see the microphone, open the app in Chrome.');
});

test('home screen has a permanent user-guide entry, default on, hideable in Settings', () => {
  const app = read('src/app.js');
  assert.match(app, /function renderHomeGuide/);
  assert.match(app, /id="home-guide"/);
  assert.match(app, /id="home-choice-guide"/);
  assert.match(app, /Οδηγός χρήσης/);
  const home = app.slice(app.indexOf('function renderOverview()'), app.indexOf('function renderPantryList'));
  assert.ok(home.indexOf('renderHomeGuide()') < home.indexOf('renderHomePrimary()'));
  assert.ok(home.includes('renderHomeGuide()'));
  // still shown after first data: it is not behind hasAnyData / starter
  const guideFn = app.slice(app.indexOf('function renderHomeGuide'), app.indexOf('function renderHomePrimary'));
  assert.doesNotMatch(guideFn, /hasAnyData|renderStarterCard/);
});
