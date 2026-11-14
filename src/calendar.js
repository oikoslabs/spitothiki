// Household calendar. Auto entries (expiry, bills, standing orders, chores) are
// read-only. User events sync as a `events` list (existing record shape) — no rules change.
//
// TODO(pro): once src/pro.js (PR40) is on this branch, import { isPro } from './pro.js'
// and make calendarProEnabled() return isPro(). Recurrence and per-member colors are
// specified as Pro; until then they stay available to everyone (no silent downgrade).

import { addDays } from './features.js';
import { nextDue } from './chores.js';
import { daysInMonth } from './month-insights.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const makeId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clip = (s, n) => String(s || '').trim().slice(0, n);

export const PERSON_ALL = 'all';
export const NOTICE_KEY = 'spitothiki:calendar-notice';
export const RECUR_OPTIONS = [
  { id: '', label: 'Χωρίς επανάληψη' },
  { id: 'weekly', label: 'Κάθε εβδομάδα' },
  { id: 'monthly', label: 'Κάθε μήνα' },
  { id: 'yearly', label: 'Κάθε χρόνο' }
];
export const PERSON_COLORS = ['#2f7c4a', '#3b6ea8', '#b45309', '#7c3aed', '#be185d', '#0f766e'];

export function calendarProEnabled() {
  // TODO(pro): return isPro() when the Pro entitlement module is merged onto this branch.
  return true;
}

export function personColor(person) {
  const key = String(person || '').trim();
  if (!key || key === PERSON_ALL) return '';
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[h % PERSON_COLORS.length];
}

