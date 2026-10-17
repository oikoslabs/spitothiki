// Firebase adapter for the sync engine. Loaded only when firebase-config.js has a config.
import { SyncEngine } from './sync-core.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.0.0';
const META_KEY = 'spitothiki:sync';

export async function createFirebaseSync({ config, getState, setState, onStatus }) {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`)
  ]);
  const app = initializeApp(config);
  const authApi = auth.getAuth(app);
  auth.useDeviceLanguage(authApi);
  let db;
  try { db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
  catch { db = fs.getFirestore(app); }

  let engine = null;
  let householdId = '';
  let user = null;

  const metaStore = (hid) => ({
    load: () => { try { const saved = JSON.parse(localStorage.getItem(META_KEY) || 'null'); return saved?.householdId === hid ? saved : null; } catch { return null; } },
    save: (value) => { try { localStorage.setItem(META_KEY, JSON.stringify({ ...value, householdId: hid })); } catch {} }
  });

  function backendFor(hid) {
    const records = fs.collection(db, 'households', hid, 'records');
    return {
      subscribe(onDocs) {
        let first = true;
        return fs.onSnapshot(records, { includeMetadataChanges: false }, (snapshot) => {
          const changes = first ? snapshot.docs : snapshot.docChanges().filter((c) => c.type !== 'removed').map((c) => c.doc);
          first = false;
          onDocs(changes.map((d) => d.data()));
          onStatus({ state: 'synced', user, householdId: hid, offline: snapshot.metadata.fromCache });
        }, (error) => onStatus({ state: 'error', user, householdId: hid, message: error.code || error.message }));
      },
      async write(docs) {
        for (let i = 0; i < docs.length; i += 400) {
          const batch = fs.writeBatch(db);
          for (const doc of docs.slice(i, i + 400)) {
            batch.set(fs.doc(records, `${doc.kind}_${doc.id}`), { kind: doc.kind, id: String(doc.id), data: doc.deleted ? null : doc.data, deleted: Boolean(doc.deleted), ts: doc.ts, by: user?.uid || '' });
          }
          // Offline: Firestore queues the batch and sends it when back online.
          batch.commit().catch((error) => onStatus({ state: 'error', user, householdId: hid, message: error.code || error.message }));
        }
      }
    };
  }

  async function ensureHousehold(uid) {
    const userRef = fs.doc(db, 'users', uid);
    const userDoc = await fs.getDoc(userRef).catch(() => null);
    const saved = userDoc?.exists() ? userDoc.data().householdId : '';
    if (saved) return saved;
    const own = fs.doc(db, 'households', uid);
    const ownDoc = await fs.getDoc(own).catch(() => null);
    if (!ownDoc?.exists()) await fs.setDoc(own, { ownerUid: uid, members: [uid], createdAt: fs.serverTimestamp() });
    await fs.setDoc(userRef, { householdId: uid }, { merge: true });
    return uid;
  }

  function connect(hid) {
    engine?.stop();
    householdId = hid;
    engine = new SyncEngine({ backend: backendFor(hid), getState, setState, store: metaStore(hid) });
    engine.start();
  }

  auth.onAuthStateChanged(authApi, async (current) => {
    user = current ? { uid: current.uid, email: current.email, name: current.displayName } : null;
    if (!current) { engine?.stop(); engine = null; householdId = ''; onStatus({ state: 'signed-out' }); return; }
    onStatus({ state: 'connecting', user });
    try { connect(await ensureHousehold(current.uid)); }
    catch (error) { onStatus({ state: 'error', user, message: error.code || error.message }); }
  });

  return {
    push: () => engine?.push(),
    async signInWithGoogle() {
      const provider = new auth.GoogleAuthProvider();
      try { await auth.signInWithPopup(authApi, provider); }
      catch (error) { if (error.code === 'auth/popup-blocked') await auth.signInWithRedirect(authApi, provider); else throw error; }
    },
    signInWithEmail: (email, password) => auth.signInWithEmailAndPassword(authApi, email, password),
    signUpWithEmail: (email, password) => auth.createUserWithEmailAndPassword(authApi, email, password),
    resetPassword: (email) => auth.sendPasswordResetEmail(authApi, email),
    signOut: () => auth.signOut(authApi),
    async createInvite() {
      if (!user || !householdId) throw new Error('Συνδέσου πρώτα.');
      const code = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
      await fs.setDoc(fs.doc(db, 'households', householdId, 'invites', code), { createdBy: user.uid, createdAt: fs.serverTimestamp() });
      return `${householdId}.${code}`;
    },
    async joinHousehold(invite) {
      if (!user) throw new Error('Συνδέσου πρώτα.');
      const [hid, code] = String(invite).trim().split('.');
      if (!hid || !code) throw new Error('Ο κωδικός πρόσκλησης δεν είναι σωστός.');
      await fs.updateDoc(fs.doc(db, 'households', hid), { members: fs.arrayUnion(user.uid), lastJoinCode: code });
      await fs.setDoc(fs.doc(db, 'users', user.uid), { householdId: hid }, { merge: true });
      connect(hid);
    },
    async leaveHousehold() {
      if (!user || !householdId || householdId === user.uid) return;
      await fs.updateDoc(fs.doc(db, 'households', householdId), { members: fs.arrayRemove(user.uid) });
      await fs.setDoc(fs.doc(db, 'users', user.uid), { householdId: user.uid }, { merge: true });
      connect(await ensureHousehold(user.uid));
    }
  };
}
