import test from 'node:test';
import assert from 'node:assert/strict';
import { ean13Valid, gtinValid, shortGtin, parseVariableMeasure, parseGs1, interpretCode } from '../src/gs1.js';

const ean = (body12) => { const s = [...body12].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0); return body12 + ((10 - (s % 10)) % 10); };

test('EAN/GTIN check digits', () => {
  assert.ok(ean13Valid('5201004021403'));
  assert.ok(ean13Valid('4006381333931'));
  assert.ok(!ean13Valid('4006381333932'));
  assert.ok(gtinValid('09506000134352'));
  assert.ok(gtinValid('96385074'));
  assert.equal(shortGtin('05201004021403'), '5201004021403');
  assert.equal(shortGtin('00000096385074'), '96385074');
});

test('variable-measure EAN-13: GS1 Greece weight, in-store price/weight, plausibility, store override', () => {
  const gs1gr = parseVariableMeasure(ean('274560100547')); // GS1 Greece example: 27456 + 01 + 00547 g
  assert.equal(gs1gr.mode, 'weight'); assert.equal(gs1gr.weightKg, 0.547); assert.equal(gs1gr.id, '2745601'); assert.equal(gs1gr.reason, 'gs1-greece');
  const deli = parseVariableMeasure(ean('210123401250')); // in-store, 1250 -> 1,250 kg by plausibility
  assert.equal(deli.mode, 'weight'); assert.equal(deli.weightKg, 1.25); assert.equal(deli.plu, '01234'); assert.ok(deli.auto);
  const asPrice = parseVariableMeasure(ean('210123401250'), { mode: 'price' });
  assert.equal(asPrice.price, 12.5); assert.equal(asPrice.weightKg, null); assert.equal(asPrice.auto, false);
  assert.equal(parseVariableMeasure(ean('230000500035')).mode, 'price'); // 35 -> 0,35 € (35 g implausible)
  assert.equal(parseVariableMeasure(ean('230000545000')).mode, 'price'); // 45000 -> 450 € not 45 kg
  assert.equal(parseVariableMeasure(ean('220000100899'), { memoryUnit: 'τεμ.' }).price, 8.99);
  assert.equal(parseVariableMeasure(ean('280000100899'), { mode: 'price' }).price, 8.99); // store can override 25-29 too
  assert.equal(parseVariableMeasure('2101234012501'), null); // bad check digit (correct is computed)
  assert.equal(parseVariableMeasure(ean('520100402140')), null); // ordinary GTIN
  const same = [ean('210123400500'), ean('210123401999')].map((c) => parseVariableMeasure(c).id);
  assert.equal(same[0], same[1]); // identity = prefix + PLU, not the full code
});

test('GS1 element strings with FNC1/GS, symbology ids, brackets', () => {
  const GS = '\u001d';
  const dm = parseGs1(`]d201095060001343521726043010ABC123${GS}3103000750`);
  assert.equal(dm.gtin, '09506000134352'); assert.equal(dm.barcode, '9506000134352');
  assert.equal(dm.expiry, '2026-04-30'); assert.equal(dm.batch, 'ABC123'); assert.equal(dm.weightKg, 0.75);
  const monthEnd = parseGs1(`010520100402140317270200`);
  assert.equal(monthEnd.expiry, '2027-02-28'); // DD=00 -> last day of month
  const leap = parseGs1(`010520100402140317280200`);
  assert.equal(leap.expiry, '2028-02-29');
  const qr = parseGs1(`]Q3010520100402140315261231${GS}10L-77${GS}39220499`);
  assert.equal(qr.bestBefore, '2026-12-31'); assert.equal(qr.date, '2026-12-31'); assert.equal(qr.batch, 'L-77'); assert.equal(qr.price, 4.99);
  const human = parseGs1('(01)05201004021403(17)261115(10)B42(3102)001234');
  assert.equal(human.expiry, '2026-11-15'); assert.equal(human.batch, 'B42'); assert.equal(human.weightKg, 12.34);
  const fnc1Lead = parseGs1(`${GS}0105201004021403${GS}17261115`);
  assert.equal(fnc1Lead.expiry, '2026-11-15');
  const cur = parseGs1(`0105201004021403393297801299`);
  assert.equal(cur.price, 12.99);
  const varBeforeFixed = parseGs1(`0105201004021403${GS}21SER9${GS}17270131`);
  assert.equal(varBeforeFixed.serial, 'SER9'); assert.equal(varBeforeFixed.expiry, '2027-01-31');
  assert.equal(parseGs1('0105201004021402'), null); // bad GTIN check
  assert.equal(parseGs1('hello'), null);
  assert.equal(parseGs1('https://example.com/menu'), null);
});

test('GS1 Digital Link URLs', () => {
  const a = parseGs1('https://id.gs1.org/01/09506000134352/10/ABC%2F1?17=261231&3103=000500');
  assert.equal(a.gtin, '09506000134352'); assert.equal(a.batch, 'ABC/1'); assert.equal(a.expiry, '2026-12-31'); assert.equal(a.weightKg, 0.5);
  const b = parseGs1('https://brand.example.gr/products/01/05201004021403/21/XYZ?15=270600&3922=349');
  assert.equal(b.barcode, '5201004021403'); assert.equal(b.bestBefore, '2027-06-30'); assert.equal(b.price, 3.49); assert.equal(b.serial, 'XYZ');
});

test('interpretCode routes plain, variable-measure and GS1 codes', () => {
  assert.deepEqual(interpretCode('5201004021403'), { kind: 'plain', barcode: '5201004021403', raw: '5201004021403' });
  const vm = interpretCode(ean('210123400899'), { vmMode: (p) => (p === '21' ? 'price' : 'auto') });
  assert.equal(vm.kind, 'vm'); assert.equal(vm.barcode, '2101234'); assert.equal(vm.price, 8.99);
  const memo = interpretCode(ean('200555500450'), { memoryUnit: (id) => (id === '2005555' ? 'κιλά' : '') });
  assert.equal(memo.weightKg, 0.45); assert.equal(memo.reason, 'memory');
  const g = interpretCode('https://id.gs1.org/01/05201004021403?17=261100');
  assert.equal(g.kind, 'gs1'); assert.equal(g.barcode, '5201004021403'); assert.equal(g.expiry, '2026-11-30');
  assert.equal(interpretCode('not a code').barcode, '');
});
