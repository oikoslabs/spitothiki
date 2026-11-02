// v1.9.13: one-time «remind me to scan?» prompt after the first scanned receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
test('v1.9.13 scan reminder prompt: once, after first scan, reuses settings path', () => {
  assert.match(app, /\n  setTimeout\(offerScanReminder/);
  assert.match(app, /localStorage\.getItem\(SCAN_PROMPT_KEY\)/);
  assert.match(app, /notifySettings\(\)\.scanNudge \|\|/);
  assert.match(app, /await enableNotifications\(\)/);
  assert.match(i18n, /'Να σου θυμίζω να σκανάρεις τα ψώνια σου;': 'Shall I remind you/);
  assert.match(i18n, /'Όχι, ευχαριστώ': 'No, thanks'/);
});
