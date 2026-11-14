// On-device bank statement import (Pro). CSV/TSV only — no bank API, no credentials.
// Matches existing receipts by amount, ±2 days, similar store name.
// Unmatched rows can become extras; a batch id makes the last import undoable.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const makeId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const r2 = (n) => Math.round(Number(n) * 100) / 100;

const DATE_HEADERS = /ημερομην|ημ\/νια|ημ\b|date|posting|αξιας|value\s*date|booking/i;
const AMOUNT_HEADERS = /ποσο|amount|αξια|value|χρεωσ|debit|πιστωσ|credit|εξοδο/i;
const DEBIT_HEADERS = /χρεωσ|debit|εξοδο|withdrawal/i;
const CREDIT_HEADERS = /πιστωσ|credit|καταθ/i;
const DESC_HEADERS = /περιγραφ|αιτιολογ|description|details|narration|στοιχει|ικανολογ/i;

function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9α-ω]+/gi, ' ').trim();
}

export function parseAmount(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  s = s.replace(/[€\s]/g, '').replace(/^\(/, '-').replace(/\)$/, '');
  if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? r2(n) : null;
}

export function parseDate(raw) {
  const s = String(raw || '').trim();
  if (DATE.test(s)) return s;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return '';
  let d = m[1].padStart(2, '0');
  let mo = m[2].padStart(2, '0');
  let y = m[3];
  if (y.length === 2) y = Number(y) < 50 ? `20${y}` : `19${y}`;
  const iso = `${y}-${mo}-${d}`;
  return DATE.test(iso) ? iso : '';
}

function detectDelimiter(text) {
  const first = String(text || '').split(/\r?\n/).find((l) => l.trim()) || '';
  const semi = (first.match(/;/g) || []).length;
  const comma = (first.match(/,/g) || []).length;
  const tab = (first.match(/\t/g) || []).length;
  if (tab >= semi && tab >= comma && tab > 0) return '\t';
  if (semi >= comma && semi > 0) return ';';
  return ',';
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (ch === delim && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function classifyHeader(cells) {
  const map = { date: -1, amount: -1, debit: -1, credit: -1, description: -1 };
  cells.forEach((cell, i) => {
    const key = fold(cell);
    if (map.date < 0 && DATE_HEADERS.test(key)) map.date = i;
    else if (DEBIT_HEADERS.test(key) && map.debit < 0) map.debit = i;
    else if (CREDIT_HEADERS.test(key) && map.credit < 0) map.credit = i;
    else if (map.amount < 0 && AMOUNT_HEADERS.test(key)) map.amount = i;
    if (map.description < 0 && DESC_HEADERS.test(key)) map.description = i;
  });
  return map;
}

function looksLikeHeader(cells) {
  const map = classifyHeader(cells);
  return map.date >= 0 && (map.amount >= 0 || map.debit >= 0 || map.credit >= 0);
}

export function parseBankCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  if (!raw.trim()) throw new Error('Το αρχείο είναι άδειο.');
  const delim = detectDelimiter(raw);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('Το αρχείο είναι άδειο.');
  let start = 0;
  let map = { date: 0, amount: -1, debit: -1, credit: -1, description: 1 };
  const first = splitCsvLine(lines[0], delim);
  if (looksLikeHeader(first)) {
    map = classifyHeader(first);
    start = 1;
  } else if (first.length >= 2) {
    // No header: try date, description, amount or date, amount, description
    if (parseDate(first[0]) && parseAmount(first[first.length - 1]) != null) {
      map = { date: 0, amount: first.length - 1, debit: -1, credit: -1, description: 1 };
    }
  }
  if (map.date < 0 || (map.amount < 0 && map.debit < 0 && map.credit < 0)) {
    throw new Error('Δεν βρήκα στήλες ημερομηνίας και ποσού. Αποθήκευσε την κίνηση ως CSV (όχι Excel).');
  }
  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    const date = parseDate(cells[map.date]);
    if (!date) continue;
    let amount = null;
    if (map.debit >= 0 || map.credit >= 0) {
      const debit = parseAmount(cells[map.debit] || '');
      const credit = parseAmount(cells[map.credit] || '');
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
    }
    if (amount == null) amount = parseAmount(cells[map.amount] ?? '');
    if (amount == null || amount === 0) continue;
    const description = String(cells[map.description] ?? '').trim().slice(0, 160);
    rows.push({ date, amount: r2(amount), description });
  }
  if (!rows.length) throw new Error('Δεν βρήκα κινήσεις στο αρχείο. Δοκίμασε CSV με ημερομηνία, περιγραφή και ποσό.');
  return rows;
}

function addDays(date, delta) {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function similarStore(a, b) {
  const na = fold(a);
  const nb = fold(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(' ').filter((w) => w.length > 2));
  const tb = new Set(nb.split(' ').filter((w) => w.length > 2));
  let hit = 0;
  for (const w of ta) if (tb.has(w)) hit++;
  return hit >= 1 && hit >= Math.min(2, Math.min(ta.size, tb.size));
}

function dateClose(a, b, days = 2) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return false;
  return Math.abs(da - db) <= days * 86400000;
}

