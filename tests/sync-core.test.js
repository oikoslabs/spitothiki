import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine, applyRemote, diffStates } from '../src/sync-core.js';

function memoryBackend() {
  const docs = new Map();
  const listeners = new Set();
  return {
    docs,
    connect() {
      // Like Firestore: writes made offline are queued and sent when the device is back online.
      const connection = { online: true, queue: [], listener: null };
      const deliver = (batch) => { for (const doc of batch) docs.set(`${doc.kind}:${doc.id}`, doc); for (const l of listeners) if (l !== connection.listener) l(batch); };
      connection.subscribe = (onDocs) => {
        connection.listener = (batch) => { if (connection.online) onDocs(batch); };
        listeners.add(connection.listener);
        queueMicrotask(() => onDocs([...docs.values()]));
        return () => listeners.delete(connection.listener);
      };
      connection.write = async (batch) => { if (connection.online) deliver(batch); else connection.queue.push(...batch); };
      connection.setOnline = (online) => {
        connection.online = online;
        if (online) { const queued = connection.queue.splice(0); if (queued.length) deliver(queued); connection.listener([...docs.values()]); }
      };
      return connection;
    }
  };
}

function device(backend, initial, clock) {
  let state = structuredClone(initial);
  let meta = null;
  const connection = backend.connect();
  const engine = new SyncEngine({
    backend: connection, getState: () => state, setState: (next) => { state = next; },
    store: { load: () => meta, save: (value) => { meta = structuredClone(value); } }, now: () => clock.t++
  });
  return { engine, connection, get state() { return state; }, set(next) { state = next; return engine.push(); } };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('diffs added, changed and removed records', () => {
  const a = { items: [{ id: '1', name: 'Γάλα' }, { id: '2', name: 'Ψωμί' }], shopping: [] };
  const b = { items: [{ id: '1', name: 'Γάλα light' }], shopping: [{ id: 's', name: 'Φέτα' }] };
  assert.deepEqual(diffStates(a, b).map((c) => [c.kind, c.id, c.deleted]), [['items', '1', false], ['shopping', 's', false], ['items', '2', true]]);
});

test('applies only newer remote docs', () => {
  const state = { items: [{ id: '1', name: 'Παλιό' }], shopping: [] };
  const older = applyRemote(state, { 'items:1': 5 }, [{ kind: 'items', id: '1', data: { id: '1', name: 'Νέο' }, ts: 4 }]);
  assert.equal(older.changed, false);
  const newer = applyRemote(state, { 'items:1': 5 }, [{ kind: 'items', id: '1', data: { id: '1', name: 'Νέο' }, ts: 6 }, { kind: 'shopping', id: 'x', deleted: true, ts: 9 }]);
  assert.equal(newer.state.items[0].name, 'Νέο');
  assert.equal(newer.times['shopping:x'], 9);
});

test('two devices merge their local data on first sync and then stay in sync', async () => {
  const backend = memoryBackend();
  const clock = { t: 1000 };
  const phone = device(backend, { items: [{ id: 'a', name: 'Γάλα', quantity: 1 }], shopping: [] }, clock);
  const laptop = device(backend, { items: [{ id: 'b', name: 'Ρύζι', quantity: 2 }], shopping: [{ id: 's', name: 'Φέτα' }] }, clock);
  phone.engine.start(); await tick(); await tick();
  laptop.engine.start(); await tick(); await tick();
  assert.deepEqual(laptop.state.items.map((i) => i.id).sort(), ['a', 'b']);
  assert.deepEqual(phone.state.items.map((i) => i.id).sort(), ['a', 'b']);
  assert.equal(phone.state.shopping.length, 1);

  await phone.set({ ...phone.state, items: phone.state.items.map((i) => i.id === 'b' ? { ...i, quantity: 5 } : i) });
  await tick();
  assert.equal(laptop.state.items.find((i) => i.id === 'b').quantity, 5);

  await laptop.set({ ...laptop.state, shopping: [] });
  await tick();
  assert.equal(phone.state.shopping.length, 0);
  assert.equal(backend.docs.get('shopping:s').deleted, true);
});

test('offline edits on both devices resolve by last writer per record', async () => {
  const backend = memoryBackend();
  const clock = { t: 1 };
  const a = device(backend, { items: [{ id: 'x', name: 'Γάλα', quantity: 1 }], shopping: [] }, clock);
  a.engine.start(); await tick(); await tick();
  const b = device(backend, { items: [], shopping: [] }, clock);
  b.engine.start(); await tick(); await tick();
  a.connection.setOnline(false); b.connection.setOnline(false);
  await a.set({ ...a.state, items: [{ id: 'x', name: 'Γάλα', quantity: 2 }] });
  await b.set({ ...b.state, items: [{ id: 'x', name: 'Γάλα', quantity: 9 }], shopping: [{ id: 'n', name: 'Νερό' }] });
  a.connection.setOnline(true); await tick();
  b.connection.setOnline(true); await tick();
  assert.equal(a.state.items[0].quantity, 9);
  assert.equal(b.state.items[0].quantity, 9);
  assert.equal(a.state.shopping[0].name, 'Νερό');
});

test('edits made while sync was off are uploaded on the next start', async () => {
  const backend = memoryBackend();
  const clock = { t: 1 };
  const a = device(backend, { items: [{ id: 'x', name: 'Γάλα', quantity: 1 }], shopping: [] }, clock);
  a.engine.start(); await tick(); await tick();
  a.engine.stop();
  await a.set({ ...a.state, items: [{ id: 'x', name: 'Γάλα', quantity: 4 }] });
  a.engine.start(); await tick(); await tick();
  assert.equal(backend.docs.get('items:x').data.quantity, 4);
  assert.equal(a.state.items[0].quantity, 4);
});

test('new record kinds sync between devices', async () => {
  const { applyRemote, diffStates } = await import('../src/sync-core.js');
  const changes = diffStates({ items: [], shopping: [] }, { items: [], shopping: [], recurring: [{ id: 'r1', name: 'Γάλα' }], waste: [{ id: 'w1' }] });
  assert.deepEqual(changes.map((c) => c.kind).sort(), ['recurring', 'waste']);
  const result = applyRemote({ items: [], shopping: [] }, {}, changes.map((c) => ({ ...c, ts: 5 })));
  assert.deepEqual(result.state.recurring, [{ id: 'r1', name: 'Γάλα' }]);
  assert.deepEqual(result.state.waste, [{ id: 'w1' }]);
});

test('v1.5.6: a manual toll entry syncs to the household and survives a later change on the other device', async () => {
  const backend = memoryBackend(); const clock = { t: 1 };
  const a = device(backend, { items: [], shopping: [], transport: [] }, clock);
  const b = device(backend, { items: [], shopping: [], transport: [] }, clock);
  a.engine.start(); b.engine.start(); await new Promise((r) => setTimeout(r, 5));
  const toll = { id: 'tr-demo', type: 'tolls', amount: 2.55, date: '2026-10-22', note: 'Αττική Οδός', createdAt: 'x', updatedAt: 'x' };
  await a.set({ ...a.state, transport: [toll] }); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(b.state.transport.map((e) => e.id), ['tr-demo']);
  await b.set({ ...b.state, shopping: [{ id: 's1', name: 'Γάλα', checked: false }] }); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(a.state.transport.map((e) => e.id), ['tr-demo']);
  assert.deepEqual(b.state.transport.map((e) => e.id), ['tr-demo']);
});

// v1.9.45: outbox — a change counts as uploaded only after the server confirms it.
function manualBackend(serverDocs = []) {
  const server = new Map(serverDocs.map((d) => [`${d.kind}:${d.id}`, d]));
  const backend = {
    server, writes: [], mode: 'ok', hanging: [], listener: null,
    subscribe(onDocs) { backend.listener = onDocs; return () => { backend.listener = null; }; },
    write(docs) {
      backend.writes.push(docs.map((d) => `${d.kind}:${d.id}`));
      if (backend.mode === 'fail') return Promise.reject(new Error('unavailable'));
      const apply = () => { for (const d of docs) server.set(`${d.kind}:${d.id}`, structuredClone(d)); };
      if (backend.mode === 'hang') return new Promise((resolve) => backend.hanging.push(() => { apply(); resolve(); }));
      apply(); return Promise.resolve();
    },
    serverDocs: () => [...server.values()]
  };
  return backend;
}

function engineOn(backend, initial, { meta = null, clock = { t: 100 } } = {}) {
  let state = structuredClone(initial);
  const box = { meta: structuredClone(meta) };
  const timers = [];
  const engine = new SyncEngine({
    backend, getState: () => state, setState: (next) => { state = next; },
    store: { load: () => box.meta, save: (value) => { box.meta = structuredClone(value); } },
    now: () => clock.t++, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}
  });
  return { engine, box, timers, get state() { return state; }, set(next) { state = next; return engine.push(); } };
}

