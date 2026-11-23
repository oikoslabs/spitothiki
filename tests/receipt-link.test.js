import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECEIPT_LINK_MESSAGES, extractReceiptLink, isReceiptLink, receiptLinkError } from '../src/receipt.js';

const PROVIDER = 'https://e-invoicing.gr/edocuments/ViewInvoice/abc123';
const MYDATA = 'https://mydatapi.aade.gr/TimologioQR/QRInfo?issuerVat=999999999&issueDate=12/10/2026&mark=4001&totalGrossValue=12.30';
const AADE = 'https://www1.aade.gr/tameiakes/myweb/q1.php?SIG=GRT99000204000003870EA2C079E722C361C6297D10F02955CA413695A918.35';
const EPSILON = 'https://a.epsilonnet.gr/fd/abc:155';

test('extractReceiptLink: pulls a provider URL out of surrounding Greek text', () => {
  assert.equal(extractReceiptLink(`Δες την απόδειξη: ${PROVIDER}`), PROVIDER);
  assert.equal(extractReceiptLink(`Δες την απόδειξη: ${PROVIDER}.`), PROVIDER);
  assert.equal(extractReceiptLink(`(${PROVIDER})`), PROVIDER);
});

test('extractReceiptLink: AADE q1.php and myDATA TimologioQR are receipt links', () => {
  assert.equal(extractReceiptLink(`Σου στέλνω την απόδειξη ${AADE}`), AADE);
  assert.equal(extractReceiptLink(`FYI ${MYDATA}`), MYDATA);
  assert.ok(isReceiptLink(EPSILON));
  assert.ok(isReceiptLink(`${EPSILON}/myDATA`));
});

test('extractReceiptLink: prefers a receipt URL among other links in shared text', () => {
  assert.equal(extractReceiptLink(`Δες https://example.com και μετά ${PROVIDER}`), PROVIDER);
  assert.equal(extractReceiptLink('https://google.com/search?q=receipt'), '');
  assert.equal(extractReceiptLink(''), '');
  assert.equal(extractReceiptLink('Δες την απόδειξη χωρίς λινκ'), '');
});

test('receiptLinkError: clear Greek messages when it is not a receipt link', () => {
  assert.equal(receiptLinkError(''), RECEIPT_LINK_MESSAGES.empty);
  assert.equal(receiptLinkError('   '), RECEIPT_LINK_MESSAGES.empty);
  assert.equal(receiptLinkError('Δες την απόδειξη'), RECEIPT_LINK_MESSAGES.missing);
  assert.equal(receiptLinkError('http://e-invoicing.gr/edocuments/ViewInvoice/x'), RECEIPT_LINK_MESSAGES.insecure);
  assert.equal(receiptLinkError('https://example.com/receipt'), RECEIPT_LINK_MESSAGES.notReceipt);
  assert.equal(receiptLinkError(`Δες την απόδειξη: ${PROVIDER}`), '');
  assert.equal(receiptLinkError(AADE), '');
});

test('receipt start form, clipboard paste and share-target are wired', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /Επικόλληση λινκ απόδειξης/);
  assert.match(app, /data-action="receipt-paste-link"/);
  assert.match(app, /openReceiptFromText/);
  assert.match(app, /receiptCode\(extractReceiptLink/);
  assert.match(app, /function takeSharedReceipt/);
  const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.share_target.method, 'POST');
  assert.equal(manifest.share_target.action, './share-target');
  assert.equal(manifest.share_target.params.url, 'url');
  assert.equal(manifest.share_target.params.text, 'text');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /params\.set\('share-target', '1'\)/);
  assert.match(sw, /request\.method === 'GET'/);
});
