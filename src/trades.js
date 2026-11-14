// Personal home tradespeople book (Pro). Private to the household — no public
// directory, no backend, no third-party integration. Uses existing record lists
// (tradespeople, tradeJobs, tradeReminders) so sync works without rules changes.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const makeId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clip = (s, n) => String(s || '').trim().slice(0, n);
const r2 = (n) => Math.round(Number(n) * 100) / 100;

export const TRADE_SPECIALTIES = [
  { id: 'plumber', label: 'Υδραυλικός', emoji: '🔧' },
  { id: 'electrician', label: 'Ηλεκτρολόγος', emoji: '💡' },
  { id: 'hvac', label: 'Ψυκτικός', emoji: '❄️' },
  { id: 'boiler', label: 'Τεχνικός θέρμανσης', emoji: '🔥' },
  { id: 'painter', label: 'Ελαιοχρωματιστής', emoji: '🎨' },
  { id: 'locksmith', label: 'Κλειδαράς', emoji: '🔑' },
  { id: 'appliance', label: 'Τεχνικός συσκευών', emoji: '🔌' },
  { id: 'cleaner', label: 'Καθαριστής', emoji: '✨' },
  { id: 'gardener', label: 'Κηπουρός', emoji: '🌿' },
  { id: 'other', label: 'Άλλο', emoji: '🛠️' }
];

export function specialtyOf(id) {
  return TRADE_SPECIALTIES.find((s) => s.id === id) || TRADE_SPECIALTIES[TRADE_SPECIALTIES.length - 1];
}

export function telHref(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith('+')) {
    const local = digits.replace(/^0/, '');
    if (/^[26]\d{9}$/.test(local)) digits = `+30${local}`;
  }
  return `tel:${digits}`;
}