test('v1.9.45: a failed upload stays pending and the retry uploads it', async () => {
  const backend = manualBackend();
  const d = engineOn(backend, { items: [], shopping: [], transport: [] });
  d.engine.start(); await d.engine.receive([], { fromCache: false });
  backend.mode = 'fail';
  await d.set({ ...d.state, transport: [{ id: 'taxi1', type: 'taxi', amount: 9 }] });
  assert.equal(backend.server.has('transport:taxi1'), false);
  assert.equal(d.engine.pending(), 1);
  assert.ok(d.box.meta.outbox['transport:taxi1'], 'kept in the saved outbox');
  assert.equal(d.timers.length, 1, 'a retry is scheduled');
  backend.mode = 'ok';
  await d.engine.retry();
  assert.equal(backend.server.get('transport:taxi1').data.amount, 9);
  assert.equal(d.engine.pending(), 0);
});

test('v1.9.45: an upload that never arrived is sent again on the next start', async () => {
  const backend = manualBackend();
  const d = engineOn(backend, { items: [], shopping: [], transport: [] });
  d.engine.start(); await d.engine.receive([], { fromCache: false });
  backend.mode = 'fail';
  await d.set({ ...d.state, transport: [{ id: 'taxi2', type: 'taxi', amount: 7.5 }] });
  d.engine.stop();
  backend.mode = 'ok';
  const again = engineOn(backend, d.state, { meta: d.box.meta });
  again.engine.start(); await again.engine.receive(backend.serverDocs(), { fromCache: false });
  assert.equal(backend.server.get('transport:taxi2').data.amount, 7.5);
  assert.equal(again.engine.pending(), 0);
});

