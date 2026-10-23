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