export function createEvent(input = {}, now = new Date().toISOString(), { pro = calendarProEnabled() } = {}) {
  const title = clip(input.title, 80);
  if (!title) throw new Error('Γράψε έναν τίτλο.');
  if (!DATE.test(String(input.date || ''))) throw new Error('Βάλε ημερομηνία.');
  const time = String(input.time || '').trim();
  if (time && !TIME.test(time)) throw new Error('Η ώρα δεν είναι έγκυρη (π.χ. 18:30).');
  const recur = pro && ['weekly', 'monthly', 'yearly'].includes(input.recur) ? input.recur : '';
  return {
    id: input.id || makeId('ev'),
    title,
    date: input.date,
    time: time || '',
    person: clip(input.person, 40),
    notes: clip(input.notes, 240),
    recur,
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function addMonths(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  const dt = new Date(Date.UTC(y, m - 1 + months, day));
  return dt.toISOString().slice(0, 10);
}

export function eventOccurrences(event, from, to) {
  if (!event || !DATE.test(event.date) || event.date > to) return [];
  const recur = event.recur || '';
  if (!recur) return event.date >= from && event.date <= to ? [event.date] : [];
  const out = [];
  let n = 0;
  let d = event.date;
  while (d <= to && n < 400) {
    if (d >= from) out.push(d);
    n += 1;
    if (recur === 'weekly') d = addDays(event.date, 7 * n);
    else if (recur === 'monthly') d = addMonths(event.date, n);
    else if (recur === 'yearly') d = addMonths(event.date, 12 * n);
    else break;
  }
  return out;
}

// Compact day/month for «✓ Πληρώθηκε 12/11». Include the year when it differs from `today`.
export function shortDayMonth(date, today = '') {
  if (!DATE.test(date)) return '';
  const [y, m, d] = date.split('-').map(Number);
  const core = `${d}/${m}`;
  if (DATE.test(today) && today.slice(0, 4) !== String(y)) return `${core}/${y}`;
  return core;
}

export function billCalendarStatus(bill = {}, today = '') {
  const due = String(bill.due || '');
  const paid = Boolean(bill.paid);
  const paidAt = paid && DATE.test(String(bill.paidAt || '').slice(0, 10)) ? String(bill.paidAt).slice(0, 10) : (paid ? '' : '');
  const debit = Boolean(bill.autoPay);
  const overdue = Boolean(!paid && !debit && DATE.test(due) && DATE.test(today) && due < today);
  const pending = Boolean(!paid && !debit);
  return { paid, paidAt, debit, overdue, pending };
}

export function monthBounds(month) {
  const days = daysInMonth(month);
  if (!days) return null;
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, '0')}`, month, days };
}

// Monday-first week containing `today`.
export function weekBounds(today) {
  if (!DATE.test(today)) return null;
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const offset = dow === 0 ? 6 : dow - 1;
  const from = addDays(today, -offset);
  return { from, to: addDays(from, 6) };
}

export function monthGrid(month) {
  const bounds = monthBounds(month);
  if (!bounds) return [];
  const start = weekBounds(bounds.from).from;
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    cells.push({ date, inMonth: date.startsWith(`${month}-`) });
  }
  return cells;
}

export function autoEntries(state = {}, from, to, { today } = {}) {
  const out = [];
  for (const item of state.items || []) {
    const expiry = String(item.expiry || '');
    if (!DATE.test(expiry) || expiry < from || expiry > to) continue;
    out.push({
      id: `expiry:${item.id}:${expiry}`,
      source: 'expiry',
      sourceId: item.id,
      date: expiry,
      time: '',
      title: item.name,
      notes: '',
      person: '',
      readOnly: true
    });
  }
  for (const bill of state.bills || []) {
    const due = String(bill.due || '');
    if (!DATE.test(due) || due < from || due > to) continue;
    const status = billCalendarStatus(bill, today);
    out.push({
      id: `${status.debit ? 'debit' : 'bill'}:${bill.id}:${due}`,
      source: status.debit ? 'debit' : 'bill',
      sourceId: bill.id,
      date: due,
      time: '',
      title: bill.name,
      notes: '',
      person: '',
      readOnly: true,
      amount: bill.amount,
      paid: status.paid,
      paidAt: status.paidAt,
      pending: status.pending,
      overdue: status.overdue
    });
  }
  for (const chore of state.chores || []) {
    let d = nextDue(chore);
    if (!DATE.test(d)) continue;
    const firstDue = d;
    if (d < from) {
      while (d < from) d = addDays(d, Number(chore.every) || 7);
      // Overdue from before the window: show on `from` only when that day is not already a regular occurrence.
      if (d !== from) {
        out.push({
          id: `chore:${chore.id}:${from}`,
          source: 'chore',
          sourceId: chore.id,
          date: from,
          time: '',
          title: chore.name,
          notes: '',
          person: chore.assignee || '',
          readOnly: true,
          overdue: true,
          due: firstDue
        });
      }
    }
    let guard = 0;
    while (d <= to && guard < 40) {
      out.push({
        id: `chore:${chore.id}:${d}`,
        source: 'chore',
        sourceId: chore.id,
        date: d,
        time: '',
        title: chore.name,
        notes: '',
        person: chore.assignee || '',
        readOnly: true
      });
      d = addDays(d, Number(chore.every) || 7);
      guard += 1;
    }
  }
  return out;
}

export function userEntries(events = [], from, to, { pro = calendarProEnabled() } = {}) {
  const out = [];
  for (const event of events || []) {
    const dates = eventOccurrences(pro ? event : { ...event, recur: '' }, from, to);
    for (const date of dates) {
      out.push({
        id: `event:${event.id}:${date}`,
        source: 'event',
        sourceId: event.id,
        date,
        time: event.time || '',
        title: event.title,
        notes: event.notes || '',
        person: event.person || '',
        recur: event.recur || '',
        readOnly: false
      });
    }
  }
  return out;
}

export function calendarEntries(state = {}, from, to, opts) {
  const rows = [...autoEntries(state, from, to, opts), ...userEntries(state.events || [], from, to, opts)];
  return rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)) || a.title.localeCompare(b.title, 'el'));
}

export function entriesOn(entries, date) {
  return (entries || []).filter((e) => e.date === date);
}

export function shouldNotify(prev, { day, count }) {
  if (!day || !count) return false;
  if (!prev || prev.day !== day) return true;
  return Number(prev.count || 0) < Number(count);
}

function icsDate(date, time) {
  const day = String(date).replace(/-/g, '');
  if (TIME.test(time || '')) return `${day}T${time.replace(':', '')}00`;
  return day;
}

function icsText(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function icsStamp(now) {
  return String(now || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export function buildIcs(entries = [], { now = new Date().toISOString() } = {}) {
  const stamp = icsStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Spitothiki//Calendar//EL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  for (const e of entries) {
    const allDay = !e.time;
    const start = icsDate(e.date, e.time);
    const end = allDay ? icsDate(addDays(e.date, 1), '') : icsDate(e.date, e.time);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${icsText(e.id)}@spitothiki`);
    lines.push(`DTSTAMP:${stamp}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${start}`);
      lines.push(`DTEND;VALUE=DATE:${end}`);
    } else {
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.notes) lines.push(`DESCRIPTION:${icsText(e.notes)}`);
    if (e.recur === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
    if (e.recur === 'monthly') lines.push('RRULE:FREQ=MONTHLY');
    if (e.recur === 'yearly') lines.push('RRULE:FREQ=YEARLY');
    const trigger = allDay ? '-PT9H' : '-PT30M';
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:${trigger}`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function googleEventUrl(entry) {
  if (!entry) return '';
  const day = String(entry.date).replace(/-/g, '');
  const dates = entry.time
    ? `${day}T${entry.time.replace(':', '')}00/${day}T${entry.time.replace(':', '')}00`
    : `${day}/${icsDate(addDays(entry.date, 1), '')}`;
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: entry.title || '',
    dates,
    details: entry.notes || ''
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

export const CALENDAR_EN = {
  'Ημερολόγιο': 'Calendar',
  'Λήξεις, λογαριασμοί, πάγιες εντολές, δουλειές και τα δικά σου γεγονότα, σε ένα μέρος.': 'Expiries, bills, standing orders, chores and your own events, in one place.',
  'Σήμερα': 'Today',
  'Αυτή την εβδομάδα': 'This week',
  'Μήνας': 'Month',
  'Νέο γεγονός': 'New event',
  'Τίτλος': 'Title',
  'Ημερομηνία': 'Date',
  'Ώρα (προαιρετικά)': 'Time (optional)',
  'Ποιος': 'Who',
  'Όλοι': 'Everyone',
  'Σημειώσεις': 'Notes',
  'Επανάληψη': 'Repeat',
  'Χωρίς επανάληψη': 'Does not repeat',
  'Κάθε εβδομάδα': 'Weekly',
  'Κάθε μήνα': 'Monthly',
  'Κάθε χρόνο': 'Yearly',
  'Αποθήκευση': 'Save',
  'Άκυρο': 'Cancel',
  'Διαγραφή γεγονότος': 'Delete event',
  'Το γεγονός διαγράφηκε.': 'The event was deleted.',
  'Το γεγονός αποθηκεύτηκε.': 'The event was saved.',
  'Πρόσθεσε στο ημερολόγιο του κινητού': 'Add to the phone calendar',
  'Άνοιγμα στο Google Calendar': 'Open in Google Calendar',
  'Κατεβάστηκε ένα αρχείο .ics για να το ανοίξεις στο ημερολόγιο του κινητού.': 'An .ics file was downloaded — open it in your phone calendar.',
  'Δεν υπάρχει τίποτα αυτή την ημέρα.': 'Nothing on this day.',
  'Σήμερα δεν έχει τίποτα στο ημερολόγιο.': 'Nothing on the calendar today.',
  'Αυτή την εβδομάδα δεν έχει τίποτα στο ημερολόγιο.': 'Nothing on the calendar this week.',
  'Λήξη': 'Expiry',
  'Λογαριασμός': 'Bill',
  'Πάγια': 'Standing order',
  'Δουλειά σπιτιού': 'Chore',
  'Γεγονός': 'Event',
  'Εκκρεμεί από {date}': 'Overdue since {date}',
  'Γράψε έναν τίτλο.': 'Enter a title.',
  'Βάλε ημερομηνία.': 'Enter a date.',
  'Η ώρα δεν είναι έγκυρη (π.χ. 18:30).': 'The time is not valid (e.g. 18:30).',
  'Κάρτα «Σήμερα» στο ημερολόγιο': '«Today» calendar card',
  'Φαίνεται στην αρχική με ό,τι πέφτει σήμερα: λήξεις, λογαριασμούς, δουλειές και γεγονότα.': 'Shown on the home screen with whatever falls today: expiries, bills, chores and events.',
  'Σήμερα στο ημερολόγιο': 'Today on the calendar',
  'Όλα στο ημερολόγιο →': 'Everything on the calendar →',
  'Υπενθύμιση ημερολογίου': 'Calendar reminder',
  '{count} στο ημερολόγιο σήμερα': '{count} on the calendar today',
  '1 στο ημερολόγιο σήμερα': '1 item on the calendar today',
  'Δευ': 'Mon',
  'Τρι': 'Tue',
  'Τετ': 'Wed',
  'Πεμ': 'Thu',
  'Παρ': 'Fri',
  'Σαβ': 'Sat',
  'Κυρ': 'Sun',
  'Λήξεις, λογαριασμοί και γεγονότα': 'Expiries, bills and events',
  'Προηγούμενος μήνας': 'Previous month',
  'Επόμενος μήνας': 'Next month',
  '✓ Πληρώθηκε {date}': '✓ Paid {date}',
  '✓ Πληρώθηκε': '✓ Paid'
};

