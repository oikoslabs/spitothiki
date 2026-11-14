import test from 'node:test';
import assert from 'node:assert/strict';
import { monthReport, svgBars, svgWeekLine } from '../src/reports.js';

test('reports: month report totals match period spending and emit SVG charts', () => {
  const state = {
    purchases: [{ date: '2026-11-05', price: 20 }],
    extras: [{ date: '2026-11-12', amount: 10 }],
    transport: [{ date: '2026-11-03', amount: 5, type: 'fuel' }],
    bills: [],
    expenseCategories: []
  };
  const report = monthReport(state, '2026-11');
  assert.equal(report.current.total, 35);
  assert.ok(report.weeks.length >= 4);
  assert.ok(report.top.some((r) => r.value === 20));
  const bars = svgBars(report.top);
  assert.match(bars, /<svg/);
  assert.match(svgWeekLine(report.weeks), /<svg/);
});
