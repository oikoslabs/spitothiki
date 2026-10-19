// Diet plan from a dietitian's printed page: OCR text -> meal slots with options -> a generated week -> shopping list.
// Pure functions (tested in Node); the UI lives in app.js and the OCR reuses receipt-photo.js.
import { normalizeSearch } from './domain.js';
import { INGREDIENTS, matchIngredient } from './recipes.js';

const plain = (s) => normalizeSearch(s).replace(/\s+/g, ' ').trim();
const TIME = /\(?\s*(\d{1,2})\s*[:.·]\s*(\d{2})\s*\)?/;
const SLOT_WORDS = /(κυρι|ελαφρ|πρωιν|δεκατιαν|μεσημεριαν|απογευματιν|βραδιν|γευμα|σνακ|snack|breakfast|lunch|dinner|ενδιαμεσ)/;
// "(2 φορές την εβδομάδα)", "1 φορα/εβδ.", "2x την εβδομάδα"
const FREQ = /\(?\s*(\d)\s*(?:φορ[αε]σ?|x|χ)\s*(?:την|τη|ανα|το)?\s*εβδ(?:ομαδα)?\.?\s*\)?/;
const FREE = /(απεξω|ελευθερο|οτι θελεισ|ελευθερη επιλογη|cheat)/;
const TRAILING_OR = /[\s,.;]+(?:ή|η|ἡ|ή\.|Ή|Η|fh|n)\s*[.,;:]*$/u;
const APPOINTMENT = /(επομενη|ραντεβου|συναντηση|επισκεψη)/;
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;

// Plain text with accents, rebuilt from a matched (accentless) range of the original.
function cutFreq(text) {
  const p = normalizeSearch(text);
  const m = p.match(FREQ);
  if (!m) return { text, perWeek: null };
  const before = text.slice(0, m.index); const after = text.slice(m.index + m[0].length);
  return { text: `${before} ${after}`.replace(/\(\s*\)/g, ' ').replace(/\s+([,.)])/g, '$1').replace(/\s+/g, ' ').trim(), perWeek: Number(m[1]) || null };
}

