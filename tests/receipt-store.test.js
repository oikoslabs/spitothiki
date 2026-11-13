import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStore, foldGreek } from '../src/receipt-store.js';

test('classifyStore matches Greek names with or without tonos', () => {
  assert.deepEqual(classifyStore('Σκλαβενίτης', 'e-invoicing.gr'), { type: 'supermarket', store: 'Sklavenitis' });
  assert.deepEqual(classifyStore('ΕΛΛΗΝΙΚΕΣ ΥΠΕΡΑΓΟΡΕΣ ΣΚΛΑΒΕΝΙΤΗΣ Α.Ε.Ε.', 'e-invoicing.gr'), { type: 'supermarket', store: 'Sklavenitis' });
  assert.deepEqual(classifyStore('ΜΑΣΟΥΤΗΣ', ''), { type: 'supermarket', store: 'Masoutis' });
  assert.deepEqual(classifyStore('', 'epsilondigital-lidl.epsilonnet.gr'), { type: 'supermarket', store: 'Lidl' });
  assert.equal(foldGreek('ΣΚΛΑΒΕΝΙΤΗΣ'), foldGreek('σκλαβενίτης'));
});
