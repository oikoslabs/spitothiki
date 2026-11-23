// Backend-independent sync engine: keeps localStorage as the source of truth for the UI and
// exchanges per-record changes with a backend (Firestore in production, in-memory in tests).
// Conflict rule: last writer wins per record, by the client timestamp `ts`.
// Deletions are kept as tombstones (`deleted: true`) so they reach other devices.

import { DATA_KINDS } from './storage.js';

const KINDS = DATA_KINDS;

// Copies the record lists of a state; optional kinds only when present (keeps old states unchanged).
function lists(state) {
  const out = { items: [...(state?.items || [])], shopping: [...(state?.shopping || [])] };
  for (const kind of KINDS.slice(2)) if (Array.isArray(state?.[kind])) out[kind] = [...state[kind]];
  return out;
}

export function recordKey(kind, id) {
  return `${kind}:${id}`;
}

function index(state) {
  const map = new Map();
  for (const kind of KINDS) for (const record of state?.[kind] || []) map.set(recordKey(kind, record.id), { kind, record });
  return map;
}

// Changes between two states as backend docs: [{ kind, id, data, deleted }].
export function diffStates(previous, next) {
  const before = index(previous);
  const after = index(next);
  const changes = [];
  for (const [key, { kind, record }] of after) {
    const old = before.get(key);
    if (!old || JSON.stringify(old.record) !== JSON.stringify(record)) changes.push({ kind, id: record.id, data: record, deleted: false });
  }
  for (const [key, { kind, record }] of before) {
    if (!after.has(key)) changes.push({ kind, id: record.id, data: null, deleted: true });
  }
  return changes;
}

// Applies remote docs that are newer than what this device knows; returns { state, times, changed }.
export function applyRemote(state, times, docs) {
  const next = lists(state);
  const nextTimes = { ...times };
  let changed = false;
  for (const doc of docs) {
    if (!KINDS.includes(doc.kind) || !doc.id) continue;
    const key = recordKey(doc.kind, doc.id);
    if (Number(doc.ts) <= Number(nextTimes[key] || 0)) continue;
    nextTimes[key] = Number(doc.ts);
    const list = next[doc.kind] || (next[doc.kind] = []);
    const position = list.findIndex((record) => record.id === doc.id);
    if (doc.deleted) {
      if (position >= 0) { list.splice(position, 1); changed = true; }
    } else if (doc.data && typeof doc.data === 'object') {
      const record = { ...doc.data, id: doc.id };
      if (position >= 0) {
        if (JSON.stringify(list[position]) !== JSON.stringify(record)) { list[position] = record; changed = true; }
      } else { list.unshift(record); changed = true; }
    }
  }
  return { state: next, times: nextTimes, changed };
}

// backend: { subscribe(onDocs) -> unsubscribe, write(docs) -> Promise (resolves when the server has them) }
//   onDocs(docs, info): info.fromCache = true when the docs came from the device cache, not the server;
//   info.serverKeys = Set of 'kind:id' the server really has (first server snapshot only). A doc may carry
//   `pendingWrite: true` (a local write the server has not confirmed yet).
// store: { load() -> { snapshot, times, writers, outbox } | null, save(meta) }
// v1.9.45: outbox. A change counts as uploaded only after backend.write() resolves (or the server sends
// it back). Until then it stays in `outbox` (saved with the meta, so it survives closing the app) and is
// sent again on the next push()/retry(), after a failure, when the device is back online, or on next start.
const RETRY_MS = [5000, 15000, 60000, 300000];
const CHUNK = 100; // records per upload (one Firestore batch each)
const MAX_DOC_BYTES = 900000; // Firestore's limit is 1 MiB per document
// Errors that will not go away by sending the same thing again (Firestore codes).
const PERMANENT = new Set(['invalid-argument', 'permission-denied', 'failed-precondition', 'out-of-range', 'invalid-data', 'too-large']);
const errorCode = (error) => String(error?.code || error?.message || 'unknown').replace(/^firestore\//, '');
const isPermanent = (error) => PERMANENT.has(errorCode(error));

// What Firestore would refuse before sending: too big, arrays inside arrays, empty or «__x__» field names.
function badValue(value, inArray, depth) {
  if (depth > 18) return true;
  if (Array.isArray(value)) { if (inArray) return true; return value.some((v) => badValue(v, true, depth + 1)); }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { if (k === '' || /^__.*__$/.test(k)) return true; if (badValue(v, false, depth + 1)) return true; }
  }
  return false;
}
export function invalidDoc(doc) {
  if (doc.deleted || !doc.data) return '';
  let text = '';
  try { text = JSON.stringify(doc.data); } catch { return 'invalid-data'; }
  if (text.length > MAX_DOC_BYTES || new TextEncoder().encode(text).length > MAX_DOC_BYTES) return 'too-large';
  return badValue(doc.data, false, 0) ? 'invalid-data' : '';
}