export function cleanOption(raw) {
  let text = stripBullet(raw).rest.replace(/\s+/g, ' ').trim();
  text = text.replace(TRAILING_OR, '').trim();
  const freq = cutFreq(text);
  text = freq.text.replace(TRAILING_OR, '').replace(/\(\s*$/, '').replace(/[\s,;-]+$/, '').trim();
  const free = FREE.test(plain(text));
  let perWeek = freq.perWeek;
  // "1 φορά μπορείς να φας απέξω": the count is at the start, not "την εβδομάδα".
  if (free && !perWeek) { const m = plain(text).match(/^(\d)\s*φορ/); perWeek = m ? Number(m[1]) : 1; }
  return { text, perWeek, free };
}

const LATIN_UPPER = { A: 'Α', B: 'Β', E: 'Ε', F: 'Γ', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', Q: 'Ω', T: 'Τ', X: 'Χ', Y: 'Υ', Z: 'Ζ' };
const WORD_FIX = { kai: 'και', he: 'με', tupi: 'τυρί', 'k.y': 'κ.γ', 'k.c': 'κ.σ' };
export const PAGE_BREAK = '---page---';

// OCR clean-up of one line: polytonic look-alikes (ἡ, ἱ), µ (micro sign), "1" read as Ί/ἱ, digits glued to words, common Latin look-alike words.
export function normalizeOcrLine(line) {
  let s = String(line).replace(/µ/g, 'μ').replace(/(^|[\s(.'"«»=*-])[ἱἹΊ](?=\s|\p{L}{3})/gu, '$11 ');
  s = s.normalize('NFD').replace(/[\u0313\u0314\u0300\u0342\u0345]/g, '').normalize('NFC');
  s = s.replace(/(\d)(?=\p{Script=Greek}{2})/gu, '$1 ').replace(/(\s)[|](?=\s)/g, '$11').replace(/(^|\s)κ\s?([γσ])(?=\s|$)/g, '$1κ.$2');
  s = s.replace(/(^|\s)([A-Za-z.]{2,4})(?=\s|$)/g, (m, sp, w) => (WORD_FIX[w.toLowerCase()] ? sp + WORD_FIX[w.toLowerCase()] : m));
  return s.replace(/\s+/g, ' ').trim();
}

// Leading bullet, including OCR junk such as «'. / κ-. / ε- / = / "..
export function stripBullet(line) {
  const m = String(line).match(/^\s*(\S{1,4})(?:\s+|(?=\S))/u);
  const glued = String(line).match(/^\s*(\p{L}?[^\p{L}\p{N}\s(]{1,4})(?=\p{L}|\d)/u);
  for (const cand of [m?.[1], glued?.[1]]) {
    if (!cand) continue;
    const letters = (cand.match(/\p{L}/gu) || []).length;
    const symbols = (cand.match(/[^\p{L}\p{N}\s]/gu) || []).length;
    if (/^[oe°]$/.test(cand) || (symbols >= 1 && letters <= 1 && !/\p{N}/u.test(cand) && !/^[(«"]\p{L}/u.test(cand) && !cand.startsWith('('))) {
      return { bullet: true, rest: String(line).trim().slice(cand.length).trim() };
    }
  }
  return { bullet: false, rest: String(line).trim() };
}

// Lines that are OCR noise (blurry areas): no real Greek word or mostly Latin letters.
function isNoise(line) {
  const letters = (line.match(/\p{L}/gu) || []); if (!letters.length) return true;
  const greek = letters.filter((c) => /\p{Script=Greek}/u.test(c)).length;
  return !/\p{Script=Greek}{4,}/u.test(line) || greek / letters.length < 0.6;
}

function headerOf(line) {
  line = line.replace(/\b[A-Z]+\b/g, (w) => (w.length >= 2 && /[A-Z]{2}/.test(w) ? [...w].map((c) => LATIN_UPPER[c] || c).join('') : w)).replace(/[A-Z](?=\p{Script=Greek})|(?<=\p{Script=Greek})[A-Z]/gu, (c) => LATIN_UPPER[c] || c);
  const p = plain(line);
  const letters = (line.match(/\p{L}/gu) || []).join('');
  if (!letters || letters.length > 40) return null;
  const upper = (letters.match(/\p{Lu}/gu) || []).length / letters.length;
  const time = line.match(TIME);
  if (!(SLOT_WORDS.test(p) && (upper >= 0.7 || time)) && !(time && upper >= 0.7 && letters.length <= 30)) return null;
  if (stripBullet(line).bullet && !time) return null;
  const known = [[/πρωιν/, 'Πρωινό'], [/δεκατιαν/, 'Δεκατιανό'], [/κυρι|μεσημεριαν/, 'Κυρίως γεύμα'], [/απογευματιν/, 'Απογευματινό'], [/σνακ|snack/, 'Σνακ'], [/ελαφρ|βραδιν/, 'Ελαφρύ γεύμα']].find(([re]) => re.test(p));
  let name = line.replace(TIME, '').replace(/[()]/g, ' ').replace(/^(?:επιλογεσ|επιλογές|ΕΠΙΛΟΓΕΣ)\s+/iu, '').replace(/\s+/g, ' ').trim();
  name = name.charAt(0).toLocaleUpperCase('el-GR') + name.slice(1).toLocaleLowerCase('el-GR');
  if (known) name = known[1];
  return { name, time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : '' };
}

// Text of one or more pages -> { title, appointment, slots: [{ id, name, time, options: [{ id, text, perWeek, free }] }] }.
export function parseDietText(text) {
  const lines = String(text || '').split(/\r?\n/).map(normalizeOcrLine).filter(Boolean);
  const bulletMode = lines.filter((l) => stripBullet(l).bullet).length >= 3;
  const slots = []; let title = ''; let appointment = '';
  let current = null; let buffer = null;
  const flush = () => { if (buffer && current) { const o = cleanOption(buffer); if ((o.text.match(/\p{L}/gu) || []).length >= 3) current.options.push({ id: uid('o'), ...o }); } buffer = null; };
  for (const line of lines) {
    if (line === PAGE_BREAK) { flush(); continue; }
    const p = plain(line);
    if (!current && APPOINTMENT.test(p) && /\d/.test(p)) { appointment = line.replace(/^.*?(?=\d)/, '').trim(); continue; }
    if (/προγρα.{1,3}α διατροφ|διαιτολογιο|diet plan/.test(p) && line.length < 50) { title = title || 'Πρόγραμμα διατροφής'; continue; }
    const header = headerOf(line);
    if (header) { flush(); current = { id: uid('s'), ...header, options: [] }; slots.push(current); continue; }
    if (!current) continue;
    const { bullet, rest } = stripBullet(line);
    if (isNoise(rest)) continue;
    const prevEndsOr = buffer && TRAILING_OR.test(buffer);
    const startsNew = !buffer || (bulletMode ? bullet : prevEndsOr || bullet);
    if (startsNew) { flush(); buffer = rest; } else buffer += ` ${rest}`;
  }
  flush();
  return { title: title || 'Πρόγραμμα διατροφής', appointment, slots: slots.filter((s) => s.options.length) };
}

// ---------- Weekly generator ----------
function rng(seed) { let s = (Number(seed) || 1) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }

// { [slotId]: [optionId|null x7] }; respects perWeek limits, prefers the least used option, avoids repeating yesterday.
export function generateWeek(plan, { seed = Date.now() } = {}) {
  const rand = rng(seed); const week = {};
  for (const slot of plan.slots || []) {
    const used = new Map(); const days = [];
    const options = slot.options || [];
    for (let d = 0; d < 7; d++) {
      const open = options.filter((o) => !o.perWeek || (used.get(o.id) || 0) < o.perWeek);
      if (!open.length) { days.push(null); continue; }
      // Limited options first need their slots reserved: never let unlimited ones starve a limited option that still fits.
      const scored = open.map((o) => ({ o, s: (used.get(o.id) || 0) * 10 + (days[d - 1] === o.id ? 50 : 0) + (o.free ? 3 : 0) + rand() }));
      scored.sort((a, b) => a.s - b.s);
      const pick = scored[0].o; days.push(pick.id); used.set(pick.id, (used.get(pick.id) || 0) + 1);
    }
    week[slot.id] = days;
  }
  return week;
}

export const usage = (week, slotId) => (week?.[slotId] || []).reduce((m, id) => (id ? m.set(id, (m.get(id) || 0) + 1) : m), new Map());
export function overLimit(plan, week) {
  const out = [];
  for (const slot of plan.slots || []) { const u = usage(week, slot.id); for (const o of slot.options) if (o.perWeek && (u.get(o.id) || 0) > o.perWeek) out.push({ slotId: slot.id, optionId: o.id, used: u.get(o.id), limit: o.perWeek }); }
  return out;
}

export function createDietPlan({ person = '', parsed }, now = new Date().toISOString()) {
  const slots = (parsed?.slots || []).map((s) => ({ id: s.id || uid('s'), name: String(s.name || '').trim().slice(0, 40) || 'Γεύμα', time: (String(s.time || '').match(/^(\d{1,2})[:.](\d{2})$/) || []).slice(1).map((x, i) => (i ? x : x.padStart(2, '0'))).join(':'), options: (s.options || []).map((o) => ({ id: o.id || uid('o'), text: String(o.text).trim().slice(0, 300), perWeek: o.perWeek ? Math.max(1, Math.min(7, Number(o.perWeek))) : null, free: Boolean(o.free) })).filter((o) => o.text) })).filter((s) => s.options.length);
  if (!slots.length) throw new Error('Δεν βρέθηκαν γεύματα στο πρόγραμμα.');
  return { id: uid('diet'), person: String(person).trim().slice(0, 40), title: parsed.title || 'Πρόγραμμα διατροφής', appointment: parsed.appointment || '', slots, weeks: {}, createdAt: now, updatedAt: now };
}

// Keeps the 8 most recent weeks.
export function setWeek(plan, start, week, now = new Date().toISOString()) {
  const weeks = { ...(plan.weeks || {}), [start]: week };
  const keep = Object.keys(weeks).sort().slice(-8);
  return { ...plan, weeks: Object.fromEntries(keep.map((k) => [k, weeks[k]])), updatedAt: now };
}

// ---------- Ingredients ----------
// [pattern on accentless text, display name, countable]
const CANON = [
  [/παντζαρ/, 'Παντζάρια'], [/σπανακ/, 'Σπανάκι'], [/σαλατ(?!σ)/, 'Λαχανικά σαλάτας'], [/αβοκαντο/, 'Αβοκάντο'], [/αβγ|αυγ/, 'Αυγά', true],
  [/τορτιγι/, 'Τορτίγιες', true], [/αραβικη πιτα|πιτα απο σουβλακι|πιτα/, 'Πίτες', true], [/ταχινι/, 'Ταχίνι'], [/μπανανα/, 'Μπανάνες', true],
  [/γαλα(?!κτ)/, 'Γάλα χαμηλών λιπαρών'], [/granola|γκρανολα/, 'Granola'], [/φρουτ/, 'Φρέσκα φρούτα', true], [/τυρι κρεμα/, 'Τυρί κρέμα'],
  [/γαλοπουλ/, 'Γαλοπούλα'], [/ντοματιν/, 'Ντοματίνια'], [/οσπρι/, 'Όσπρια'], [/τονο/, 'Τόνος κονσέρβα', true], [/krispie|κρισπι/, 'Krispies'],
  [/μοσχαρισια μπιφτεκ/, 'Μοσχαρίσια μπιφτέκια', true], [/μπιφτεκια κοτοπουλ|μπιφτεκ/, 'Μπιφτέκια κοτόπουλου', true], [/πατατ/, 'Πατάτες'],
  [/κοτομπουκ/, 'Κοτομπουκιές', true], [/καλαμακι|στηθοσ κοτοπουλ|φιλετο κοτοπουλ|κοτοπουλ/, 'Κοτόπουλο φιλέτο'], [/ρυζογαλ/, 'Ρυζόγαλο', true], [/ρυζ/, 'Ρύζι'],
  [/ζυμαρικ/, 'Ζυμαρικά'], [/σαλτσα|πεστο/, 'Σάλτσα ντομάτας'], [/τυρι τριμμεν|τριμμενο/, 'Τυρί τριμμένο'], [/μπριαμ/, 'Λαχανικά για μπριάμ'],
  [/αρακα/, 'Αρακάς'], [/ανθοτυρ/, 'Ανθότυρο'], [/γιαουρτ/, 'Γιαούρτι', true], [/μελι/, 'Μέλι'], [/πουτιγκ/, 'Πουτίγκα', true], [/κεφιρ/, 'Κεφίρ', true],
  [/κρεμα/, 'Κρέμα χωρίς ζάχαρη', true], [/digestive|μπισκοτ/, 'Μπισκότα digestive'], [/μαρμελαδ/, 'Μαρμελάδα'], [/μουσταρδ/, 'Μουστάρδα'], [/μαρουλ/, 'Μαρούλι'],
  [/παξιμαδ/, 'Παξιμάδια'], [/λαχανικ/, 'Λαχανικά'], [/φετα γερμανικ|ψωμ/, 'Ψωμί τύπου γερμανικού'], [/κακαο/, 'Κακάο'], [/φυστικοβουτυρ/, 'Φυστικοβούτυρο']
];
const SKIP = /(ελαιολαδ|λαδι|αλατι|πιπερι|νερο|χωρισ στραγγισμα|απεξω|οτι θελεισ)/;
const NUMWORD = { ενα: 1, μια: 1, δυο: 2, τρια: 3, τεσσερα: 4, εξι: 6 };

// Option text -> [{ name, qty }] (first alternative of each "ή", quantities and preparation dropped).
export function extractIngredients(text) {
  const out = [];
  const parts = plain(String(text).replace(/\([^)]*\)/g, ' ')).split(/\s+(?:με|και|μαζι με)\s+|,|\s-\s|-\s|\s\+\s|\s+(?=\d+\s*(?:κ\.?\s?[σγ]|φλ|κουταλια|κεσεδακι|φετ))/);
  for (const raw of parts) {
    const part = raw.split(/\s+η\s+/)[0].trim(); // first alternative
    if (!part || SKIP.test(part)) continue;
    const canon = CANON.find(([re]) => re.test(part));
    if (!canon) continue;
    const m = part.match(/^(\d+)(?:[.,]\d+)?\s/) || part.match(new RegExp(`^(${Object.keys(NUMWORD).join('|')})\\s`));
    const n = m ? (Number(m[1]) || NUMWORD[m[1]] || 1) : 1;
    const qty = canon[2] && !/κ\.?\s?[σγ]|φλ|κεσεδακι|κουταλια|γρ\b/.test(part) ? n : 1;
    out.push({ name: canon[1], qty, countable: Boolean(canon[2]) });
  }
  // One mention of each ingredient per option.
  const seen = new Map();
  for (const e of out) seen.set(e.name, { ...e, qty: Math.max(seen.get(e.name)?.qty || 0, e.qty) });
  return [...seen.values()];
}

// The generated week -> [{ name, count, have, pending }] aggregated over all cells.
export function weekIngredients(plan, week, { items = [], shopping = [] } = {}) {
  const counts = new Map();
  const byId = new Map((plan.slots || []).flatMap((s) => s.options.map((o) => [o.id, o])));
  for (const ids of Object.values(week || {})) for (const id of ids) {
    const o = byId.get(id); if (!o || o.free) continue;
    for (const { name, qty, countable } of extractIngredients(o.text)) { const c = counts.get(name) || { count: 0, countable }; c.count += qty; counts.set(name, c); }
  }
  const key = (s) => plain(s).replace(/σ\b/g, '');
  const stem = (s) => key(s).split(' ')[0].slice(0, Math.max(4, key(s).split(' ')[0].length - 2));
  const pending = shopping.filter((r) => !r.checked);
  return [...counts].map(([name, { count, countable }]) => {
    const id = matchIngredient(name);
    const match = (row) => (id && matchIngredient(row.name) === id) || key(row.name).includes(stem(name));
    const stock = items.filter((it) => match(it)).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const staple = id && INGREDIENTS[id]?.staple;
    // Countable items (eggs, tortillas) need enough pieces; the rest just need to be in stock.
    return { name, count, countable, have: Boolean(staple) || (countable ? stock >= count : stock > 0), pending: pending.some(match) };
  });
}