export function createTradesperson(input = {}, now = new Date().toISOString()) {
  const name = clip(input.name, 80);
  if (!name) throw new Error('Γράψε το όνομα του τεχνίτη.');
  const specialty = TRADE_SPECIALTIES.some((s) => s.id === input.specialty) ? input.specialty : 'other';
  return {
    id: input.id || makeId('tr'),
    name,
    specialty,
    specialtyLabel: specialty === 'other' ? clip(input.specialtyLabel, 40) : '',
    phone: clip(input.phone, 24),
    notes: clip(input.notes, 240),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function createTradeJob(input = {}, now = new Date().toISOString()) {
  const tradespersonId = String(input.tradespersonId || '');
  if (!tradespersonId) throw new Error('Διάλεξε τεχνίτη.');
  if (!DATE.test(String(input.date || ''))) throw new Error('Βάλε ημερομηνία εργασίας.');
  const description = clip(input.description, 200);
  if (!description) throw new Error('Γράψε τι έγινε.');
  const cost = input.cost === '' || input.cost == null ? null : Number(String(input.cost).replace(',', '.'));
  if (cost != null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Το κόστος δεν είναι έγκυρο.');
  return {
    id: input.id || makeId('tj'),
    tradespersonId,
    date: input.date,
    description,
    cost: cost == null ? null : r2(cost),
    expenseId: clip(input.expenseId, 80),
    expenseKind: clip(input.expenseKind, 20),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function createTradeReminder(input = {}, now = new Date().toISOString()) {
  const title = clip(input.title, 80);
  if (!title) throw new Error('Γράψε τίτλο υπενθύμισης (π.χ. Σέρβις λέβητα).');
  const intervalMonths = Number(input.intervalMonths == null || input.intervalMonths === '' ? 12 : input.intervalMonths);
  if (!Number.isFinite(intervalMonths) || intervalMonths < 1 || intervalMonths > 60) throw new Error('Το διάστημα πρέπει να είναι από 1 έως 60 μήνες.');
  const lastDone = String(input.lastDone || '');
  if (lastDone && !DATE.test(lastDone)) throw new Error('Η τελευταία φορά δεν είναι έγκυρη ημερομηνία.');
  return {
    id: input.id || makeId('tm'),
    title,
    intervalMonths: Math.round(intervalMonths),
    lastDone: lastDone || '',
    tradespersonId: clip(input.tradespersonId, 40),
    notes: clip(input.notes, 200),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function addMonths(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

export function nextReminderDue(reminder) {
  if (!reminder?.lastDone) return null;
  return addMonths(reminder.lastDone, Number(reminder.intervalMonths) || 12);
}

export function reminderStatus(reminder, today) {
  const due = nextReminderDue(reminder);
  if (!due) return { due: null, days: null, state: 'unknown' };
  const a = Date.parse(`${due}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  const days = Math.round((a - b) / 86400000);
  const state = days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'ok';
  return { due, days, state };
}

export function dueReminders(list = [], today, withinDays = 30) {
  return list
    .map((reminder) => ({ reminder, ...reminderStatus(reminder, today) }))
    .filter((row) => row.due && row.days != null && row.days <= withinDays)
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function jobsFor(jobs = [], tradespersonId) {
  return jobs.filter((j) => j.tradespersonId === tradespersonId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function markReminderDone(reminder, date, now = new Date().toISOString()) {
  if (!DATE.test(date)) throw new Error('Μη έγκυρη ημερομηνία.');
  return { ...reminder, lastDone: date, updatedAt: now };
}

export const TRADES_EN = {
  'Τεχνίτες': 'Tradespeople',
  'Το δικό σου βιβλίο τεχνιτών του σπιτιού: τηλέφωνα, εργασίες και υπενθυμίσεις συντήρησης.': 'Your own home tradespeople book: phone numbers, job history and maintenance reminders.',
  'Νέος τεχνίτης': 'New tradesperson',
  'Όνομα': 'Name',
  'Ειδικότητα': 'Specialty',
  'Τηλέφωνο': 'Phone',
  'Κλήση': 'Call',
  'Σημειώσεις': 'Notes',
  'Ιστορικό εργασιών': 'Job history',
  'Νέα εργασία': 'New job',
  'Τι έγινε': 'What was done',
  'Κόστος': 'Cost',
  'Σύνδεση με έξοδο (προαιρετικά)': 'Link to an expense (optional)',
  'Υπενθυμίσεις συντήρησης': 'Maintenance reminders',
  'Νέα υπενθύμιση': 'New reminder',
  'π.χ. Ετήσιο σέρβις λέβητα': 'e.g. Annual boiler service',
  'Κάθε πόσο (μήνες)': 'Every how many (months)',
  'Τελευταία φορά': 'Last done',
  'Το έκανα σήμερα': 'I did it today',
  'Ο τεχνίτης διαγράφηκε.': 'The tradesperson was deleted.',
  'Γράψε το όνομα του τεχνίτη.': 'Enter the tradesperson’s name.',
  'Διάλεξε τεχνίτη.': 'Choose a tradesperson.',
  'Βάλε ημερομηνία εργασίας.': 'Enter a job date.',
  'Γράψε τι έγινε.': 'Describe the work.',
  'Το κόστος δεν είναι έγκυρο.': 'The cost is not valid.',
  'Γράψε τίτλο υπενθύμισης (π.χ. Σέρβις λέβητα).': 'Enter a reminder title (e.g. Boiler service).',
  'Το διάστημα πρέπει να είναι από 1 έως 60 μήνες.': 'The interval must be between 1 and 60 months.',
  'Η τελευταία φορά δεν είναι έγκυρη ημερομηνία.': 'Last done is not a valid date.',
  'Μη έγκυρη ημερομηνία.': 'Invalid date.',
  'Υδραυλικός': 'Plumber',
  'Ηλεκτρολόγος': 'Electrician',
  'Ψυκτικός': 'HVAC technician',
  'Τεχνικός θέρμανσης': 'Heating technician',
  'Ελαιοχρωματιστής': 'Painter',
  'Κλειδαράς': 'Locksmith',
  'Τεχνικός συσκευών': 'Appliance technician',
  'Καθαριστής': 'Cleaner',
  'Κηπουρός': 'Gardener',
  'Άλλο': 'Other',
  'Δεν έχεις τεχνίτες ακόμη.': 'No tradespeople yet.',
  'Λήγει σύντομα η συντήρηση': 'Maintenance is due soon',
  'Έχει περάσει η συντήρηση': 'Maintenance is overdue'
};
