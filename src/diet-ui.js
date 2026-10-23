// UI for the diet plan («Πρόγραμμα διατροφής») inside the meal-plan tab: scan/paste -> review -> week -> shopping list.
// Kept out of app.js: app.js only calls initDietUi() once and renderDietSection() inside the plan tab.
import { PAGE_BREAK, createDietPlan, mergeParsed, generateWeek, overLimit, parseDietText, setWeek, usage, weekIngredients } from './diet-plan.js';
import { PDFJS_URL, PDFJS_WORKER_URL } from './bill-pdf.js';
import { getLang, locale, t, translateDom } from './i18n.js';

let ctx = null; // { getState, persist, rerender, toast, createShoppingItem, getWeek }
let activeId = ''; // selected plan
let draft = null; // review screen: { person, title, appointment, slots, editingId }
let swap = null; // { slotId, day }
let listRows = null; // [{ name, count, countable, have, pending, on }]
let lastDeleted = null;
let busy = '';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plans = () => ctx.getState().dietPlans || [];
const active = () => plans().find((p) => p.id === activeId) || plans()[0] || null;
const days = (start) => Array.from({ length: 7 }, (_, i) => { const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
const dayName = (key) => new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date(`${key}T12:00:00`));
const slotName = (s) => t(s.name);
const freqLabel = (n) => (n ? t(n === 1 ? '{n} φορά/εβδομάδα' : '{n} φορές/εβδομάδα', { n }) : '');
const dialog = () => document.querySelector('#diet-dialog');

export function initDietUi(context) {
  ctx = context;
  if (!document.querySelector('#diet-dialog')) {
    const el = document.createElement('dialog');
    el.id = 'diet-dialog'; el.className = 'item-dialog meal-dialog history-dialog diet-dialog'; el.setAttribute('aria-labelledby', 'diet-title');
    el.innerHTML = '<div class="dialog-heading"><div><p class="eyebrow" id="diet-eyebrow"></p><h2 id="diet-title">Διατροφή</h2></div><button class="icon-button" type="button" data-diet="close" aria-label="Κλείσιμο">×</button></div><div id="diet-body"></div>';
    document.body.append(el);
  }
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
}

// ---------- Section in the plan tab ----------
export function renderDietSection() {
  if (!ctx) return '';
  const plan = active();
  const scan = `<label class="button ${plan ? 'button-quiet' : 'button-primary'} file-button"><span>📷 ${esc(t('Σκάναρε πρόγραμμα διατροφής'))}</span><input type="file" accept="image/*,application/pdf" multiple class="visually-hidden" data-diet-file id="diet-file"></label><button class="button button-quiet" type="button" data-diet="paste">✍️ ${esc(t('Επικόλληση κειμένου'))}</button>`;
  const undo = '';
  const addSaved = plan ? `<label class="button button-quiet file-button" id="diet-add-saved"><span>➕ ${esc(t('Πρόσθεσε σελίδα (πίσω όψη)'))}</span><input type="file" accept="image/*,application/pdf" class="visually-hidden" data-diet-file data-add-saved></label>` : '';
  const twoHint = `<p class="field-hint" id="diet-two-hint">${esc(t('Μπορείς να διαλέξεις και τις 2 όψεις μαζί, ή να προσθέσεις τη 2η αργότερα με το ➕.'))}</p>`;
  if (!plan) {
    return `<section class="panel diet-section" id="diet-section"><div class="panel-heading"><div><h2>🥗 ${esc(t('Πρόγραμμα διατροφής'))}</h2><p>${esc(t('Φωτογράφισε το χαρτί του διαιτολόγου και η εβδομάδα γεμίζει μόνη της.'))}</p></div></div><div class="settings-actions">${scan}</div>${twoHint}${busy ? `<p class="field-hint" role="status" id="diet-busy">${esc(busy)}</p>` : ''}${undo}</section>`;
  }
  const start = ctx.getWeek();
  const week = plan.weeks?.[start];
  const warn = week ? overLimit(plan, week) : [];
  const byId = new Map(plan.slots.flatMap((s) => s.options.map((o) => [o.id, o])));
  const chips = plans().length > 1 ? `<div class="segmented diet-people" role="tablist">${plans().map((p) => `<button type="button" role="tab" class="filter-chip${p.id === plan.id ? ' is-active' : ''}" aria-selected="${p.id === plan.id}" data-diet="pick" data-id="${esc(p.id)}" data-no-i18n>${esc(p.person || t('Πρόγραμμα'))}</button>`).join('')}</div>` : '';
  const grid = week ? `<div class="diet-week" id="diet-week">${days(start).map((date, d) => `<section class="plan-day diet-day" data-day="${date}"><h3 class="plan-day-name" data-no-i18n>${esc(dayName(date))}</h3>${plan.slots.map((slot) => {
    const o = byId.get(week[slot.id]?.[d]);
    const over = o && warn.some((w) => w.optionId === o.id);
    return `<button type="button" class="plan-cell diet-cell${o ? ' has-meal' : ''}${over ? ' is-over' : ''}" data-diet="swap" data-slot="${esc(slot.id)}" data-day="${d}" data-no-i18n><span class="plan-slot">${esc(slotName(slot))}${slot.time ? ` · ${esc(slot.time)}` : ''}</span><span class="plan-meal">${o ? esc(o.text) : '＋'}</span>${over ? `<small class="diet-warn">⚠ ${esc(t('πάνω από το όριο'))}</small>` : ''}</button>`;
  }).join('')}</section>`).join('')}</div>` : `<p class="field-hint">${esc(t('Δεν έχει φτιαχτεί ακόμα αυτή η εβδομάδα.'))}</p>`;
  return `<section class="panel diet-section" id="diet-section"><div class="panel-heading"><div><h2>🥗 ${esc(t('Πρόγραμμα διατροφής'))}${plan.person ? ` · <span data-no-i18n>${esc(plan.person)}</span>` : ''}</h2><p>${esc(t('Πάτα ένα γεύμα για να το αλλάξεις με άλλη επιλογή του προγράμματος.'))}</p></div></div>
    ${chips}${plan.appointment ? `<p class="field-hint" id="diet-appointment">📅 ${esc(t('Επόμενο ραντεβού: {when}', { when: plan.appointment }))}</p>` : ''}
    ${warn.length ? `<p class="field-hint diet-warn" role="status">⚠ ${esc(t('Κάποιες επιλογές μπήκαν περισσότερες φορές από όσο λέει το πρόγραμμα.'))}</p>` : ''}
    <div class="settings-actions"><button class="button button-primary" type="button" data-diet="list" ${week ? '' : 'disabled'} id="diet-to-list">🛒 ${esc(t('Στείλε υλικά στη λίστα'))}</button><button class="button button-quiet" type="button" data-diet="regen" id="diet-regen">🔄 ${esc(t(week ? 'Νέα εβδομάδα' : 'Φτιάξε την εβδομάδα'))}</button>${addSaved}</div>
    ${grid}
    <details class="diet-more"><summary>${esc(t('Περισσότερα'))}</summary><div class="settings-actions"><button class="button button-quiet" type="button" data-diet="edit">✎ ${esc(t('Διόρθωση προγράμματος'))}</button>${scan}<button class="button button-quiet" type="button" data-diet="delete">🗑 ${esc(t('Διαγραφή προγράμματος'))}</button></div></details>
    ${busy ? `<p class="field-hint" role="status" id="diet-busy">${esc(busy)}</p>` : ''}${undo}</section>`;
}

function rerender() { ctx.rerender(); }
function openDialog(eyebrow, title, html) {
  const el = dialog();
  el.querySelector('#diet-eyebrow').textContent = t(eyebrow);
  el.querySelector('#diet-title').textContent = t(title);
  el.querySelector('#diet-body').innerHTML = html;
  translateDom(el.querySelector('#diet-body'));
  if (!el.open) el.showModal();
}

// ---------- Review ----------
function renderReview() {
  const freqSelect = (o, si, oi) => `<select class="field-input diet-freq" data-diet-field="perWeek" data-s="${si}" data-o="${oi}" aria-label="${esc(t('Φορές την εβδομάδα'))}"><option value="">${esc(t('Χωρίς όριο'))}</option>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}"${Number(o.perWeek) === n ? ' selected' : ''}>${esc(freqLabel(n))}</option>`).join('')}</select>`;
  const count = draft.slots.reduce((s, x) => s + x.options.length, 0);
  const html = `<p class="field-hint">${esc(t('Έλεγξε τι διάβασε η εφαρμογή. Διόρθωσε ό,τι χρειάζεται: τίποτα δεν αποθηκεύεται πριν πατήσεις «Αποθήκευση».'))}</p>
    <label class="field-label" for="diet-person">${esc(t('Για ποιον είναι; (προαιρετικά)'))}</label><input class="field-input" id="diet-person" data-diet-field="person" maxlength="40" value="${esc(draft.person)}" placeholder="${esc(t('π.χ. Νίκος'))}">
    <p class="field-hint" id="diet-count">${esc(t('{slots} γεύματα, {options} επιλογές', { slots: draft.slots.length, options: count }))}</p>
    <div class="settings-actions diet-add-page"><label class="button button-quiet file-button" id="diet-add-page"><span>➕ ${esc(t('Πρόσθεσε κι άλλη σελίδα (πίσω όψη)'))}</span><input type="file" accept="image/*,application/pdf" class="visually-hidden" data-diet-file data-add-page></label>${draft.pages ? `<span class="field-hint" id="diet-pages">${esc(t(draft.pages === 1 ? '{n} σελίδα' : '{n} σελίδες', { n: draft.pages }))}</span>` : ''}</div>${busy ? `<p class="field-hint" role="status" id="diet-busy">${esc(busy)}</p>` : ''}
    <div id="diet-review">${draft.slots.map((s, si) => `<fieldset class="diet-slot" data-s="${si}"><div class="field-row"><div><label class="field-label">${esc(t('Γεύμα'))}</label><input class="field-input" data-diet-field="name" data-s="${si}" maxlength="40" value="${esc(s.name)}" data-no-i18n></div><div class="diet-time"><label class="field-label">${esc(t('Ώρα'))}</label><input class="field-input" inputmode="numeric" maxlength="5" placeholder="12:00" data-diet-field="time" data-s="${si}" value="${esc(s.time)}"></div></div>
      <ol class="diet-options">${s.options.map((o, oi) => `<li class="diet-option"><textarea class="field-input" rows="2" data-diet-field="text" data-s="${si}" data-o="${oi}" aria-label="${esc(t('Επιλογή'))}">${esc(o.text)}</textarea><div class="diet-option-tools">${freqSelect(o, si, oi)}${oi ? `<button class="text-button" type="button" data-diet="merge" data-s="${si}" data-o="${oi}" title="${esc(t('Ένωση με την από πάνω'))}">⤒ ${esc(t('Ένωση'))}</button>` : ''}<button class="text-button" type="button" data-diet="del-option" data-s="${si}" data-o="${oi}" aria-label="${esc(t('Διαγραφή επιλογής'))}">✕ ${esc(t('Διαγραφή'))}</button></div></li>`).join('')}</ol>
      <div class="settings-actions"><button class="button button-quiet" type="button" data-diet="add-option" data-s="${si}">＋ ${esc(t('Επιλογή'))}</button><button class="text-button" type="button" data-diet="del-slot" data-s="${si}">${esc(t('Διαγραφή γεύματος'))}</button></div></fieldset>`).join('')}</div>
    <div class="settings-actions"><button class="button button-quiet" type="button" data-diet="add-slot">＋ ${esc(t('Γεύμα'))}</button></div>
    <p class="form-error" id="diet-error" role="alert" hidden></p>
    <div class="dialog-actions diet-sticky"><button class="button button-quiet" type="button" data-diet="close">${esc(t('Άκυρο'))}</button><button class="button button-primary" type="button" data-diet="save" id="diet-save">${esc(t('Αποθήκευση'))}</button></div>`;
  openDialog('ΠΡΟΓΡΑΜΜΑ ΔΙΑΤΡΟΦΗΣ', 'Έλεγχος πριν την αποθήκευση', html);
}

function startReview(parsed, editing = null, pages = 0) {
  draft = { pages, person: editing?.person || '', title: parsed.title, appointment: parsed.appointment || '', slots: parsed.slots.map((s) => ({ ...s, options: s.options.map((o) => ({ ...o })) })), editingId: editing?.id || '' };
  if (!draft.slots.length) draft.slots = [{ id: '', name: 'Πρωινό', time: '', options: [{ text: '', perWeek: null, free: false }] }];
  renderReview();
}

function saveDraft() {
  const state = ctx.getState();
  let plan;
  try { plan = createDietPlan({ person: draft.person, parsed: draft }); } catch (error) {
    const el = document.querySelector('#diet-error'); el.textContent = t(error.message); el.hidden = false; return;
  }
  const old = draft.editingId && plans().find((p) => p.id === draft.editingId);
  if (old) plan = { ...plan, id: old.id, createdAt: old.createdAt, weeks: {} };
  plan = setWeek(plan, ctx.getWeek(), generateWeek(plan));
  state.dietPlans = [...plans().filter((p) => p.id !== plan.id), plan];
  activeId = plan.id; draft = null;
  if (ctx.persist()) { dialog().close(); rerender(); ctx.toast(t('Το πρόγραμμα αποθηκεύτηκε και η εβδομάδα γέμισε.')); }
}

// ---------- Swap a cell ----------
function renderSwap() {
  const plan = active(); const start = ctx.getWeek();
  const slot = plan.slots.find((s) => s.id === swap.slotId);
  const week = plan.weeks?.[start] || {};
  const used = usage(week, slot.id); const current = week[slot.id]?.[swap.day];
  const html = `<div class="meal-options" id="diet-swap">${slot.options.map((o) => {
    const n = used.get(o.id) || 0; const full = o.perWeek && n >= o.perWeek && o.id !== current;
    return `<button type="button" class="meal-option${o.id === current ? ' is-active' : ''}" data-diet="swap-pick" data-id="${esc(o.id)}" data-no-i18n><span>${o.id === current ? '✓ ' : ''}${esc(o.text)}</span>${o.perWeek ? `<small class="${full ? 'diet-warn' : ''}">${esc(t('{used} από {limit} φορές αυτή την εβδομάδα', { used: n, limit: o.perWeek }))}${full ? ` · ⚠ ${esc(t('έχει φτάσει το όριο'))}` : ''}</small>` : ''}</button>`;
  }).join('')}</div><div class="dialog-actions"><button class="button button-quiet" type="button" data-diet="swap-clear">${esc(t('Κενό'))}</button></div>`;
  openDialog(`${dayName(days(start)[swap.day])} · ${slotName(slot)}${slot.time ? ` ${slot.time}` : ''}`, 'Άλλαξε γεύμα', html);
}

// ---------- Shopping list ----------
function renderList() {
  const html = `<p class="field-hint">${esc(t('Ξετίκαρε ό,τι έχεις ήδη. Όσα υπάρχουν στην αποθήκη ή στη λίστα είναι ήδη ξετικαρισμένα.'))}</p>
    <ul class="diet-checklist" id="diet-checklist">${listRows.map((r, i) => `<li><label class="check-row"><input type="checkbox" data-diet-check="${i}"${r.on ? ' checked' : ''}> <span data-no-i18n>${esc(t(r.name))}${r.countable && r.count > 1 ? ` ×${r.count}` : ''}</span>${r.pending ? ` <small>${esc(t('ήδη στη λίστα'))}</small>` : r.have ? ` <small>${esc(t('το έχεις'))}</small>` : ''}</label></li>`).join('')}</ul>
    <div class="dialog-actions diet-sticky"><button class="button button-quiet" type="button" data-diet="close">${esc(t('Άκυρο'))}</button><button class="button button-primary" type="button" data-diet="list-add" id="diet-list-add">${esc(t('Πρόσθεσε στη λίστα ({count})', { count: listRows.filter((r) => r.on).length }))}</button></div>`;
  openDialog('ΠΡΟΓΡΑΜΜΑ ΔΙΑΤΡΟΦΗΣ', 'Υλικά της εβδομάδας', html);
}

function addList() {
  const state = ctx.getState();
  const rows = listRows.filter((r) => r.on);
  for (const r of rows) {
    const existing = state.shopping.find((row) => !row.checked && row.name.toLocaleLowerCase('el-GR') === r.name.toLocaleLowerCase('el-GR'));
    if (existing) continue; // merge: never duplicate a pending row
    state.shopping.push(ctx.createShoppingItem({ name: t(r.name), quantity: r.countable ? r.count : 1 }));
  }
  if (ctx.persist()) { dialog().close(); listRows = null; rerender(); ctx.toast(t('Μπήκαν {count} υλικά στη λίστα.', { count: rows.length })); }
}

// ---------- Reading pages ----------
const loadImage = (file) => new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => { URL.revokeObjectURL(url); resolve(img); }; img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Δεν ήταν δυνατό να ανοίξει η φωτογραφία.')); }; img.src = url; });
const letters = (s) => (String(s).match(/\p{L}/gu) || []).length;

async function recognizeCanvas(canvas, onProgress) {
  if (window.__spitoDietOcrMock) return window.__spitoDietOcrMock(canvas);
  const { getWorker } = await import('./receipt-photo.js');
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas, { rotateAuto: true });
  return { text: data.text, confidence: data.confidence };
}

async function pdfPages(file, onProgress) {
  const lib = await import(PDFJS_URL); lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const out = [];
  for (let n = 1; n <= Math.min(doc.numPages, 6); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const it of content.items) { const y = Math.round(it.transform[5] / 3); rows.set(y, `${rows.get(y) || ''}${it.str}${it.hasEOL ? '' : ' '}`); }
    let text = [...rows].sort((a, b) => b[0] - a[0]).map(([, s]) => s.trim()).join('\n');
    if (letters(text) < 60) { // scanned PDF: read the page as a picture
      const viewport = page.getViewport({ scale: 2.5 }); const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      text = (await recognizeCanvas(canvas, onProgress)).text;
    }
    out.push(text);
  }
  return out;
}

// Unsharp-style 3x3 sharpen for blurry phone photos (on the grayscale canvas from preprocess).
function sharpen(canvas) {
  const ctx2 = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas; const src = ctx2.getImageData(0, 0, w, h); const out = ctx2.createImageData(w, h);
  const a = src.data; const b = out.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!x || !y || x === w - 1 || y === h - 1) { b[i] = b[i + 1] = b[i + 2] = a[i]; b[i + 3] = 255; continue; }
    const v = 5 * a[i] - a[i - 4] - a[i + 4] - a[i - w * 4] - a[i + w * 4];
    b[i] = b[i + 1] = b[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v; b[i + 3] = 255;
  }
  ctx2.putImageData(out, 0, 0); return canvas;
}

// One photo -> text; a sharpened second pass for blurry pages, sideways when the upright read finds almost nothing.
export async function readPhoto(file, onProgress) {
  const { preprocess } = await import('./receipt-photo.js');
  const img = await loadImage(file);
  let best = null;
  const keep = (r, angle) => { const score = letters(r.text) * (r.confidence || 50); if (!best || score > best.score) best = { ...r, score, angle }; };
  for (const angle of [0, 90, 270]) {
    const r = await recognizeCanvas(preprocess(img, angle), onProgress);
    keep(r, angle);
    if (r.confidence >= 55 && letters(r.text) > 80) break;
  }
  if (best.confidence < 60) keep(await recognizeCanvas(sharpen(preprocess(img, best.angle)), onProgress), best.angle);
  return best;
}

async function readFiles(files) {
  const texts = []; const confidences = [];
  const list = [...files];
  for (const [i, file] of list.entries()) {
    const progress = (m) => { busy = m.status === 'recognizing text' ? t('Διαβάζω τη σελίδα {page} από {pages}… {pct}%', { page: i + 1, pages: list.length, pct: Math.round((m.progress || 0) * 100) }) : t('Φόρτωση αναγνώρισης κειμένου (μόνο την πρώτη φορά)…'); const el = document.querySelector('#diet-busy'); if (el) el.textContent = busy; };
    busy = t('Διαβάζω τη σελίδα {page} από {pages}…', { page: i + 1, pages: list.length }); rerender();
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) texts.push(...await pdfPages(file, progress));
    else { const r = await readPhoto(file, progress); texts.push(r.text); confidences.push(r.confidence); }
  }
  return { text: texts.join(`\n${PAGE_BREAK}\n`), confidences, pages: texts.length };
}

async function importFiles(files, addPage = false) {
  if (!files?.length) return;
  if (addPage && draft) return addPages(files);
  try {
    const { text, confidences, pages } = await readFiles(files);
    busy = ''; rerender();
    const parsed = parseDietText(text);
    window.__spitoDietLast = { text, parsed, confidences };
    if (!parsed.slots.length) { ctx.toast(t('Δεν βρέθηκαν γεύματα. Δοκίμασε πιο καθαρή φωτογραφία ή επικόλλησε το κείμενο.')); openPaste(text); return; }
    startReview(parsed, null, pages);
    if (confidences.some((c) => c < 60)) ctx.toast(t('Κάποια σελίδα δεν διαβάστηκε καθαρά: έλεγξε προσεκτικά τις επιλογές.'));
  } catch (error) { busy = ''; rerender(); ctx.toast(t(error.message || 'Η αναγνώριση απέτυχε.')); }
}

// Extra page from the review screen: read it and merge into the current draft (nothing already there is replaced).
async function addPages(files) {
  const rd = () => { const el = document.querySelector('#diet-busy'); if (el) el.textContent = busy; };
  const rerenderOrig = ctx.rerender; ctx.rerender = rd; // keep the dialog open while reading
  try {
    busy = t('Διαβάζω τη νέα σελίδα…'); renderReview();
    const { text, confidences, pages } = await readFiles(files);
    const parsed = parseDietText(text);
    busy = '';
    const before = draft.slots.reduce((n, s) => n + s.options.length, 0);
    draft = { ...mergeParsed(draft, parsed), person: draft.person, editingId: draft.editingId, pages: (draft.pages || 0) + pages };
    const added = draft.slots.reduce((n, s) => n + s.options.length, 0) - before;
    renderReview();
    ctx.toast(added > 0 ? t('Προστέθηκαν {count} επιλογές από τη νέα σελίδα.', { count: added }) : t('Δεν βρέθηκαν νέες επιλογές σε αυτή τη σελίδα.'));
    if (confidences.some((c) => c < 60)) ctx.toast(t('Κάποια σελίδα δεν διαβάστηκε καθαρά: έλεγξε προσεκτικά τις επιλογές.'));
  } catch (error) { busy = ''; renderReview(); ctx.toast(t(error.message || 'Η αναγνώριση απέτυχε.')); }
  finally { ctx.rerender = rerenderOrig; }
}

function openPaste(text = '') {
  openDialog('ΠΡΟΓΡΑΜΜΑ ΔΙΑΤΡΟΦΗΣ', 'Επικόλληση κειμένου', `<p class="field-hint">${esc(t('Επικόλλησε το πρόγραμμα. Κάθε γεύμα σε δική του γραμμή με την ώρα, π.χ. «ΣΝΑΚ (18:00)», και από κάτω οι επιλογές.'))}</p><textarea class="field-input" id="diet-paste" rows="12">${esc(text)}</textarea><div class="dialog-actions"><button class="button button-quiet" type="button" data-diet="close">${esc(t('Άκυρο'))}</button><button class="button button-primary" type="button" data-diet="paste-go">${esc(t('Συνέχεια'))}</button></div>`);
}

function restoreDeleted() {
  if (!lastDeleted) return;
  const state = ctx.getState(); state.dietPlans = [...plans().filter((p) => p.id !== lastDeleted.id), lastDeleted]; activeId = lastDeleted.id; lastDeleted = null;
  if (ctx.persist()) rerender();
}

// ---------- Events ----------
function syncField(el) {
  const f = el.dataset.dietField; if (!draft || !f) return;
  if (f === 'person') { draft.person = el.value; return; }
  const s = draft.slots[Number(el.dataset.s)]; if (!s) return;
  if (f === 'name' || f === 'time') s[f] = el.value;
  else { const o = s.options[Number(el.dataset.o)]; if (!o) return; if (f === 'perWeek') o.perWeek = el.value ? Number(el.value) : null; else o.text = el.value; }
}
function onInput(event) { if (event.target.closest?.('#diet-dialog')) syncField(event.target); }
function onChange(event) {
  const el = event.target;
  if (el.matches?.('[data-diet-file]')) { const files = [...el.files]; const add = el.hasAttribute('data-add-page'); const saved = el.hasAttribute('data-add-saved'); el.value = '';
    if (saved && active()) { const p = active(); draft = { person: p.person || '', title: p.title, appointment: p.appointment || '', slots: p.slots.map((s) => ({ ...s, options: s.options.map((o) => ({ ...o })) })), editingId: p.id, pages: 1 }; importFiles(files, true); return; }
    importFiles(files, add); return; }
  if (el.matches?.('[data-diet-check]')) { listRows[Number(el.dataset.dietCheck)].on = el.checked; const b = document.querySelector('#diet-list-add'); if (b) b.textContent = t('Πρόσθεσε στη λίστα ({count})', { count: listRows.filter((r) => r.on).length }); return; }
  if (el.closest?.('#diet-dialog')) syncField(el);
}

function onClick(event) {
  const button = event.target.closest?.('[data-diet]'); if (!button) return;
  const a = button.dataset.diet; const si = Number(button.dataset.s); const oi = Number(button.dataset.o);
  const state = ctx.getState(); const plan = active(); const start = ctx.getWeek();
  const savePlan = (next) => { state.dietPlans = plans().map((p) => (p.id === next.id ? next : p)); return ctx.persist(); };
  if (a === 'close') { dialog().close(); draft = null; swap = null; listRows = null; }
  else if (a === 'paste') openPaste();
  else if (a === 'paste-go') { const parsed = parseDietText(document.querySelector('#diet-paste').value); if (!parsed.slots.length) ctx.toast(t('Δεν βρέθηκαν γεύματα. Γράψε κάθε γεύμα σε δική του γραμμή με την ώρα του.')); else startReview(parsed); }
  else if (a === 'add-option') { draft.slots[si].options.push({ text: '', perWeek: null, free: false }); renderReview(); }
  else if (a === 'del-option') { draft.slots[si].options.splice(oi, 1); renderReview(); }
  else if (a === 'merge') { const opts = draft.slots[si].options; opts[oi - 1].text = `${opts[oi - 1].text} ${opts[oi].text}`.trim(); opts[oi - 1].perWeek = opts[oi - 1].perWeek || opts[oi].perWeek; opts.splice(oi, 1); renderReview(); }
  else if (a === 'add-slot') { draft.slots.push({ id: '', name: '', time: '', options: [{ text: '', perWeek: null, free: false }] }); renderReview(); }
  else if (a === 'del-slot') { draft.slots.splice(si, 1); renderReview(); }
  else if (a === 'save') saveDraft();
  else if (a === 'pick') { activeId = button.dataset.id; rerender(); }
  else if (a === 'regen' && plan) { if (savePlan(setWeek(plan, start, generateWeek(plan)))) { rerender(); ctx.toast(t('Νέα εβδομάδα έτοιμη.')); } }
  else if (a === 'edit' && plan) startReview({ title: plan.title, appointment: plan.appointment, slots: plan.slots }, plan);
  else if (a === 'delete' && plan) {
    lastDeleted = plan; state.dietPlans = plans().filter((p) => p.id !== plan.id); activeId = '';
    if (ctx.persist()) { rerender(); ctx.toast(t('Το πρόγραμμα διαγράφηκε.'), { undo: () => restoreDeleted() }); }
  }
  else if (a === 'swap' && plan?.weeks?.[start]) { swap = { slotId: button.dataset.slot, day: Number(button.dataset.day) }; renderSwap(); }
  else if ((a === 'swap-pick' || a === 'swap-clear') && plan && swap) {
    const week = structuredClone(plan.weeks[start]); week[swap.slotId][swap.day] = a === 'swap-pick' ? button.dataset.id : null;
    const next = setWeek(plan, start, week);
    if (savePlan(next)) { dialog().close(); const over = overLimit(next, week).some((w) => w.optionId === button.dataset.id); swap = null; rerender(); if (over) ctx.toast(t('Προσοχή: αυτή η επιλογή είναι πάνω από το όριο της εβδομάδας.')); }
  }
  else if (a === 'list' && plan?.weeks?.[start]) { listRows = weekIngredients(plan, plan.weeks[start], { items: state.items, shopping: state.shopping }).map((r) => ({ ...r, on: !r.have && !r.pending })); renderList(); }
  else if (a === 'list-add') addList();
}
export const _test = { get lang() { return getLang(); } };
