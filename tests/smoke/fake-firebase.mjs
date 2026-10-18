// In-browser fakes of the three Firebase SDK modules the app uses. The data lives in the
// Node test process (exposed as window.__fb), so several browser contexts act as separate devices.
export const fakeApp = `export function initializeApp(config) { return { config }; }`;

export const fakeAuth = `
const listeners = [];
let current = (() => { try { return JSON.parse(sessionStorage.getItem('__fakeUser') || 'null'); } catch { return null; } })();
const emit = () => { try { sessionStorage.setItem('__fakeUser', JSON.stringify(current)); } catch {} listeners.forEach((fn) => fn(current)); };
export function getAuth() { return {}; }
export function useDeviceLanguage() {}
export function onAuthStateChanged(auth, fn) { listeners.push(fn); setTimeout(() => fn(current), 0); return () => {}; }
export class GoogleAuthProvider {}
async function login(email) { current = { uid: 'uid-' + email.replace(/[^a-z0-9]/gi, ''), email, displayName: null }; emit(); return { user: current }; }
export async function signInWithEmailAndPassword(auth, email, password) {
  if (!(await window.__fb('checkUser', email, password))) { const e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e; }
  return login(email);
}
export async function createUserWithEmailAndPassword(auth, email, password) {
  if (!(await window.__fb('createUser', email, password))) { const e = new Error('exists'); e.code = 'auth/email-already-in-use'; throw e; }
  return login(email);
}
export async function signInWithPopup() { return login('google@example.com'); }
export async function signInWithRedirect() {}
export async function sendPasswordResetEmail() {}
export async function signOut() { current = null; emit(); }
`;

export const fakeFirestore = `
const UNION = Symbol('union'), REMOVE = Symbol('remove');
export function initializeFirestore() { return {}; }
export function getFirestore() { return {}; }
export function persistentLocalCache() { return {}; }
export function persistentMultipleTabManager() { return {}; }
export function serverTimestamp() { return Date.now(); }
export function arrayUnion(...values) { return { [UNION]: values }; }
export function arrayRemove(...values) { return { [REMOVE]: values }; }
const path = (base, segments) => [...(base?.path || []), ...segments];
export function collection(base, ...segments) { return { path: path(base, segments) }; }
export function doc(base, ...segments) { return { path: path(base, segments) }; }
const key = (ref) => ref.path.join('/');
function resolve(old = {}, data) {
  const out = { ...old };
  for (const [k, v] of Object.entries(data)) {
    if (v && v[UNION]) out[k] = [...(old[k] || []), ...v[UNION].filter((x) => !(old[k] || []).includes(x))];
    else if (v && v[REMOVE]) out[k] = (old[k] || []).filter((x) => !v[REMOVE].includes(x));
    else out[k] = v;
  }
  return out;
}
const snap = (ref, data) => ({ id: ref.path.at(-1), exists: () => data != null, data: () => data });
export async function getDoc(ref) { return snap(ref, await window.__fb('get', key(ref))); }
export async function setDoc(ref, data, options) {
  const old = options?.merge ? await window.__fb('get', key(ref)) : {};
  await window.__fb('set', key(ref), resolve(old || {}, data), window.__fbUser?.());
}
export async function updateDoc(ref, data) {
  const old = await window.__fb('get', key(ref));
  if (!old) { const e = new Error('missing'); e.code = 'not-found'; throw e; }
  await window.__fb('update', key(ref), resolve(old, data), resolve({}, data));
}
export function writeBatch() {
  const ops = [];
  return { set: (ref, data) => ops.push([key(ref), data]), commit: async () => { for (const [k, d] of ops) await window.__fb('set', k, d); } };
}
export function onSnapshot(ref, options, next, error) {
  const prefix = key(ref) + '/';
  let seen = new Map(), stopped = false;
  const poll = async () => {
    if (stopped) return;
    try {
      const all = await window.__fb('list', prefix);
      const changes = [];
      for (const [k, v] of Object.entries(all)) { const s = JSON.stringify(v); if (seen.get(k) !== s) { seen.set(k, s); changes.push(snap({ path: k.split('/') }, v)); } }
      const docs = Object.entries(all).map(([k, v]) => snap({ path: k.split('/') }, v));
      if (changes.length || !poll.started) { poll.started = true; next({ docs, docChanges: () => changes.map((d) => ({ type: 'modified', doc: d })), metadata: { fromCache: false } }); }
    } catch (e) { error?.(e); }
    setTimeout(poll, 200);
  };
  poll();
  return () => { stopped = true; };
}
`;

// Node-side store, with the one security rule that matters for joining checked in a simplified way.
export function createFakeBackend() {
  const docs = new Map();
  const users = new Map();
  return {
    docs,
    handle(op, k, data, extra) {
      if (op === 'createUser') { if (users.has(k)) return false; users.set(k, data); return true; }
      if (op === 'checkUser') return users.get(k) === data;
      if (op === 'get') return docs.has(k) ? structuredClone(docs.get(k)) : null;
      if (op === 'set') { docs.set(k, structuredClone(data)); return true; }
      if (op === 'update') {
        if (k.startsWith('households/') && k.split('/').length === 2 && extra?.lastJoinCode && !docs.has(`${k}/invites/${extra.lastJoinCode}`)) {
          const e = new Error('denied'); e.code = 'permission-denied'; throw e;
        }
        docs.set(k, structuredClone(data)); return true;
      }
      if (op === 'list') return Object.fromEntries([...docs].filter(([key]) => key.startsWith(k) && !key.slice(k.length).includes('/')));
      throw new Error(`unknown op ${op}`);
    }
  };
}
