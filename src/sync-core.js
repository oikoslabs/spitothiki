// Backend-independent sync engine: keeps localStorage as the source of truth for the UI and
// exchanges per-record changes with a backend (Firestore in production, in-memory in tests).
// Conflict rule: last writer wins per record, by the client timestamp `ts`.
// Deletions are kept as tombstones (`deleted: true`) so they reach other devices.

const KINDS = ['items', 'shopping'];

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
  const next = { items: [...(state.items || [])], shopping: [...(state.shopping || [])] };
  const nextTimes = { ...times };
  let changed = false;
  for (const doc of docs) {
    if (!KINDS.includes(doc.kind) || !doc.id) continue;
    const key = recordKey(doc.kind, doc.id);
    if (Number(doc.ts) <= Number(nextTimes[key] || 0)) continue;
    nextTimes[key] = Number(doc.ts);
    const list = next[doc.kind];
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

// backend: { subscribe(onDocs) -> unsubscribe, write(docs) -> Promise }
// store: { load() -> { snapshot, times } | null, save({ snapshot, times }) }
export class SyncEngine {
  constructor({ backend, getState, setState, store, now = () => Date.now() }) {
    Object.assign(this, { backend, getState, setState, store, now });
    const saved = store.load() || {};
    this.times = saved.times || {};
    this.snapshot = saved.snapshot || null;
    this.ready = false;
    this.unsubscribe = null;
  }

  start() {
    this.unsubscribe = this.backend.subscribe((docs) => this.receive(docs));
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.ready = false;
  }

  receive(docs) {
    const firstSync = !this.ready;
    const result = applyRemote(this.getState(), this.times, docs);
    this.times = result.times;
    if (firstSync) {
      // First contact with this household: records only on this device get uploaded,
      // records on the server take precedence unless this device changed them later.
      // Baseline = what the server has (or, for records the server doesn't know, the last synced copy).
      // Anything on this device that differs from the baseline is uploaded by push() below.
      const remote = new Map(docs.map((doc) => [recordKey(doc.kind, doc.id), doc]));
      const base = this.snapshot || { items: [], shopping: [] };
      const baseline = { items: [], shopping: [] };
      for (const kind of KINDS) {
        for (const record of result.state[kind]) {
          const doc = remote.get(recordKey(kind, record.id));
          if (doc) { if (!doc.deleted && doc.data) baseline[kind].push({ ...doc.data, id: doc.id }); }
          else { const old = base[kind].find((b) => b.id === record.id); if (old) baseline[kind].push(old); }
        }
      }
      this.snapshot = baseline;
      this.ready = true;
    } else {
      // Remote changes become part of the synced baseline so they aren't echoed back.
      const merged = applyRemote(this.snapshot || { items: [], shopping: [] }, {}, docs.map((doc) => ({ ...doc, ts: 1 })));
      this.snapshot = merged.state;
    }
    if (result.changed) this.setState(result.state);
    this.persistMeta();
    if (firstSync) return this.push();
    return Promise.resolve();
  }

  // Call after every local save.
  push() {
    if (!this.ready) return Promise.resolve();
    const current = this.getState();
    const changes = diffStates(this.snapshot, current);
    if (!changes.length) return Promise.resolve();
    const ts = this.now();
    const docs = changes.map((change) => ({ ...change, ts }));
    for (const doc of docs) this.times[recordKey(doc.kind, doc.id)] = ts;
    this.snapshot = JSON.parse(JSON.stringify({ items: current.items, shopping: current.shopping }));
    this.persistMeta();
    return this.backend.write(docs);
  }

  persistMeta() {
    this.store.save({ snapshot: this.snapshot, times: this.times });
  }
}
