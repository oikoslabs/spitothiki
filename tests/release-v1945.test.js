import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS } from '../src/guide.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.45 release: version, cache v161→current, list search, reliable sync, updated guide', () => {
  assert.match(read('package.json'), /"version": "1\.9\.48"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.48</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=168/);
  assert.match(html, /src\/app\.js\?v=168/);
  assert.doesNotMatch(html, /v=168-preview/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v168';/);
  assert.doesNotMatch(sw, /CACHE_VERSION = 'v163-preview'/);
  assert.match(sw, /styles\.css\?v=168'/);
  assert.match(sw, /src\/app\.js\?v=168'/);
  assert.match(sw, /src\/list-search\.js/);
  const app = read('src/app.js');
  assert.match(app, /from '\.\/list-search\.js'/);
  assert.match(app, /listSearchField\('extras-list'/);
  assert.doesNotMatch(app, /Γιάννης /);
  assert.doesNotMatch(app, /Σκολαρ|Skolarikis/);
  const core = read('src/sync-core.js');
  assert.match(core, /this\.outbox/);
  assert.match(core, /retry\(\)/);
  const fb = read('src/sync-firebase.js');
  assert.match(fb, /addEventListener\('online'/);
  assert.match(fb, /visibilitychange/);
  assert.match(fb, /await Promise\.all\(commits\)/);
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.equal(whats.title, 'Τι νέο στην 1.9.48');
  assert.match(whats.bullets.join('\n'), /🔍 Αναζήτηση…/);
  assert.match(whats.bullets.join('\n'), /συγχρονισμός/);
});