export function matchBankRows(rows = [], { receipts = [], extras = [], transport = [] } = {}) {
  const expenses = [
    ...receipts.map((r) => ({ kind: 'receipts', id: r.id, date: r.date, amount: Number(r.total), store: r.store || '', item: r })),
    ...extras.map((e) => ({ kind: 'extras', id: e.id, date: e.date, amount: Number(e.amount), store: e.note || e.category || '', item: e })),
    ...transport.map((e) => ({ kind: 'transport', id: e.id, date: e.date, amount: Number(e.amount), store: e.note || e.type || '', item: e }))
  ];
  // Debits (money out) are negative or already signed; treat abs for matching spend.
  const result = [];
  const used = new Set();
  for (const row of rows) {
    const spend = row.amount < 0 ? r2(-row.amount) : r2(row.amount);
    const isCredit = row.amount > 0 && rows.some((r) => r.amount < 0);
    if (isCredit) {
      result.push({ row, status: 'ignored', reason: 'credit' });
      continue;
    }
    const amount = row.amount < 0 ? spend : spend;
    const candidates = expenses.filter((e) => {
      if (used.has(`${e.kind}:${e.id}`)) return false;
      if (!Number.isFinite(e.amount)) return false;
      if (Math.abs(e.amount - amount) > 0.009) return false;
      return dateClose(e.date, row.date, 2);
    });
    const named = candidates.filter((e) => similarStore(e.store, row.description));
    const pool = named.length ? named : candidates;
    if (pool.length === 1 && (named.length === 1 || !row.description)) {
      used.add(`${pool[0].kind}:${pool[0].id}`);
      result.push({ row, status: 'match', candidate: pool[0] });
    } else if (pool.length >= 1) {
      result.push({ row, status: 'unsure', candidates: pool.slice(0, 6) });
    } else {
      result.push({ row, status: 'new' });
    }
  }
  return result;
}

export function applyBankImport(state, decisions, { now = new Date().toISOString(), batchId } = {}) {
  const id = batchId || makeId('bk');
  const receipts = [...(state.receipts || [])];
  const extras = [...(state.extras || [])];
  const transport = [...(state.transport || [])];
  const mark = (list, recId, kind) => {
    const i = list.findIndex((x) => x.id === recId);
    if (i < 0) return list;
    const next = [...list];
    next[i] = { ...next[i], cardPaid: true, bankImportId: id, updatedAt: now };
    return next;
  };
  let recs = receipts;
  let ex = extras;
  let tr = transport;
  for (const d of decisions) {
    if (d.status === 'match' && d.candidate) {
      if (d.candidate.kind === 'receipts') recs = mark(recs, d.candidate.id, 'receipts');
      else if (d.candidate.kind === 'extras') ex = mark(ex, d.candidate.id, 'extras');
      else if (d.candidate.kind === 'transport') tr = mark(tr, d.candidate.id, 'transport');
    } else if (d.status === 'new' && d.row) {
      const amount = d.row.amount < 0 ? r2(-d.row.amount) : r2(d.row.amount);
      ex.push({
        id: makeId('xe'),
        category: 'bank',
        amount,
        qty: 1,
        date: d.row.date,
        note: String(d.row.description || 'Κίνηση τραπέζης').slice(0, 80),
        source: 'bank',
        bankImportId: id,
        createdAt: now,
        updatedAt: now
      });
    }
  }
  return { receipts: recs, extras: ex, transport: tr, batchId: id };
}

export function undoBankImport(state, batchId) {
  if (!batchId) return state;
  const unmark = (list) => (list || []).map((x) => {
    if (x.bankImportId !== batchId) return x;
    const next = { ...x };
    delete next.cardPaid;
    delete next.bankImportId;
    return next;
  });
  return {
    ...state,
    receipts: unmark(state.receipts),
    extras: (state.extras || []).filter((e) => !(e.bankImportId === batchId && e.source === 'bank')).map((e) => {
      if (e.bankImportId !== batchId) return e;
      const next = { ...e };
      delete next.cardPaid;
      delete next.bankImportId;
      return next;
    }),
    transport: unmark(state.transport)
  };
}

export const BANK_EN = {
  'Εισαγωγή κίνησης': 'Statement import',
  'Φέρε ένα αρχείο κίνησης λογαριασμού (CSV) από την τράπεζά σου. Η ανάγνωση γίνεται στη συσκευή σου — χωρίς σύνδεση στην τράπεζα.': 'Bring a bank statement file (CSV) from your bank. It is read on your device — no bank login.',
  'Επιλογή αρχείου CSV': 'Choose a CSV file',
  'Το Excel δεν διαβάζεται ακόμη· αποθήκευσέ το ως CSV.': 'Excel is not read yet; save it as CSV.',
  'Πληρώθηκε με κάρτα': 'Paid by card',
  'Ίδιο έξοδο': 'Same expense',
  'Νέο έξοδο': 'New expense',
  'Παράβλεψη': 'Skip',
  'Εφαρμογή εισαγωγής': 'Apply import',
  'Αναίρεση τελευταίας εισαγωγής': 'Undo last import',
  'Το αρχείο είναι άδειο.': 'The file is empty.',
  'Δεν βρήκα στήλες ημερομηνίας και ποσού. Αποθήκευσε την κίνηση ως CSV (όχι Excel).': 'Could not find date and amount columns. Save the statement as CSV (not Excel).',
  'Δεν βρήκα κινήσεις στο αρχείο. Δοκίμασε CSV με ημερομηνία, περιγραφή και ποσό.': 'No transactions found. Try a CSV with date, description and amount.',
  'Η εισαγωγή εφαρμόστηκε. Μπορείς να την αναιρέσεις.': 'Import applied. You can undo it.',
  'Η εισαγωγή αναιρέθηκε.': 'The import was undone.',
  'Καμία κίνηση για εισαγωγή.': 'No transactions to import.'
};
