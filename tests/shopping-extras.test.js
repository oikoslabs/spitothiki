import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOTE_MAX, PAST_LISTS_MAX, SHOPPING_EXTRAS_EN, archiveChecked, cleanNote, createNoticeBatcher, lastList, listNoticeText, quickSuggestions, reshop, reshopSource, setRowNote, shoppingChanges } from '../src/shopping-extras.js';
import { SyncEngine } from '../src/sync-core.js';
import { shoppingListText } from '../src/domain.js';
import { DATA_KINDS } from '../src/storage.js';
import { dictionaries, setLang, t } from '../src/i18n.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const row = (id, name, extra = {}) => ({ id, name, quantity: 1, unit: 'τεμ.', checked: false, createdAt: '2026-11-01T10:00:00.000Z', ...extra });
const doc = (data, by, extra = {}) => ({ kind: 'shopping', id: data.id, data, deleted: false, ts: 5, by, ...extra });

test('shared-list changes: add / check / edit by another member, never my own, deletions and price bookkeeping ignored', () => {
  const before = [row('a', 'Γάλα'), row('b', 'Ψωμί'), row('c', 'Φέτα', { checked: true })];
  const events = shoppingChanges(before, [
    doc(row('n', 'Αυγά'), 'maria'),
    doc(row('a', 'Γάλα', { checked: true, pantryAdded: 1, itemId: 'i1' }), 'maria'),
    doc(row('b', 'Ψωμί', { note: 'ολικής' }), 'maria'),
    doc(row('c', 'Φέτα', { checked: false }), 'nikos'),
    doc(row('m', 'Ρύζι'), 'me'),
    { kind: 'shopping', id: 'b', data: null, deleted: true, ts: 6, by: 'maria' },
    { kind: 'items', id: 'x', data: { id: 'x', name: 'Λάδι' }, deleted: false, ts: 6, by: 'maria' },
    doc(row('a2', 'Ζάχαρη'), '')
  ], 'me');
  assert.deepEqual(events, [
    { by: 'maria', type: 'add', name: 'Αυγά' },
    { by: 'maria', type: 'check', name: 'Γάλα' },
    { by: 'maria', type: 'edit', name: 'Ψωμί' },
    { by: 'nikos', type: 'edit', name: 'Φέτα' }
  ]);
  // Only pantry bookkeeping changed on an already-ticked row: no notice.
  assert.deepEqual(shoppingChanges([row('c', 'Φέτα', { checked: true })], [doc(row('c', 'Φέτα', { checked: true, pantryAdded: 2 }), 'maria')], 'me'), []);
  // A row added already ticked (e.g. cart) is not an «added» notice.
  assert.deepEqual(shoppingChanges([], [doc(row('z', 'Νερό', { checked: true }), 'maria')], 'me'), []);
});

test('notice text: one person one action, mixed actions, several people, English', () => {
  setLang('el');
  const names = { maria: 'Μαρία', nikos: 'Νίκος' };
  assert.deepEqual(listNoticeText([{ by: 'maria', type: 'add', name: 'γάλα' }], names, t), { title: 'Μαρία πρόσθεσε γάλα', body: 'Λίστα αγορών' });
  const many = listNoticeText(['γάλα', 'ψωμί', 'αυγά', 'φέτα', 'Γάλα'].map((name) => ({ by: 'maria', type: 'add', name })), names, t);
  assert.equal(many.title, 'Μαρία πρόσθεσε γάλα, ψωμί, αυγά και 1 ακόμη');
  const mixed = listNoticeText([{ by: 'maria', type: 'add', name: 'γάλα' }, { by: 'maria', type: 'check', name: 'ψωμί' }], names, t);
  assert.deepEqual(mixed, { title: 'Μαρία άλλαξε τη λίστα αγορών', body: 'Πρόσθεσε: γάλα · Πήρε: ψωμί' });
  const two = listNoticeText([{ by: 'maria', type: 'add', name: 'γάλα' }, { by: 'ghost', type: 'edit', name: 'ψωμί' }], names, t);
  assert.deepEqual(two, { title: 'Αλλαγές στη λίστα αγορών', body: 'Μαρία: Πρόσθεσε: γάλα · Ένα μέλος: Άλλαξε: ψωμί' });
  assert.equal(listNoticeText([], names, t), null);
  setLang('en');
  try { assert.deepEqual(listNoticeText([{ by: 'maria', type: 'add', name: 'milk' }], { maria: 'Maria' }, t), { title: 'Maria added milk', body: 'Shopping list' }); }
  finally { setLang('el'); }
});

