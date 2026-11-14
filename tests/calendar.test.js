import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  autoEntries, billCalendarStatus, buildIcs, calendarEntries, calendarProEnabled, createEvent,
  dayDots, dotKind, entriesOn, eventOccurrences, googleEventUrl, monthBounds, monthGrid,
  personColor, shortDayMonth, shouldNotify, userEntries, weekBounds
} from '../src/calendar.js';
import { EXTRA_KINDS } from '../src/storage.js';

const now = '2026-11-14T16:28:00.000Z';

test('calendar: createEvent validates title, date and time; recurrence is Pro-gated', () => {
  assert.throws(() => createEvent({ date: '2026-11-14' }, now), /τίτλο/);
  assert.throws(() => createEvent({ title: 'Γιατρός' }, now), /ημερομηνία/i);
  assert.throws(() => createEvent({ title: 'Γιατρός', date: '2026-11-14', time: '9:00' }, now), /ώρα/i);
  const ev = createEvent({ title: '  Γιατρός  ', date: '2026-11-14', time: '18:30', person: 'Μαρία', notes: 'ετήσιος', recur: 'yearly' }, now);
  assert.equal(ev.title, 'Γιατρός');
  assert.equal(ev.time, '18:30');
  assert.equal(ev.person, 'Μαρία');
  assert.equal(ev.recur, 'yearly');
  const free = createEvent({ title: 'Γιατρός', date: '2026-11-14', recur: 'weekly' }, now, { pro: false });
  assert.equal(free.recur, '');
  assert.equal(calendarProEnabled(), true);
});

