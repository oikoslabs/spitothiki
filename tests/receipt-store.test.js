import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStore, foldGreek, receiptClassifyText, stripReceiptMarkup } from '../src/receipt-store.js';

test('classifyStore matches Greek names with or without tonos', () => {
  assert.deepEqual(classifyStore('Σκλαβενίτης', 'e-invoicing.gr'), { type: 'supermarket', store: 'Sklavenitis' });
  assert.deepEqual(classifyStore('ΕΛΛΗΝΙΚΕΣ ΥΠΕΡΑΓΟΡΕΣ ΣΚΛΑΒΕΝΙΤΗΣ Α.Ε.Ε.', 'e-invoicing.gr'), { type: 'supermarket', store: 'Sklavenitis' });
  assert.deepEqual(classifyStore('ΜΑΣΟΥΤΗΣ', ''), { type: 'supermarket', store: 'Masoutis' });
  assert.deepEqual(classifyStore('', 'epsilondigital-lidl.epsilonnet.gr'), { type: 'supermarket', store: 'Lidl' });
  assert.equal(foldGreek('ΣΚΛΑΒΕΝΙΤΗΣ'), foldGreek('σκλαβενίτης'));
});

test('classifyStore: franchise fuel issuer plus BP in the receipt text is BP / fuel', () => {
  const issuer = 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΕΝΕΡΓΕΙΑΚΗ Α.Ε.';
  const text = receiptClassifyText({ issuerName: issuer, lines: [{ rawName: 'ΑΜΟΛΥΒΔΗ 95 BP' }] });
  assert.deepEqual(classifyStore(text, 'einvoice.provider.gr'), { type: 'fuel', store: 'BP' });
  const fromPage = receiptClassifyText({
    issuerName: issuer,
    pageText: stripReceiptMarkup('<html><h1>BP</h1><p>Αμόλυβδη 95</p><script>ignored bp</script></html>')
  });
  assert.doesNotMatch(fromPage, /<[^>]+>/);
  assert.doesNotMatch(fromPage, /script/i);
  assert.deepEqual(classifyStore(fromPage, ''), { type: 'fuel', store: 'BP' });
  const trade = receiptClassifyText({ issuerName: issuer, issuerTradeName: 'BP', issuerAddress: 'Λεωφ. Κηφισίας 1' }, 'Diesel');
  assert.deepEqual(classifyStore(trade, ''), { type: 'fuel', store: 'BP' });
});

test('classifyStore: words that only contain the letters bp are not BP', () => {
  const issuer = 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΕΝΕΡΓΕΙΑΚΗ Α.Ε.';
  for (const extra of ['subpage diesel', 'webpage Αμόλυβδη', 'gbp unleaded', 'IBP καύσιμα', 'ABP πετρέλαιο κίνησης']) {
    const text = receiptClassifyText({ issuerName: issuer }, extra);
    assert.deepEqual(classifyStore(text, ''), { type: 'fuel', store: '' }, extra);
  }
});
