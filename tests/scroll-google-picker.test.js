// v1.9.18: scrolling must not open the Google account picker (Drive silent token + email autofocus).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('v1.9.18 silent Drive token never prompts (prompt none, not empty)', () => {
  const auth = read('src/gdrive-auth.js');
  assert.match(auth, /prompt:\s*interactive\s*\?\s*'consent'\s*:\s*'none'/);
  assert.doesNotMatch(auth, /requestAccessToken\(\{\s*prompt:\s*interactive\s*\?\s*'consent'\s*:\s*''\s*\}\)/);
});

test('v1.9.18 auto-backup arms on click, not pointerdown', () => {
  const app = read('src/app.js');
  assert.match(app, /addEventListener\('click'/);
  assert.doesNotMatch(app, /addEventListener\('pointerdown',\s*\(\)\s*=>\s*\{\s*driveBackupNow/);
  assert.match(app, /maybeArmAutoBackup/);
});

test('v1.9.18 goToSignin does not autofocus email / Google button', () => {
  const app = read('src/app.js');
  const start = app.indexOf('function goToSignin');
  const fn = app.slice(start, start + 700);
  assert.doesNotMatch(fn, /input\[name="email"\]/);
  assert.doesNotMatch(fn, /sync-google/);
  assert.match(fn, /scrollIntoView/);
});

test('v1.9.18 overscroll pull-to-refresh disabled; version bumped', () => {
  assert.match(read('styles.css'), /overscroll-behavior-y:\s*none/);
  assert.match(read('sw.js'), /CACHE_VERSION = 'v115'/);
  assert.match(read('package.json'), /"version": "1\.9\.18"/);
  assert.match(read('index.html'), /data-no-i18n>1\.9\.18</);
});