test('notice batcher: one flush per burst, maxWait, and at most one per gap', () => {
  let clock = 0;
  const timers = [];
  const flushed = [];
  const b = createNoticeBatcher({ quiet: 10, maxWait: 30, gap: 100, now: () => clock, onFlush: (batch) => flushed.push(batch.map((e) => e.name)),
    setTimer: (fn, ms) => { const tm = { fn, at: clock + ms, live: true }; timers.push(tm); return tm; }, clearTimer: (tm) => { tm.live = false; } });
  const advance = (to) => { while (true) { const due = timers.filter((tm) => tm.live && tm.at <= to).sort((x, y) => x.at - y.at)[0]; if (!due) break; clock = due.at; due.live = false; due.fn(); } clock = to; };
  b.push([]); assert.equal(b.size, 0);
  b.push([{ name: 'a' }]); advance(5); b.push([{ name: 'b' }]); advance(14);
  assert.deepEqual(flushed, []);
  advance(15); assert.deepEqual(flushed, [['a', 'b']]);
  // Next burst right after: waits for the 100 ms gap since the last flush.
  b.push([{ name: 'c' }]); advance(40); b.push([{ name: 'd' }]); advance(114);
  assert.deepEqual(flushed, [['a', 'b']]);
  advance(115); assert.deepEqual(flushed, [['a', 'b'], ['c', 'd']]);
  // Constant stream: maxWait still flushes (once the gap allows).
  clock = 1000;
  for (let i = 0; i < 6; i += 1) { b.push([{ name: `s${i}` }]); advance(clock + 8); }
  assert.equal(flushed.length, 3);
  assert.deepEqual(flushed[2], ['s0', 's1', 's2', 's3']);
  b.push([{ name: 'x' }]); b.cancel(); advance(5000); assert.equal(flushed.length, 3);
  assert.ok(!flushed.flat().includes('x'));
});

test('sync engine reports live remote changes with the state before, never the first load', async () => {
  let state = { items: [], shopping: [row('a', 'Γάλα')] };
  let listener = null;
  const calls = [];
  const engine = new SyncEngine({
    backend: { subscribe: (fn) => { listener = fn; return () => {}; }, write: async () => {} },
    getState: () => state, setState: (next) => { state = next; }, store: { load: () => null, save: () => {} }, uid: () => 'me',
    onRemote: (docs, before) => calls.push({ docs, before: before.shopping.map((r) => r.name) })
  });
  engine.start();
  await listener([doc(row('b', 'Ψωμί'), 'maria', { ts: 1 })]);
  assert.equal(calls.length, 0);
  await listener([doc(row('c', 'Αυγά'), 'maria', { ts: 9 })]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].before, ['Ψωμί', 'Γάλα']);
  assert.deepEqual(shoppingChanges(state.shopping.filter((r) => r.id !== 'c'), calls[0].docs, 'me'), [{ by: 'maria', type: 'add', name: 'Αυγά' }]);
  // Nothing new (same ts): no call.
  await listener([doc(row('c', 'Αυγά'), 'maria', { ts: 9 })]);
  assert.equal(calls.length, 1);
});

test('quick suggestions: most bought first, skip what is pending and receipt totals, filter while typing', () => {
  const state = {
    shopping: [row('p', 'Ψωμί'), row('q', 'Φέτα', { checked: true, createdAt: '2026-11-09' })],
    pastLists: [{ id: 'l1', at: '2026-11-05T10:00:00Z', rows: [{ name: 'Γάλα', quantity: 2, unit: 'λίτρα', note: 'ΔΕΛΤΑ', category: 'Γαλακτοκομικά' }, { name: 'Ψωμί', quantity: 1, unit: 'τεμ.' }] },
      { id: 'l0', at: '2026-10-29T10:00:00Z', rows: [{ name: 'γάλα', quantity: 1, unit: 'λίτρα' }] }],
    purchases: [{ id: 'pur-r1', receiptId: 'r1', name: 'Σκλαβενίτης', price: 30, date: '2026-11-02' }, { id: 'pur-r1-0', receiptId: 'r1', name: 'Μπανάνες', price: 2, date: '2026-11-02' }, { id: 'pur-x', name: 'Μπανάνες', price: 2, date: '2026-11-03' }],
    recurring: [{ name: 'Απορρυπαντικό', quantity: 1, unit: 'τεμ.' }]
  };
  const list = quickSuggestions(state);
  assert.deepEqual(list.map((s) => s.name), ['Γάλα', 'Μπανάνες', 'Φέτα', 'Απορρυπαντικό']);
  assert.deepEqual(list[0], { name: 'Γάλα', quantity: 2, unit: 'λίτρα', category: 'Γαλακτοκομικά', note: 'ΔΕΛΤΑ' });
  assert.ok(!list.some((s) => s.name === 'Σκλαβενίτης' || s.name === 'Ψωμί'));
  assert.deepEqual(quickSuggestions(state, { query: 'μπαν' }).map((s) => s.name), ['Μπανάνες']);
  assert.deepEqual(quickSuggestions(state, { query: 'ΓΑΛΑ' }).map((s) => s.name), ['Γάλα']);
  assert.equal(quickSuggestions(state, { limit: 2 }).length, 2);
  assert.deepEqual(quickSuggestions({}), []);
});

