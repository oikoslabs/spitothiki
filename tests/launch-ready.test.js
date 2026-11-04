import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchReceipt } from '../src/receipt.js';
import { dictionaries } from '../src/i18n.js';

test('receipt: friendly Greek messages for 429 and 5xx from the proxy', async () => {
  const fail = (status) => async (url) => { if (!url.includes('proxy')) throw new TypeError('cors'); return { ok: false, status }; };
  const link = 'https://a.epsilonnet.gr/fd/abc';
  await assert.rejects(fetchReceipt(link, { fetchImpl: fail(429), proxy: 'https://proxy' }), /Πολλές αναζητήσεις/);
  await assert.rejects(fetchReceipt(link, { fetchImpl: fail(502), proxy: 'https://proxy' }), /δεν απαντά/);
});

test('privacy section and error strings have English', () => {
  for (const k of ['Τι ακριβώς αποθηκεύεται και πού', 'Ο συγχρονισμός έφτασε το ημερήσιο όριο. Τα δεδομένα σου μένουν στη συσκευή και θα συγχρονιστούν αργότερα.', 'Πολλές αναζητήσεις αυτή τη στιγμή. Δοκίμασε ξανά σε λίγα λεπτά ή σκάναρε τη φωτογραφία της απόδειξης.']) assert.ok(dictionaries.en[k], k);
});

test('firestore rules: no open access, invites expire, members can only leave', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.ok(!/allow [^;]*if true/.test(rules));
  assert.match(rules, /duration\.value\(7, 'd'\)/);
  assert.match(rules, /difference\(\[request\.auth\.uid\]\.toSet\(\)\)/);
});
