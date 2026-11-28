import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GUIDE_SECTIONS } from '../src/guide.js';
import { dictionaries } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v1.9.46 release: version, cache v162, sync check button, counts, sturdier uploads, updated guide', () => {
  assert.match(read('package.json'), /"version": "1\.9\.49"/);
  assert.equal((read('index.html').match(/data-no-i18n>1\.9\.49</g) || []).length, 2);
  const html = read('index.html');
  assert.match(html, /styles\.css\?v=170/);
  assert.match(html, /src\/app\.js\?v=170/);
  assert.doesNotMatch(html, /v=169-preview/);
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v170';/);
  assert.match(sw, /src\/app\.js\?v=170'/);
  const app = read('src/app.js');
  assert.match(app, /data-action="sync-check"/);
  assert.match(app, /action === 'sync-check'/);
  assert.match(app, /🔄 Έλεγχος & αποστολή όσων λείπουν/);
  assert.doesNotMatch(app, /Σκολαρ|Skolarikis/);
  assert.ok(dictionaries.en['🔄 Έλεγχος & αποστολή όσων λείπουν']);
  const core = read('src/sync-core.js');
  assert.match(core, /uploadMissing\(serverKeys\)/);
  assert.match(core, /this\.failed/);
  const fb = read('src/sync-firebase.js');
  assert.match(fb, /getDocsFromServer/);
  assert.match(fb, /checkMissing/);
  assert.doesNotMatch(fb, /deleteDoc\(.*checkMissing/);
  const whats = GUIDE_SECTIONS.find((s) => s.id === 'whats-new');
  assert.equal(whats.title, 'Τι νέο στην 1.9.49');
  assert.match(whats.bullets.join('\n'), /🔄 Έλεγχος & αποστολή όσων λείπουν/);
  for (const b of whats.bullets) assert.ok(dictionaries.en[b], `EN missing: ${b}`);
  assert.match(read('src/guide.js'), /δεν σβήνει τίποτα/);
});