test('calendar: weekly, monthly and yearly occurrences stay inside the range', () => {
  assert.deepEqual(eventOccurrences({ date: '2026-11-01', recur: 'weekly' }, '2026-11-01', '2026-11-30'),
    ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  assert.deepEqual(eventOccurrences({ date: '2026-01-31', recur: 'monthly' }, '2026-01-01', '2026-04-30'),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(eventOccurrences({ date: '2024-02-29', recur: 'yearly' }, '2024-01-01', '2027-03-01'),
    ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28']);
  assert.deepEqual(eventOccurrences({ date: '2026-10-20' }, '2026-11-01', '2026-11-30'), []);
});

test('calendar: week starts Monday; November 2026 month grid starts 26 Oct', () => {
  assert.deepEqual(weekBounds('2026-11-14'), { from: '2026-11-09', to: '2026-11-15' });
  assert.deepEqual(weekBounds('2026-11-09'), { from: '2026-11-09', to: '2026-11-15' });
  assert.deepEqual(weekBounds('2026-11-15'), { from: '2026-11-09', to: '2026-11-15' });
  assert.deepEqual(monthBounds('2026-11'), { from: '2026-11-01', to: '2026-11-30', month: '2026-11', days: 30 });
  const grid = monthGrid('2026-11');
  assert.equal(grid.length, 42);
  assert.equal(grid[0].date, '2026-10-26');
  assert.equal(grid[0].inMonth, false);
  assert.equal(grid[6].date, '2026-11-01');
  assert.equal(grid[6].inMonth, true);
});

test('calendar: auto entries include every expiry in range, bills, standing orders and chore dues', () => {
  const state = {
    items: [
      { id: 'i1', name: 'Γάλα', expiry: '2026-11-16' },
      { id: 'i2', name: 'Γιαούρτι', expiry: '2026-10-01' },
      { id: 'i3', name: 'Ψωμί', expiry: '2026-12-01' }
    ],
    bills: [
      { id: 'b1', name: 'ΔΕΗ', due: '2026-11-20', amount: 80, autoPay: false, paid: false },
      { id: 'b2', name: 'Netflix', due: '2026-11-05', amount: 12, autoPay: true, paid: false },
      { id: 'b3', name: 'Νερό', due: '2026-12-10', amount: 20, autoPay: false }
    ],
    chores: [
      { id: 'c1', name: 'Σκούπισμα', start: '2026-11-01', every: 7, history: [], assignee: 'Γιάννης' },
      { id: 'c2', name: 'Σκουπίδια', start: '2026-10-20', every: 7, history: [] }
    ]
  };
  const rows = autoEntries(state, '2026-11-01', '2026-11-30');
  assert.ok(rows.some((r) => r.source === 'expiry' && r.sourceId === 'i1' && r.date === '2026-11-16'));
  assert.ok(!rows.some((r) => r.sourceId === 'i2' || r.sourceId === 'i3'));
  assert.ok(rows.some((r) => r.source === 'bill' && r.sourceId === 'b1' && r.date === '2026-11-20'));
  assert.ok(rows.some((r) => r.source === 'debit' && r.sourceId === 'b2' && r.title === 'Netflix'));
  const sweep = rows.filter((r) => r.sourceId === 'c1').map((r) => r.date);
  assert.deepEqual(sweep, ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  const trash = rows.filter((r) => r.sourceId === 'c2');
  assert.ok(trash.some((r) => r.overdue && r.date === '2026-11-01'));
  assert.ok(trash.some((r) => r.date === '2026-11-03' && !r.overdue));
  assert.equal(trash.filter((r) => r.date === '2026-11-01').length, 1);
});

test('calendar: bill entries show unpaid, overdue and paid status; stay on the due date', () => {
  const today = '2026-11-14';
  const unpaid = billCalendarStatus({ due: '2026-11-20', paid: false }, today);
  assert.equal(unpaid.pending, true);
  assert.equal(unpaid.overdue, false);
  assert.equal(unpaid.paid, false);
  const overdue = billCalendarStatus({ due: '2026-11-10', paid: false }, today);
  assert.equal(overdue.pending, true);
  assert.equal(overdue.overdue, true);
  const paid = billCalendarStatus({ due: '2026-11-14', paid: true, paidAt: '2026-11-12' }, today);
  assert.equal(paid.paid, true);
  assert.equal(paid.paidAt, '2026-11-12');
  assert.equal(paid.pending, false);
  assert.equal(paid.overdue, false);
  assert.equal(shortDayMonth('2026-11-12', today), '12/11');
  assert.equal(shortDayMonth('2025-12-03', today), '3/12/2025');
  const debitUnpaid = billCalendarStatus({ due: '2026-11-10', paid: false, autoPay: true }, today);
  assert.equal(debitUnpaid.debit, true);
  assert.equal(debitUnpaid.pending, false);
  assert.equal(debitUnpaid.overdue, false);
  const debitPaid = billCalendarStatus({ due: '2026-11-05', paid: true, paidAt: '2026-11-05', autoPay: true }, today);
  assert.equal(debitPaid.paid, true);
  assert.equal(debitPaid.paidAt, '2026-11-05');

  const rows = autoEntries({
    bills: [
      { id: 'b-unpaid', name: 'ΔΕΗ', due: '2026-11-20', amount: 80, paid: false },
      { id: 'b-late', name: 'Νερό', due: '2026-11-08', amount: 20, paid: false },
      { id: 'b-paid', name: 'Ενοίκιο', due: '2026-11-01', amount: 400, paid: true, paidAt: '2026-11-12' },
      { id: 'b-debit', name: 'Netflix', due: '2026-11-05', amount: 12, autoPay: true, paid: false },
      { id: 'b-debit-paid', name: 'Cosmote', due: '2026-11-03', amount: 25, autoPay: true, paid: true, paidAt: '2026-11-03' }
    ]
  }, '2026-11-01', '2026-11-30', { today });
  const byId = Object.fromEntries(rows.map((r) => [r.sourceId, r]));
  assert.equal(byId['b-unpaid'].pending, true);
  assert.equal(byId['b-unpaid'].date, '2026-11-20');
  assert.equal(byId['b-late'].overdue, true);
  assert.equal(byId['b-late'].pending, true);
  assert.equal(byId['b-paid'].paid, true);
  assert.equal(byId['b-paid'].date, '2026-11-01');
  assert.equal(byId['b-paid'].paidAt, '2026-11-12');
  assert.equal(byId['b-debit'].source, 'debit');
  assert.equal(byId['b-debit'].pending, false);
  assert.equal(byId['b-debit'].overdue, false);
  assert.equal(byId['b-debit-paid'].paid, true);
  assert.equal(byId['b-debit-paid'].paidAt, '2026-11-03');
});

test('calendar: user events merge with auto items and sort by date then time', () => {
  const ev = createEvent({ title: 'Γιατρός', date: '2026-11-14', time: '18:30', recur: 'weekly' }, now);
  const state = {
    items: [{ id: 'i1', name: 'Γάλα', expiry: '2026-11-14' }],
    bills: [],
    chores: [],
    events: [ev]
  };
  const rows = calendarEntries(state, '2026-11-14', '2026-11-21');
  assert.equal(entriesOn(rows, '2026-11-14').length, 2);
  assert.ok(rows.some((r) => r.source === 'event' && r.date === '2026-11-21' && r.time === '18:30'));
  const weekOnly = userEntries([ev], '2026-11-14', '2026-11-21', { pro: false });
  assert.equal(weekOnly.length, 1);
});

test('calendar: .ics export and Google Calendar template link', () => {
  const ev = createEvent({ title: 'Γιατρός', date: '2026-11-14', time: '18:30', notes: 'ετήσιος', recur: 'yearly' }, now);
  const ics = buildIcs([{ ...ev, id: ev.id, title: ev.title, date: ev.date, time: ev.time, notes: ev.notes, recur: ev.recur }], { now });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Γιατρός/);
  assert.match(ics, /DTSTART:20261114T183000/);
  assert.match(ics, /RRULE:FREQ=YEARLY/);
  assert.match(ics, /BEGIN:VALARM/);
  const allDay = buildIcs([{ id: 'expiry:i1:2026-11-16', title: 'Γάλα', date: '2026-11-16' }], { now });
  assert.match(allDay, /DTSTART;VALUE=DATE:20261116/);
  const url = googleEventUrl({ title: 'Γιατρός', date: '2026-11-14', time: '18:30', notes: 'ετήσιος' });
  assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(url, /text=%CE%93%CE%B9%CE%B1%CF%84%CF%81%CF%8C%CF%82/);
});

test('calendar: in-app reminder fires once per day, again if the count grows', () => {
  assert.equal(shouldNotify(null, { day: '2026-11-14', count: 2 }), true);
  assert.equal(shouldNotify({ day: '2026-11-14', count: 2 }, { day: '2026-11-14', count: 2 }), false);
  assert.equal(shouldNotify({ day: '2026-11-14', count: 1 }, { day: '2026-11-14', count: 2 }), true);
  assert.equal(shouldNotify({ day: '2026-11-13', count: 9 }, { day: '2026-11-14', count: 1 }), true);
  assert.equal(shouldNotify({ day: '2026-11-14', count: 1 }, { day: '2026-11-14', count: 0 }), false);
});

test('calendar: per-member colors are stable; events kind syncs without new rules', () => {
  assert.equal(personColor('Μαρία'), personColor('Μαρία'));
  assert.notEqual(personColor('Μαρία'), personColor('Γιάννης'));
  assert.equal(personColor('all'), '');
  assert.ok(EXTRA_KINDS.includes('events'));
  assert.ok(EXTRA_KINDS.includes('budgets'));
});

test('calendar: page, home Today card and cache are wired', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const bar = readFileSync(new URL('../src/bar.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/home-actions.js', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../src/guide.js', import.meta.url), 'utf8');
  assert.match(app, /activeView === 'calendar'/);
  assert.match(bar, /view:calendar/);
  assert.match(app, /id: 'calendar', icon:/);
  assert.match(app, /function renderHomeCalendar/);
  assert.match(app, /function calendarBillStatusLine/);
  assert.match(app, /openBillDialog\(sourceId\)/);
  assert.match(app, /is-overdue/);
  assert.match(app, /checkCalendarNotifications/);
  assert.match(app, /TODO\(pro\)|calendarProEnabled/);
  assert.match(html, /data-view="calendar"/);
  assert.match(html, /Ημερολόγιο/);
  assert.match(sw, /CACHE_VERSION = 'v143'/);
  assert.match(sw, /src\/calendar\.js/);
  assert.match(home, /calendar: v\.calendar !== false/);
  assert.match(guide, /id: 'calendar'/);
});

test('calendar: day dots are unique, typed and capped at 3', () => {
  assert.equal(dotKind({ source: 'bill', pending: true, paid: false }), 'bill');
  assert.equal(dotKind({ source: 'bill', overdue: true, paid: false }), 'bill');
  assert.equal(dotKind({ source: 'bill', paid: true, pending: false }), 'other');
  assert.equal(dotKind({ source: 'debit', pending: false }), 'other');
  assert.equal(dotKind({ source: 'expiry' }), 'expiry');
  assert.equal(dotKind({ source: 'event' }), 'event');
  assert.equal(dotKind({ source: 'chore' }), 'other');
  const entries = [
    { source: 'chore' },
    { source: 'bill', pending: true, paid: false },
    { source: 'bill', overdue: true, paid: false },
    { source: 'expiry' },
    { source: 'event' },
    { source: 'debit' }
  ];
  assert.deepEqual(dayDots(entries), ['bill', 'expiry', 'event']);
  assert.deepEqual(dayDots([{ source: 'chore' }, { source: 'debit' }]), ['other']);
  assert.deepEqual(dayDots([]), []);
});

test('calendar: tapping a month day opens a bottom sheet, not an inline list', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../src/guide.js', import.meta.url), 'utf8');
  assert.match(html, /id="cal-day-sheet"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="cal-day-title"/);
  assert.match(app, /function openCalDaySheet/);
  assert.match(app, /function closeCalDaySheet/);
  assert.match(app, /afterPaint\(\(\) => openCalDaySheet/);
  assert.match(app, /data-action="calendar-add"/);
  assert.match(app, /Πρόσθεσε γεγονός/);
  assert.match(app, /dayDots\(on\)/);
  assert.match(app, /cal-dot is-\$\{kind\}/);
  assert.doesNotMatch(app, /on\.slice\(0, 4\)/);
  assert.match(css, /\.cal-dot\.is-bill/);
  assert.match(css, /\.cal-dot\.is-expiry/);
  assert.match(css, /\.cal-dot\.is-event/);
  assert.match(css, /\.cal-day-sheet/);
  assert.match(guide, /Τι νέο στην 1\.9\.34/);
  assert.match(guide, /χρωματιστές τελείες/);
});