test('«Ξαναψώνισε τα ίδια»: archive on clear, re-add last list, or turn ticked rows into new pending ones', () => {
  const ticked = [row('a', 'Γάλα', { checked: true, pantryAdded: 1, itemId: 'i1', note: 'ΔΕΛΤΑ' }), row('b', 'Ψωμί', { checked: true }), row('c', 'Αυγά')];
  const past = archiveChecked([], ticked, '2026-11-10T09:00:00.000Z');
  assert.equal(past.length, 1);
  assert.deepEqual(past[0].rows, [{ name: 'Γάλα', quantity: 1, unit: 'τεμ.', note: 'ΔΕΛΤΑ', itemId: 'i1' }, { name: 'Ψωμί', quantity: 1, unit: 'τεμ.' }]);
  assert.equal(archiveChecked(past, [row('z', 'x')]), past);
  let many = [];
  for (let i = 0; i < 8; i += 1) many = archiveChecked(many, [row('a', `P${i}`, { checked: true })], `2026-11-0${i + 1}T00:00:00.000Z`);
  assert.equal(many.length, PAST_LISTS_MAX);
  assert.equal(lastList(many).rows[0].name, 'P7');

  // Last list after clearing: brings back what is not already pending.
  const after = { shopping: [row('c', 'Αυγά'), row('d', 'ψωμί')], pastLists: past };
  assert.equal(reshopSource(after.shopping, after.pastLists).source, 'last');
  const r1 = reshop(after, '2026-11-11T10:00:00.000Z');
  assert.equal(r1.added, 1);
  assert.deepEqual(r1.shopping.slice(2).map(({ name, note, itemId, checked }) => ({ name, note, itemId, checked })), [{ name: 'Γάλα', note: 'ΔΕΛΤΑ', itemId: 'i1', checked: false }]);
  assert.equal(r1.pastLists, past);

  // Ticked rows still on the list: archived and replaced by fresh pending copies (pantry left as it is).
  const r2 = reshop({ shopping: ticked, pastLists: [] }, '2026-11-11T10:00:00.000Z');
  assert.equal(r2.source, 'checked');
  assert.equal(r2.added, 2);
  assert.ok(r2.shopping.every((r) => !r.checked && !('pantryAdded' in r)));
  assert.deepEqual(r2.shopping.map((r) => r.name), ['Αυγά', 'Γάλα', 'Ψωμί']);
  assert.ok(!r2.shopping.some((r) => r.id === 'a' || r.id === 'b'));
  assert.equal(r2.pastLists.length, 1);

  assert.deepEqual(reshop({ shopping: [row('c', 'Αυγά')], pastLists: [] }).source, '');
});

test('row note: cleaned, capped, cleared, kept in the shared text', () => {
  assert.equal(cleanNote('  Barilla   500 γρ.  '), 'Barilla 500 γρ.');
  assert.equal(cleanNote('x'.repeat(200)).length, NOTE_MAX);
  let list = setRowNote([row('a', 'Μακαρόνια'), row('b', 'Ψωμί')], 'a', ' Barilla 500 γρ. ');
  assert.equal(list[0].note, 'Barilla 500 γρ.');
  assert.equal(list[1].note, undefined);
  assert.equal(shoppingListText(list), '🛒 Λίστα αγορών (Σπιτοθήκη)\n• Μακαρόνια — 1 τεμ. (Barilla 500 γρ.)\n• Ψωμί — 1 τεμ.');
  list = setRowNote(list, 'a', '   ');
  assert.ok(!('note' in list[0]));
});

