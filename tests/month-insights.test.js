import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { daysInMonth, insightChange, insightText, monthInsights, monthToDateWindows, periodTotals, MONTH_INSIGHTS_EN } from '../src/month-insights.js';
import { dictionaries } from '../src/i18n.js';

const money = (n) => `${n.toFixed(2)} €`;

test('month-to-date windows compare the same days last month and clamp short months', () => {
  assert.deepEqual(monthToDateWindows('2026-11-12'), {
    current: { from: '2026-11-01', to: '2026-11-12', month: '2026-11' },
    previous: { from: '2026-10-01', to: '2026-10-12', month: '2026-10' }
  });
  assert.equal(daysInMonth('2026-02'), 28);
  assert.deepEqual(monthToDateWindows('2026-03-31').previous, { from: '2026-02-01', to: '2026-02-28', month: '2026-02' });
  assert.equal(monthToDateWindows('bad'), null);
});

test('insights stay empty without enough data, and never send anything', () => {
  assert.deepEqual(monthInsights({ purchases: [] }, '2026-11-12'), []);
  assert.deepEqual(monthInsights({
    purchases: [{ price: 20, date: '2026-11-05', category: 'Άλλο' }]
  }, '2026-11-12'), []); // no previous period
  const src = readFileSync(new URL('../src/month-insights.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|navigator\.sendBeacon/);
});

test('period totals use the same categories as the monthly overview, only inside the range', () => {
  const state = {
    purchases: [
      { price: 40, date: '2026-11-05', category: 'Άλλο' },
      { price: 10, date: '2026-11-20', category: 'Άλλο' },
      { price: 5, date: '2026-10-02', category: 'Άλλο' }
    ],
    extras: [{ amount: 4, date: '2026-11-03', qty: 1 }],
    transport: [
      { amount: 12, date: '2026-11-08', type: 'fuel' },
      { amount: 3, date: '2026-11-09', type: 'tolls' }
    ],
    bills: [
      { paid: true, type: 'rent', amount: 100, due: '2026-11-01', paidAt: '2026-11-01', countBy: 'paid' },
      { paid: true, type: 'electricity', amount: 50, due: '2026-11-15', paidAt: '2026-11-15', countBy: 'paid' }
    ]
  };
  const mid = periodTotals(state, '2026-11-01', '2026-11-12');
  assert.equal(mid.total, 40 + 4 + 12 + 3 + 100);
  const by = Object.fromEntries(mid.rows.map((r) => [r.id, r.value]));
  assert.equal(by.shopping, 40);
  assert.equal(by.extras, 4);
  assert.equal(by.transport, 12);
  assert.equal(by.tolls, 3);
  assert.equal(by.rent, 100);
  assert.equal(by.bills, 0); // electricity paid after the 12th
  const full = periodTotals(state, '2026-11-01', '2026-11-30');
  assert.equal(full.total, 40 + 10 + 4 + 12 + 3 + 100 + 50);
});

test('home insights: 1–3 lines, same-period comparison, hide when flat data is missing', () => {
  const state = {
    purchases: [
      { price: 100, date: '2026-10-05', category: 'Άλλο' },
      { price: 118, date: '2026-11-05', category: 'Άλλο' },
      { price: 80, date: '2026-10-20', category: 'Άλλο' } // after the 12th: must not count in the comparison
    ],
    extras: [
      { amount: 20, date: '2026-10-04' },
      { amount: 10, date: '2026-11-04' }
    ]
  };
  const list = monthInsights(state, '2026-11-12');
  assert.ok(list.length >= 1 && list.length <= 3);
  const total = list.find((x) => x.kind === 'total');
  assert.ok(total);
  assert.equal(total.dir, 'up');
  // current MTD: 118 + 10 = 128; previous same days: 100 + 20 = 120 → about +7%
  assert.equal(total.current, 128);
  assert.equal(total.previous, 120);
  assert.equal(total.percent, 7);
  // «Αγορές» is most of the total, so it is not repeated as its own line.
  assert.equal(list.some((x) => x.categoryId === 'shopping'), false);
  const extras = list.find((x) => x.categoryId === 'extras');
  assert.ok(extras);
  assert.equal(extras.dir, 'down');
  assert.equal(extras.current, 10);
  assert.equal(extras.previous, 20);
});

test('insight wording and English strings', () => {
  const up = insightText({ kind: 'total', dir: 'up', percent: 18, current: 118, previous: 100 }, { money });
  assert.match(up, /18%/);
  assert.match(up, /118.00 €/);
  assert.match(up, /ίδιο διάστημα/);
  const cat = insightText({ kind: 'category', dir: 'up', percent: 18, label: 'Αγορές', current: 118, previous: 100 }, { money, categoryLabel: (s) => s });
  assert.match(cat, /Αγορές/);
  for (const [el, en] of Object.entries(MONTH_INSIGHTS_EN)) {
    assert.ok(String(en).trim(), el);
    assert.equal(dictionaries.en[el], en);
  }
});

test('huge changes use a simple × (or 1/n) instead of a four-digit percent', () => {
  const jump = { kind: 'total', dir: 'up', percent: 1138, current: 978, previous: 79 };
  assert.deepEqual(insightChange(jump).label, '12×');
  const text = insightText(jump, { money });
  assert.match(text, /12× περισσότερα/);
  assert.doesNotMatch(text, /1138%|1132%/);
  const drop = { kind: 'total', dir: 'down', percent: 92, current: 79, previous: 978 };
  assert.deepEqual(insightChange(drop).label, '1/12');
  assert.match(insightText(drop, { money }), /περίπου το 1\/12/);
  assert.equal(insightChange({ kind: 'total', dir: 'up', percent: 150, current: 250, previous: 100 }).label, '2,5×');
  assert.equal(insightChange({ kind: 'total', dir: 'up', percent: 150, current: 250, previous: 100 }, { locale: 'en-GB' }).label, '2.5×');
  assert.equal(insightChange({ kind: 'total', dir: 'up', percent: 18, current: 118, previous: 100 }).label, '18%');
});

test('home insight body uses the theme text colour; only the arrow and change are tinted, with AA contrast', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const block = app.slice(app.indexOf('function renderHomeChanged'), app.indexOf('function renderOverview'));
  assert.match(block, /home-changed-mark/);
  assert.match(block, /home-changed-pct/);
  assert.match(block, /insightChange/);
  assert.match(css, /\.home-changed-item \{ color: var\(--ink\)/);
  assert.doesNotMatch(css, /\.home-changed-item\.up \{ color:/);
  assert.doesNotMatch(css, /\.home-changed-item\.down \{ color:/);
  assert.match(css, /\.home-changed-item\.up \.home-changed-mark,/);
  assert.match(css, /color: var\(--red\)/);
  assert.match(css, /color: var\(--green\)/);

  const rel = (hex) => {
    const n = hex.replace('#', '');
    const rgb = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = rgb.map(f);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [l1, l2] = [rel(a), rel(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const varsOf = (selector) => {
    const start = css.indexOf(selector);
    assert.ok(start >= 0, selector);
    const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    const expand = (hex) => hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex;
    return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map((m) => [m[1], expand(m[2].toLowerCase())]));
  };
  const themes = [
    { name: 'light', vars: varsOf(':root {') },
    { name: 'dark', vars: { ...varsOf(':root {'), ...varsOf(':root[data-theme="dark"] {') } },
    { name: 'high-contrast light', vars: { ...varsOf(':root {'), ...varsOf(':root[data-contrast="high"] {') } },
    { name: 'high-contrast dark', vars: { ...varsOf(':root {'), ...varsOf(':root[data-contrast="high"] {'), ...varsOf(':root[data-contrast="high"][data-dark="1"] {') } }
  ];
  for (const { name, vars } of themes) {
    const bg = vars.surface;
    for (const token of ['ink', 'red', 'green']) {
      const ratio = contrast(vars[token], bg);
      assert.ok(ratio >= 4.5, `${name} --${token} ${vars[token]} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('home card is hideable in Αρχική οθόνη settings and hidden without data', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /function renderHomeChanged/);
  assert.match(app, /\$\{renderHomeChanged\(\)\}/);
  assert.match(app, /id="home-changed"/);
  assert.match(app, /id="home-choice-insights"/);
  assert.match(app, /data-home-insights/);
  assert.match(app, /if \(!homeState\(\)\.insights\) return ''/);
  assert.match(app, /monthInsights\(state, localDateKey\(\)\)/);
  assert.match(app, /saveHome\(\[\.\.\.DEFAULT_HOME\], true, true, true, true\)/);
  assert.match(app, /home-changed-mark/);
  assert.match(app, /home-changed-pct/);
});
