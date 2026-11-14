import test from 'node:test';
import assert from 'node:assert/strict';
import { activeBudget, budgetReport, budgetStatus, createBudget, daysLeftInMonth, hasBudget, monthProjection, monthSpend, parseEuro, shouldNotify } from '../src/budget.js';

const now = '2026-11-14T10:00:00.000Z';

test('budget: parseEuro and createBudget validate totals and category limits', () => {
  assert.equal(parseEuro('1.200,50'), 1200.5);
  assert.equal(parseEuro('1.200'), 1200);
  assert.equal(parseEuro('400'), 400);
  assert.equal(parseEuro('  '), null);
  assert.throws(() => parseEuro('-10'));
  const b = createBudget({ total: '1.200', categories: [{ id: 'shopping', amount: '400' }, { id: 'bills', amount: '' }, { id: 'shopping', amount: '10' }] }, now);
  assert.equal(b.total, 1200);
  assert.deepEqual(b.categories, [{ id: 'shopping', amount: 400 }]);
  assert.throws(() => createBudget({ total: '0' }, now));
  assert.throws(() => createBudget({ total: '', categories: [] }, now));
  assert.equal(hasBudget(createBudget({ categories: [{ id: 'shopping', amount: 50 }] }, now)), true);
  assert.equal(activeBudget([{ id: 'month', total: 100, categories: [] }]).total, 100);
});

test('budget: monthSpend uses the same totals as expenses (no double counting of custom categories)', () => {
  const state = {
    purchases: [
      { date: '2026-11-03', price: 80 },
      { date: '2026-11-10', price: 40, expenseCategory: 'clothes' },
      { date: '2026-10-01', price: 999 }
    ],
    extras: [
      { date: '2026-11-05', amount: 12 },
      { date: '2026-11-06', amount: 8, expenseCategory: 'clothes' }
    ],
    transport: [
      { date: '2026-11-02', amount: 20, type: 'fuel' },
      { date: '2026-11-04', amount: 5, type: 'tolls' }
    ],
    bills: [
      { type: 'rent', amount: 300, paid: true, paidAt: '2026-11-01', due: '2026-11-01' },
      { type: 'power', amount: 50, paid: false, due: '2026-11-20' }
    ],
    expenseCategories: [{ id: 'clothes', name: 'Ρούχα', emoji: '👕', createdAt: now }]
  };
  const spend = monthSpend(state, '2026-11');
  // 80 + 40 + 12 + 8 + 20 + 5 + 300 = 465; unpaid bill excluded
  assert.equal(spend.total, 465);
  const by = Object.fromEntries(spend.rows.map((r) => [r.id, r.value]));
  assert.equal(by.shopping, 80);
  assert.equal(by.extras, 12);
  assert.equal(by.transport, 20);
  assert.equal(by.tolls, 5);
  assert.equal(by.rent, 300);
  assert.equal(by.bills, 0);
  assert.equal(by.clothes, 48);
  assert.equal(spend.pending.count, 1);
});

test('budget: progress, 80%/100% colors, remaining, days left and projection', () => {
  assert.equal(budgetStatus(310, 400), 'ok');
  assert.equal(budgetStatus(320, 400), 'warn');
  assert.equal(budgetStatus(400, 400), 'over');
  assert.equal(budgetStatus(200, 400), 'ok');
  assert.equal(daysLeftInMonth('2026-11', '2026-11-14'), 16);
  assert.equal(daysLeftInMonth('2026-11', '2026-11-30'), 0);
  // 14 Nov, spent 140 → 140/14*30 = 300
  assert.equal(monthProjection(140, '2026-11', '2026-11-14'), 300);
  const budget = createBudget({ total: 400, categories: [{ id: 'shopping', amount: 200 }] }, now);
  const spend = { month: '2026-11', total: 330, pending: { count: 0, total: 0 }, rows: [{ id: 'shopping', label: 'Αγορές', emoji: '🛒', value: 210 }] };
  const report = budgetReport(budget, spend, { today: '2026-11-14' });
  assert.equal(report.status, 'over'); // category 210/200 is over, total 310/400 is warn → worst is over
  assert.equal(report.total.status, 'warn');
  assert.equal(report.total.remaining, 70);
  assert.equal(report.total.daysLeft, 16);
  assert.equal(report.categories[0].status, 'over');
  const ok = budgetReport(createBudget({ total: 1000 }, now), { month: '2026-11', total: 310, rows: [] }, { today: '2026-11-14' });
  assert.equal(ok.status, 'ok');
  assert.equal(ok.total.pct, 31);
});

test('budget: notify once at 80% and again when exceeded, per month', () => {
  assert.equal(shouldNotify(null, { month: '2026-11', level: 'warn' }), true);
  assert.equal(shouldNotify({ month: '2026-11', level: 'warn' }, { month: '2026-11', level: 'warn' }), false);
  assert.equal(shouldNotify({ month: '2026-11', level: 'warn' }, { month: '2026-11', level: 'over' }), true);
  assert.equal(shouldNotify({ month: '2026-11', level: 'over' }, { month: '2026-11', level: 'warn' }), false);
  assert.equal(shouldNotify({ month: '2026-10', level: 'over' }, { month: '2026-11', level: 'warn' }), true);
  assert.equal(shouldNotify(null, { month: '2026-11', level: 'ok' }), false);
});