test('wiring: synced pastLists kind, SW precache + cache bump + notification click, settings toggle, English', () => {
  assert.ok(DATA_KINDS.includes('pastLists'));
  const sw = read('sw.js');
  assert.match(sw, /CACHE_VERSION = 'v141';/);
  assert.match(sw, /'\.\/src\/shopping-extras\.js'/);
  assert.match(sw, /'spitothiki-list' \? 'shopping'/);
  const app = read('src/app.js');
  assert.match(app, /id="notify-list"/);
  assert.match(app, /listNotify: saved\.listNotify !== false/);
  assert.match(app, /data-action="reshop"/);
  assert.match(app, /id="shopping-suggest"/);
  assert.match(read('src/sync-firebase.js'), /onRemote/);
  for (const [el, en] of Object.entries(SHOPPING_EXTRAS_EN)) { assert.equal(dictionaries.en[el], en); assert.ok(en.trim()); }
  // No new network calls in the feature module.
  assert.doesNotMatch(read('src/shopping-extras.js'), /fetch\(|XMLHttpRequest|sendBeacon/);
});

test('guide: shopping chapter documents all four features (EL/EN), incl. the toggle and the closed-app limit', async () => {
  const { GUIDE_SECTIONS } = await import('../src/guide.js');
  const text = GUIDE_SECTIONS.find((s) => s.id === 'shopping').bullets.join(' ');
  for (const re of [/«Συχνά:»/, /✎ Πρόσθεσε σημείωση/, /🔁 Ξαναψώνισε τα ίδια/, /Μαρία πρόσθεσε γάλα/, /εντελώς κλειστή εφαρμογή δεν έρχεται/, /Ρυθμίσεις → Ειδοποιήσεις → «Ειδοποίηση όταν άλλο μέλος αλλάζει την κοινή λίστα αγορών»/]) assert.match(text, re);
  setLang('en');
  try { const en = GUIDE_SECTIONS.find((s) => s.id === 'shopping').bullets.map((b) => t(b)).join(' '); for (const re of [/«Often:»/, /Add a note/, /Buy the same again/, /fully closed/, /Notify me when another member changes the shared shopping list/]) assert.match(en, re); }
  finally { setLang('el'); }
});

test('note being typed survives a sync re-render (draft + focus kept)', () => {
  const app = read('src/app.js');
  assert.match(app, /noteDraft \?\? item\.note/);
  assert.match(app, /event\.target\.id === 'row-note-input'\) noteDraft = event\.target\.value/);
  assert.match(app, /activeElement\?\.id === 'row-note-input'/);
});

test('suggest chips and row notes use theme tokens (readable in light, explicit dark, and auto dark)', () => {
  const css = read('styles.css');
  const chip = css.match(/\.suggest-chip\s*\{[^}]+\}/)?.[0] || '';
  const note = css.match(/\.shopping-row-note\s*\{[^}]+\}/)?.[0] || '';
  assert.match(chip, /background:\s*var\(--surface\)/);
  assert.match(chip, /color:\s*var\(--ink\)/);
  assert.match(chip, /border-color:\s*var\(--line\)/);
  assert.doesNotMatch(chip, /#f6f9f4|color:\s*inherit/);
  assert.match(note, /color:\s*var\(--green-dark\)/);
  assert.doesNotMatch(note, /#3d5a45/);
  // Hard-coded light colours with only a :root[data-theme="dark"] override miss auto + system dark.
  assert.doesNotMatch(css, /:root\[data-theme="dark"\] \.suggest-chip/);
  assert.doesNotMatch(css, /:root\[data-theme="dark"\] \.shopping-row-note/);

  const vars = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{3,8})/g)].map((m) => [m[1], m[2]]));
  const light = vars(css.match(/:root\s*\{[^}]+\}/)[0]);
  const dark = vars(css.match(/:root\[data-theme="dark"\]\s*\{[^}]+\}/)[0]);
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const to = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * to((n >> 16) & 255) + 0.7152 * to((n >> 8) & 255) + 0.0722 * to(n & 255);
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const theme of [light, dark]) {
    assert.ok(contrast(theme.ink, theme.surface) >= 4.5, `${theme.ink} on ${theme.surface}`);
    assert.ok(contrast(theme['green-dark'], theme.surface) >= 4.5, `green-dark ${theme['green-dark']} on ${theme.surface}`);
  }
});
