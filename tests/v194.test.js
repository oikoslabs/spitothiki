// v1.9.4: in-app account deletion, self-hosted libraries, privacy page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { confirmWordOk, recentLogin, planOwnHousehold, deleteAccountData } from '../src/account-delete.js';
import { dictionaries } from '../src/i18n.js';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('typed confirmation accepts ΔΙΑΓΡΑΦΗ / DELETE only', () => {
  for (const ok of ['ΔΙΑΓΡΑΦΗ', ' διαγραφή ', 'Διαγραφη', 'DELETE', 'delete']) assert.ok(confirmWordOk(ok), ok);
  for (const no of ['', 'ΔΙΑΓΡΑΦ', 'ναι', 'del']) assert.ok(!confirmWordOk(no), no);
});
test('recent sign-in window is under Firebase\'s 5 minutes', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  assert.ok(recentLogin('Fri, 30 Oct 2026 11:58:00 GMT', now));
  assert.ok(!recentLogin('Fri, 30 Oct 2026 11:50:00 GMT', now));
  assert.ok(!recentLogin('', now));
});
test('own household plan: alone → delete, others → hand over to the next member', () => {
  assert.deepEqual(planOwnHousehold({ members: ['me'] }, 'me'), { action: 'delete' });
  assert.deepEqual(planOwnHousehold({ members: ['me', 'b', 'c'] }, 'me'), { action: 'handover', newOwner: 'b', members: ['b', 'c'] });
  assert.deepEqual(planOwnHousehold(null, 'me'), { action: 'none' });
});
test('deleteAccountData calls the right writes in the right order (fake Firestore)', async () => {
  const log = []; const data = { 'households/other': { ownerUid: 'o', members: ['o', 'me'] }, 'households/me': { ownerUid: 'me', members: ['me'] } };
  const fs = {
    doc: (_db, ...p) => p.join('/'), collection: (_db, ...p) => p.join('/'), arrayRemove: (x) => ({ remove: x }),
    getDoc: async (ref) => ({ exists: () => Boolean(data[ref]), data: () => data[ref] }),
    getDocs: async (col) => ({ docs: [{ ref: `${col}/a` }, { ref: `${col}/b` }] }),
    writeBatch: () => ({ delete: (r) => log.push(`delete ${r}`), commit: async () => log.push('commit') }),
    updateDoc: async (ref, v) => log.push(`update ${ref} ${JSON.stringify(v)}`), deleteDoc: async (ref) => log.push(`delete ${ref}`)
  };
  const r = await deleteAccountData(fs, {}, 'me', 'other');
  assert.deepEqual(r, { leftHousehold: true, handedOverTo: '', deletedHousehold: true, deletedDocs: 4 });
  assert.equal(log[0], 'update households/other {"members":{"remove":"me"}}');
  assert.deepEqual(log.slice(-2), ['delete households/me', 'delete users/me']);
});
test('Settings has the delete-account form, a second confirm, re-login handling and local wipe; English exists', () => {
  const app = read('src/app.js');
  assert.match(app, /id="account-delete-form"/);
  assert.match(app, /confirmWordOk\(event\.target\.elements\.word\.value\)/);
  assert.match(app, /showConfirm\('Τελευταία ερώτηση/);
  assert.match(app, /auth\/requires-recent-login/);
  assert.match(app, /startsWith\('spitothiki'\)\)\.forEach\(\(k\) => localStorage\.removeItem\(k\)\)/);
  assert.match(read('src/sync-firebase.js'), /auth\.deleteUser\(current\)/);
  for (const k of ['Διαγραφή λογαριασμού', 'Για επιβεβαίωση, γράψε ΔΙΑΓΡΑΦΗ', 'Γράψε ΔΙΑΓΡΑΦΗ για να συνεχίσεις.', 'Χρειάζεται νέα σύνδεση', 'Ο λογαριασμός σου και τα δεδομένα σου διαγράφηκαν.']) assert.ok(dictionaries.en[k], k);
});
test('libraries are self-hosted: no CDN URLs left in the app code', () => {
  for (const f of readdirSync(new URL('../src/', import.meta.url))) assert.doesNotMatch(read(`src/${f}`), /cdn\.jsdelivr\.net|gstatic\.com\/firebasejs|unpkg\.com/, f);
  assert.match(read('src/receipt-photo.js'), /workerPath: `\$\{TESS\}worker\.min\.js`, corePath: `\$\{TESS\}core`, langPath: `\$\{TESS\}lang`/);
  assert.match(read('src/barcode.js'), /script\.integrity = ZXING_SRI/);
});
test('vendor files match their pinned SHA-256 fingerprints; zxing matches its SRI', () => {
  const sums = read('vendor/SHA256SUMS').trim().split('\n');
  assert.ok(sums.length >= 11);
  for (const line of sums) {
    const [hash, file] = line.split(/\s+/);
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../vendor/${file}`, import.meta.url))).digest('hex'), hash, file);
  }
  const sri = /ZXING_SRI = '(sha384-[^']+)'/.exec(read('src/barcode.js'))[1];
  assert.equal(`sha384-${createHash('sha384').update(readFileSync(new URL('../vendor/zxing-browser-0.1.5/zxing-browser.min.js', import.meta.url))).digest('base64')}`, sri);
  for (const f of ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']) assert.doesNotMatch(read(`vendor/firebase-13.0.0/${f}`), /gstatic\.com\/firebasejs/);
});
test('service worker: vendor files cache-first on demand, not precached', () => {
  const sw = read('sw.js');
  assert.match(sw, /url\.pathname\.startsWith\('\/vendor\/'\)/);
  assert.doesNotMatch(sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL'))), /vendor/);
  assert.ok(statSync(new URL('../vendor/tesseract-7.0.0/lang/eng.traineddata.gz', import.meta.url)).size > 1e6);
});
test('privacy page: in-app account deletion (email kept), TheMealDB, other hosts', () => {
  const p = read('privacy.html');
  assert.match(p, /Ρυθμίσεις › Συγχρονισμός συσκευών › Διαγραφή λογαριασμού/);
  assert.match(p, /Settings › Device sync › Delete account/);
  assert.match(p, /Εναλλακτικά, στείλε αίτημα διαγραφής/);
  assert.match(p, /TheMealDB/); assert.match(p, /accounts\.google\.com/);
  assert.match(read('src/app.js'), /στέλνεται μόνο η λέξη αναζήτησης στο TheMealDB/);
});
