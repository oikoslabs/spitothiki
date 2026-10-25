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
