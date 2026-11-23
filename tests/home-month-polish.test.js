import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { insightShort, spendSlices } from '../src/month-insights.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('short comparison lines: one short line each', () => {
  assert.equal(insightShort({ kind: 'total', dir: 'up', percent: 18, current: 118, previous: 100 }).text, '+18% από τον προηγούμενο μήνα');
  assert.equal(insightShort({ kind: 'total', dir: 'down', percent: 18, current: 82, previous: 100 }).text, '\u221218% από τον προηγούμενο μήνα');
  assert.equal(insightShort({ kind: 'total', dir: 'up', percent: 230, current: 330, previous: 100 }).text, '3,3× περισσότερα από τον προηγούμενο μήνα');
  assert.equal(insightShort({ kind: 'total', dir: 'down', percent: 92, current: 79, previous: 978 }).text, 'Περίπου το 1/12 του προηγούμενου μήνα');
  assert.equal(insightShort({ kind: 'total', dir: 'same', percent: 0, current: 100, previous: 100 }).text, 'Περίπου ίδια με τον προηγούμενο μήνα');
  assert.equal(insightShort({ kind: 'category', dir: 'up', percent: 18, label: 'Αγορές', current: 118, previous: 100 }).text, 'Αγορές: +18%');
  assert.equal(insightShort({ kind: 'category', dir: 'up', percent: 250, label: 'Διόδια', current: 35, previous: 10 }).text, 'Διόδια: 3,5× περισσότερα');
  for (const ins of [{ kind: 'total', dir: 'up', percent: 18, current: 118, previous: 100 }, { kind: 'category', dir: 'down', percent: 40, label: 'Ενοίκιο / κοινόχρηστα', current: 60, previous: 100 }]) {
    assert.ok(insightShort(ins).text.length <= 40, insightShort(ins).text);
  }
});

test('donut slices: top 5 by amount, the rest folded into «Άλλα», zero rows hidden', () => {
  const rows = [10, 0, 50, 5, 40, 3, 2, 30].map((value, i) => ({ label: `c${i}`, value }));
  const s = spendSlices(rows, { limit: 5, otherLabel: 'Άλλα' });
  assert.deepEqual(s.map((x) => x.label), ['c2', 'c4', 'c7', 'c0', 'c3', 'Άλλα']);
  assert.equal(s.at(-1).value, 5);
  assert.ok(Math.abs(s.reduce((a, x) => a + x.share, 0) - 1) < 1e-9);
  // exactly 6 spent categories: show all 6 instead of «Άλλα» with a single row
  assert.equal(spendSlices(rows.slice(0, 7).concat([{ label: 'z', value: 0 }]), { limit: 5 }).some((x) => x.other), false);
  assert.deepEqual(spendSlices([{ label: 'a', value: 0 }]), []);
});

test('home month card: big total, pure SVG donut, legend; no external chart library', () => {
  const app = read('src/app.js');
  const css = read('styles.css');
  assert.match(app, /id="home-month-total"/);
  assert.match(app, /t\('Αυτόν τον μήνα'\)/);
  assert.match(app, /class="home-donut"/);
  assert.match(app, /id="home-month-legend"/);
  assert.match(app, /insightShort\(ins/);
  assert.doesNotMatch(read('index.html'), /chart\.js|cdn\.jsdelivr|unpkg/i);
  // chart colours are graphics: at least 3:1 against the card surface in light and dark
  const lum = (hex) => { const n = hex.replace('#', ''); const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const light = css.match(/^:root \{ --chart-1[^}]+\}/m)[0];
  const dark = css.match(/^:root\[data-theme="dark"\] \{ --chart-1[^}]+\}/m)[0];
  for (const [block, bg] of [[light, '#ffffff'], [dark, '#1a241f']]) {
    for (const hex of block.match(/#[0-9a-f]{6}/gi)) assert.ok(ratio(hex, bg) >= 3, `${hex} on ${bg}: ${ratio(hex, bg).toFixed(2)}`);
  }
  assert.doesNotMatch(app, /Σκολαρ|Skolarikis/);
});
