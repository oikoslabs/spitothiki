import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// v1.6.15: every section of the phone menu is also in the desktop sidebar, in the same order.
test('desktop sidebar has every view and action of the phone menu, same order', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const block = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  const sidebar = block('<nav class="primary-nav"', '</nav>');
  const menu = block('<nav class="menu-list" id="menu-list"', '</nav>');
  const targets = (s) => [...s.matchAll(/data-(view|action)="([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.ok(targets(menu).length >= 13);
  assert.deepEqual(targets(sidebar), targets(menu));
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /action === 'menu-receipt'\) \{ const sheet = document\.querySelector\('#menu-sheet'\); if \(sheet\?\.open\) sheet\.close\(\)/);
});

// v1.6.16: the cart price keypad follows the theme (was a fixed light background → white on white in dark mode).
test('cart keypad uses theme colours, not a fixed light background', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = css.match(/\.keypad-key \{[^}]*\}/)[0];
  assert.match(rule, /background: var\(--surface-soft\)/); assert.match(rule, /color: var\(--ink\)/);
  assert.doesNotMatch(rule, /#f6f8f4|color: inherit/);
});

// v1.8.1: «📢 Νέα & tips στο Telegram» — same link at the end of the phone menu and of the PC sidebar, opens in a new tab.
test('Telegram link: last item in both menus, same target, new tab, translated, not on the home screen', async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const block = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  for (const nav of [block('<nav class="primary-nav"', '</nav>'), block('<nav class="menu-list" id="menu-list"', '</nav>')]) {
    const links = [...nav.matchAll(/<a [^>]*data-link="telegram"[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
    assert.equal(links.length, 1);
    assert.match(links[0], /href="https:\/\/t\.me\/spitothiki"/); assert.match(links[0], /target="_blank"/); assert.match(links[0], /rel="noopener"/);
    assert.match(links[0], /Νέα &amp; tips στο Telegram/);
    assert.ok(nav.trim().endsWith('</a>'), 'Telegram link is the last item');
  }
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /t\.me\/spitothiki/); // nothing on the home screen or in rendered views
  const { dictionaries } = await import('../src/i18n.js');
  assert.equal(dictionaries.en['Νέα & tips στο Telegram'], 'News & tips on Telegram');
});