test('v1.9.45: first sync re-sends records the server is missing (lost by an older version)', async () => {
  const backend = manualBackend([{ kind: 'transport', id: 'ok', data: { id: 'ok', amount: 3 }, deleted: false, ts: 5 }]);
  const lost = { id: 'lost', type: 'taxi', amount: 9 };
  const state = { items: [], shopping: [], transport: [{ id: 'ok', amount: 3 }, lost] };
  // Old meta: the snapshot claims «lost» was synced, but it never reached the server.
  const meta = { snapshot: structuredClone(state), times: { 'transport:ok': 5, 'transport:lost': 6 } };
  const d = engineOn(backend, state, { meta });
  d.engine.start(); await d.engine.receive(backend.serverDocs(), { fromCache: false });
  assert.equal(backend.server.get('transport:lost').data.amount, 9);
  assert.deepEqual(backend.writes, [['transport:lost']], 'only the missing record is sent');
});

test('v1.9.45: when the first data comes from the cache, missing records wait for the server answer', async () => {
  const backend = manualBackend();
  const lost = { id: 'lost', amount: 9 };
  const state = { items: [], shopping: [], transport: [lost] };
  const d = engineOn(backend, state, { meta: { snapshot: structuredClone(state), times: { 'transport:lost': 6 } } });
  d.engine.start(); await d.engine.receive([], { fromCache: true });
  assert.deepEqual(backend.writes, [], 'nothing is sent on cache data');
  await d.engine.receive([], { fromCache: false, serverKeys: new Set() });
  assert.deepEqual(backend.writes, [['transport:lost']]);
  await d.engine.receive([], { fromCache: false, serverKeys: new Set() });
  assert.equal(backend.writes.length, 1, 'checked once');
});