export class SyncEngine {
  constructor({ backend, getState, setState, store, now = () => Date.now(), uid = () => '', onRemote = null, onCounts = null, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) }) {
    Object.assign(this, { backend, getState, setState, store, now, uid, onRemote, onCounts, setTimer, clearTimer });
    const saved = store.load() || {};
    this.times = saved.times || {};
    // v1.7.0: who last saved each record ('kind:id' → uid), from the sync rows' `by`; local meta only, never sent.
    this.writers = saved.writers && typeof saved.writers === 'object' ? saved.writers : {};
    this.snapshot = saved.snapshot || null;
    this.outbox = saved.outbox && typeof saved.outbox === 'object' ? saved.outbox : {};
    // v1.9.46: changes the server refused for good (bad data / not allowed): 'kind:id' → { ts, code }.
    // They no longer block the rest; «Έλεγχος & αποστολή όσων λείπουν» tries them again.
    this.failed = saved.failed && typeof saved.failed === 'object' ? saved.failed : {};
    this.lastCounts = '';
    this.inflight = new Map(); // 'kind:id' → ts being sent right now (no duplicate sends)
    this.failures = 0;
    this.timer = null;
    this.verifyMissing = false;
    this.stopped = false;
    this.ready = false;
    this.unsubscribe = null;
  }

  start() {
    this.stopped = false;
    this.unsubscribe = this.backend.subscribe((docs, info) => this.receive(docs, info));
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.ready = false;
    this.stopped = true;
    this.inflight.clear();
    if (this.timer !== null) { this.clearTimer(this.timer); this.timer = null; }
  }

  // Server copies (not unconfirmed local writes) with the same or a newer time settle the outbox entry.
  settle(docs) {
    let settled = false;
    for (const doc of docs) {
      if (!doc?.kind || !doc.id || doc.pendingWrite) continue;
      const key = recordKey(doc.kind, doc.id);
      const waiting = this.outbox[key];
      if (waiting && Number(doc.ts) >= Number(waiting.ts)) { delete this.outbox[key]; settled = true; }
    }
    return settled;
  }

  receive(docs, info = {}) {
    docs = Array.isArray(docs) ? docs : [];
    const firstSync = !this.ready;
    const fromServer = info?.fromCache !== true;
    for (const doc of docs) {
      if (!doc?.kind || !doc.id) continue;
      const key = recordKey(doc.kind, doc.id);
      if (doc.deleted) delete this.writers[key]; else if (doc.by && (Number(doc.ts) >= Number(this.times[key] || 0))) this.writers[key] = String(doc.by);
    }
    const before = this.getState();
    const result = applyRemote(before, this.times, docs);
    this.times = result.times;
    this.settle(docs);
    if (firstSync) {
      // First contact with this household: records only on this device get uploaded,
      // records on the server take precedence unless this device changed them later.
      // Baseline = what the server has. Anything on this device that differs from it is uploaded by push().
      // v1.9.45: a record the server doesn't have is uploaded again (before, it was assumed already sent,
      // so a lost upload never reached the other devices). Deletions always leave a tombstone on the server,
      // so «missing on the server» means «never arrived», never «deleted on another device».
      // If these docs came from the device cache, the server is not known yet: keep the last synced copy
      // for now and check again on the first server answer (see below).
      const remote = new Map(docs.map((doc) => [recordKey(doc.kind, doc.id), doc]));
      const base = this.snapshot || { items: [], shopping: [] };
      const baseline = { items: [], shopping: [] };
      for (const kind of KINDS) {
        for (const record of result.state[kind] || []) {
          const doc = remote.get(recordKey(kind, record.id));
          // v1.9.46: a cached copy the server has not confirmed (pendingWrite) may never arrive (stuck write
          // queue): keep it as the baseline for now, but check it against the server answer like a missing one.
          if (doc) { if (!doc.deleted && doc.data) (baseline[kind] || (baseline[kind] = [])).push({ ...doc.data, id: doc.id }); if (doc.pendingWrite) this.verifyMissing = true; }
          else if (!fromServer) { const old = (base[kind] || []).find((b) => b.id === record.id); if (old) { (baseline[kind] || (baseline[kind] = [])).push(old); this.verifyMissing = true; } }
        }
      }
      this.snapshot = baseline;
      this.ready = true;
    } else {
      // Remote changes become part of the synced baseline so they aren't echoed back.
      const merged = applyRemote(this.snapshot || { items: [], shopping: [] }, {}, docs.map((doc) => ({ ...doc, ts: 1 })));
      this.snapshot = merged.state;
    }
    // First server answer after a start from the cache: records the server lacks are uploaded again.
    let recheck = false;
    if (this.verifyMissing && fromServer && info?.serverKeys instanceof Set && this.snapshot) {
      const current = this.getState();
      const next = lists(this.snapshot);
      for (const kind of KINDS) {
        if (!next[kind]) continue;
        const local = new Set((current?.[kind] || []).map((r) => r.id));
        next[kind] = next[kind].filter((r) => { const key = recordKey(kind, r.id); const missing = local.has(r.id) && !info.serverKeys.has(key) && !this.outbox[key]; if (missing) recheck = true; return !missing; });
      }
      this.snapshot = next;
      this.verifyMissing = false;
    }
    if (result.changed) this.setState(result.state);
    // v1.9.22: live changes (never the first load) go to the app, with the state from before, for notices.
    if (!firstSync && result.changed && this.onRemote) { try { this.onRemote(docs, before); } catch {} }
    this.persistMeta();
    if (firstSync || recheck) return this.push();
    return Promise.resolve();
  }

  // Call after every local save (and to retry: on 'online', when the app becomes visible).
  push() {
    if (!this.ready || this.stopped) return Promise.resolve();
    const current = this.getState();
    const changes = diffStates(this.snapshot, current);
    if (changes.length) {
      const ts = this.now();
      const me = this.uid() || '';
      for (const change of changes) {
        const doc = { ...change, ts };
        const key = recordKey(doc.kind, doc.id);
        this.times[key] = ts;
        if (doc.deleted) delete this.writers[key]; else if (me) this.writers[key] = me;
        this.outbox[key] = JSON.parse(JSON.stringify(doc));
        delete this.failed[key]; // a newer change gets a fresh chance
      }
      this.snapshot = JSON.parse(JSON.stringify(lists(current)));
      this.persistMeta();
    }
    return this.flush();
  }

  retry() {
    if (this.timer !== null) { this.clearTimer(this.timer); this.timer = null; }
    return this.push();
  }

  // Sends every outbox entry that isn't on its way already; clears them only when the backend confirms.
  // v1.9.46: in chunks; a chunk the server refuses for good is split, so one bad record can't hold back
  // the others. A single refused record moves to `failed` (kept, shown in Settings, tried again on demand).
  flush() {
    if (!this.ready || this.stopped) return Promise.resolve();
    const docs = Object.entries(this.outbox).filter(([key, doc]) => this.inflight.get(key) !== doc.ts).map(([, doc]) => doc);
    if (!docs.length) return Promise.resolve();
    for (const doc of docs) this.inflight.set(recordKey(doc.kind, doc.id), doc.ts);
    const ok = [];
    let refused = false;
    for (const doc of docs) { const problem = invalidDoc(doc); if (problem) { this.refuse(doc, problem); refused = true; } else ok.push(doc); }
    if (refused) this.persistMeta();
    if (!ok.length) return Promise.resolve();
    const chunks = [];
    for (let i = 0; i < ok.length; i += CHUNK) chunks.push(ok.slice(i, i + CHUNK));
    let transient = false;
    const send = (chunk) => Promise.resolve().then(() => this.backend.write(chunk)).then(
      () => { this.settleSent(chunk, true); },
      (error) => {
        if (this.stopped) return undefined;
        if (!isPermanent(error)) { transient = true; this.settleSent(chunk, false); return undefined; }
        if (chunk.length === 1) { this.refuse(chunk[0], errorCode(error)); return undefined; }
        const half = Math.ceil(chunk.length / 2);
        return Promise.all([send(chunk.slice(0, half)), send(chunk.slice(half))]);
      });
    return Promise.all(chunks.map(send)).then(() => {
      if (this.stopped) return;
      this.persistMeta();
      if (transient) this.scheduleRetry(); else this.failures = 0;
    });
  }

  settleSent(chunk, ok) {
    if (this.stopped) return;
    for (const doc of chunk) {
      const key = recordKey(doc.kind, doc.id);
      if (this.inflight.get(key) === doc.ts) this.inflight.delete(key);
      if (ok && this.outbox[key] && this.outbox[key].ts === doc.ts) delete this.outbox[key];
    }
  }

  refuse(doc, code) {
    const key = recordKey(doc.kind, doc.id);
    if (this.inflight.get(key) === doc.ts) this.inflight.delete(key);
    if (this.outbox[key] && this.outbox[key].ts === doc.ts) delete this.outbox[key];
    this.failed[key] = { ts: doc.ts, code: String(code || 'unknown') };
  }

  // v1.9.46: «Έλεγχος & αποστολή όσων λείπουν». serverKeys = every 'kind:id' the server has (tombstones too).
  // Uploads only: records on this device the server lacks, plus earlier refused ones. Never deletes anything
  // and never brings back a record deleted on another device (its tombstone is on the server).
  async uploadMissing(serverKeys) {
    if (!this.ready || this.stopped) throw new Error('not-ready');
    const current = this.getState();
    const ts = this.now();
    const me = this.uid() || '';
    let missing = 0;
    for (const kind of KINDS) {
      for (const record of current?.[kind] || []) {
        if (!record || record.id === undefined || record.id === null || record.id === '') continue;
        const key = recordKey(kind, record.id);
        if (serverKeys.has(key) && !this.failed[key]) continue;
        if (this.outbox[key] && !this.failed[key]) continue; // already waiting
        missing += 1;
        delete this.failed[key];
        this.times[key] = ts;
        if (me) this.writers[key] = me;
        this.outbox[key] = JSON.parse(JSON.stringify({ kind, id: record.id, data: record, deleted: false, ts }));
      }
    }
    // Refused deletions: sent again if the server still has the record, otherwise nothing is left to do.
    for (const key of Object.keys(this.failed)) {
      const cut = key.indexOf(':');
      const kind = key.slice(0, cut);
      const id = key.slice(cut + 1);
      delete this.failed[key];
      if (this.outbox[key] || !serverKeys.has(key)) continue;
      this.times[key] = ts;
      this.outbox[key] = { kind, id, data: null, deleted: true, ts };
      missing += 1;
    }
    this.snapshot = JSON.parse(JSON.stringify(lists(current)));
    this.persistMeta();
    await this.flush();
    return { missing, pending: this.pending(), failed: this.failedCount() };
  }

  scheduleRetry() {
    if (this.stopped || this.timer !== null) return;
    const wait = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)];
    this.failures += 1;
    this.timer = this.setTimer(() => { this.timer = null; this.push(); }, wait);
  }

  pending() {
    return Object.keys(this.outbox).length;
  }

  failedCount() {
    return Object.keys(this.failed).length;
  }

  persistMeta() {
    this.store.save({ snapshot: this.snapshot, times: this.times, writers: this.writers, outbox: this.outbox, failed: this.failed });
    const counts = `${this.pending()}/${this.failedCount()}`;
    if (counts !== this.lastCounts) { this.lastCounts = counts; try { this.onCounts?.({ pending: this.pending(), failed: this.failedCount() }); } catch {} }
  }
}