test('v1.9.45: no duplicate sends while an upload is on its way', async () => {
  const backend = manualBackend();
  const d = engineOn(backend, { items: [], shopping: [], transport: [] });
  d.engine.start(); await d.engine.receive([], { fromCache: false });
  backend.mode = 'hang';
  const first = d.set({ ...d.state, transport: [{ id: 'a', amount: 1 }] });
  await d.engine.push(); await d.engine.retry(); await d.engine.push();
  assert.deepEqual(backend.writes, [['transport:a']]);
  const second = d.set({ ...d.state, transport: [{ id: 'b', amount: 2 }, ...d.state.transport] });
  await tick();
  assert.deepEqual(backend.writes, [['transport:a'], ['transport:b']], 'only the new change is sent');
  for (const release of backend.hanging.splice(0)) release();
  await first; await second;
  assert.equal(d.engine.pending(), 0);
  await d.engine.push();
  assert.equal(backend.writes.length, 2);
});

test('v1.9.45: an echo of a local write that the server has not confirmed does not clear the outbox', async () => {
  const backend = manualBackend();
  const d = engineOn(backend, { items: [], shopping: [], transport: [] });
  d.engine.start(); await d.engine.receive([], { fromCache: false });
  backend.mode = 'fail';
  await d.set({ ...d.state, transport: [{ id: 'a', amount: 1 }] });
  const ts = d.box.meta.outbox['transport:a'].ts;
  await d.engine.receive([{ kind: 'transport', id: 'a', data: { id: 'a', amount: 1 }, deleted: false, ts, pendingWrite: true }], { fromCache: true });
  assert.equal(d.engine.pending(), 1);
  await d.engine.receive([{ kind: 'transport', id: 'a', data: { id: 'a', amount: 1 }, deleted: false, ts }], { fromCache: false });
  assert.equal(d.engine.pending(), 0, 'the server copy confirms it');
});

test('v1.9.45: a record deleted on another device is not brought back', async () => {
  const backend = manualBackend([{ kind: 'transport', id: 'x', data: null, deleted: true, ts: 50 }]);
  const state = { items: [], shopping: [], transport: [{ id: 'x', amount: 4 }] };
  const d = engineOn(backend, state, { meta: { snapshot: structuredClone(state), times: { 'transport:x': 10 } } });
  d.engine.start(); await d.engine.receive(backend.serverDocs(), { fromCache: false });
  assert.deepEqual(d.state.transport, []);
  assert.equal(backend.server.get('transport:x').deleted, true);
  assert.deepEqual(backend.writes, []);
});

test('v1.9.45: a failed deletion is retried and reaches the server', async () => {
  const backend = manualBackend([{ kind: 'transport', id: 'x', data: { id: 'x', amount: 4 }, deleted: false, ts: 5 }]);
  const d = engineOn(backend, { items: [], shopping: [], transport: [] });
  d.engine.start(); await d.engine.receive(backend.serverDocs(), { fromCache: false });
  backend.mode = 'fail';
  await d.set({ ...d.state, transport: [] });
  assert.equal(backend.server.get('transport:x').deleted, false);
  backend.mode = 'ok';
  await d.timers.pop()();
  await tick();
  assert.equal(backend.server.get('transport:x').deleted, true);
  assert.equal(d.engine.pending(), 0);
});
