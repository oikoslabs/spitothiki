// Firebase adapter for the sync engine. Loaded only when firebase-config.js has a config.
import { SyncEngine } from './sync-core.js';
import { deleteAccountData, recentLogin } from './account-delete.js';
import { assertNotDisposableEmail } from './disposable-email.js';
import { marketingFields, normalizeMarketingOptIn, shouldApplySignupMarketing } from './marketing-consent.js';

// v1.9.4: self-hosted Firebase JS SDK 13.0.0 (vendor/, imports rewritten to relative paths).
const SDK = new URL('../vendor/firebase-13.0.0', import.meta.url).href;
const META_KEY = 'spitothiki:sync';
const PENDING_MARKETING_KEY = 'spitothiki:pending-marketing';

export async function createFirebaseSync({ config, getState, setState, onStatus, onNewHousehold, onRemote }) {
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
  let members = []; // v1.7.0: uids of the household (read-only, for «Ποιος πλήρωσε τι»)
  let marketingOptIn = false;
  let stopMembers = null;
  let stopUser = null;
  let lastStatus = {};
  let pendingMarketing = null; // { optIn, source } — only applied when isNewUser
  let marketingCommitDone = false;
  const report = (status) => { lastStatus = status; onStatus(status); };

  const metaStore = (hid) => ({
    load: () => { try { const saved = JSON.parse(localStorage.getItem(META_KEY) || 'null'); return saved?.householdId === hid ? saved : null; } catch { return null; } },
    save: (value) => { try { localStorage.setItem(META_KEY, JSON.stringify({ ...value, householdId: hid })); } catch {} }
  });

  function rememberPending(optIn, source) {
    pendingMarketing = { optIn: Boolean(optIn), source: String(source || 'signup') };
    marketingCommitDone = false;
    try { sessionStorage.setItem(PENDING_MARKETING_KEY, JSON.stringify(pendingMarketing)); } catch {}
  }
  function clearPending() {
    pendingMarketing = null;
    try { sessionStorage.removeItem(PENDING_MARKETING_KEY); } catch {}
  }
  function loadPendingFromSession() {
    if (pendingMarketing) return pendingMarketing;
    try {
      const raw = sessionStorage.getItem(PENDING_MARKETING_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.optIn === 'boolean') pendingMarketing = parsed;
    } catch {}
    return pendingMarketing;
  }

  function marketingPayload(optIn, source) {
    const base = marketingFields({ optIn, source });
    const out = {
      marketingOptIn: base.marketingOptIn,
      marketingConsentVersion: base.marketingConsentVersion,
      marketingConsentSource: base.marketingConsentSource
    };
    if (base.setOptInAt) {
      out.marketingOptInAt = fs.serverTimestamp();
      out.marketingOptOutAt = null;
    } else if (base.setOptOutAt) {
      // Keep the original opt-in timestamp; only record withdrawal time.
      out.marketingOptOutAt = fs.serverTimestamp();
    } else {
      // Signup with checkbox left unchecked: store false without inventing timestamps.
      out.marketingOptInAt = null;
      out.marketingOptOutAt = null;
    }
    return out;
  }

  async function writeMarketing(uid, optIn, source) {
    const hid = householdId || uid;
    await fs.setDoc(fs.doc(db, 'users', uid), { householdId: hid, ...marketingPayload(optIn, source) }, { merge: true });
    marketingOptIn = Boolean(optIn);
  }

  /** Apply the signup checkbox only for brand-new accounts; never overwrite on login. */
  async function commitSignupMarketing(cred) {
    loadPendingFromSession();
    if (marketingCommitDone) { clearPending(); return; }
    const isNewUser = cred?.additionalUserInfo?.isNewUser === true;
    if (!shouldApplySignupMarketing({ isNewUser, pending: pendingMarketing })) {
      clearPending();
      return;
    }
    const { optIn, source } = pendingMarketing;
    clearPending();
    marketingCommitDone = true;
    const uid = cred.user?.uid;
    if (!uid) return;
    try { await writeMarketing(uid, optIn, source); }
    catch (error) { report({ state: 'error', user, householdId, members, marketingOptIn, message: error.code || error.message }); }
  }

  function watchUser(uid) {
    stopUser?.();
    stopUser = fs.onSnapshot(fs.doc(db, 'users', uid), (snap) => {
      const next = normalizeMarketingOptIn(snap.data());
      if (next === marketingOptIn && lastStatus.user?.uid === uid) return;
      marketingOptIn = next;
      if (lastStatus.user?.uid === uid) report({ ...lastStatus, marketingOptIn });
    }, () => {});
  }

  function backendFor(hid) {
    const records = fs.collection(db, 'households', hid, 'records');
    return {
      subscribe(onDocs) {
        let first = true;
        return fs.onSnapshot(records, { includeMetadataChanges: false }, (snapshot) => {
          const changes = first ? snapshot.docs : snapshot.docChanges().filter((c) => c.type !== 'removed').map((c) => c.doc);
          first = false;
          onDocs(changes.map((d) => d.data()));
          report({ state: 'synced', user, householdId: hid, members, marketingOptIn, offline: snapshot.metadata.fromCache });
        }, (error) => report({ state: 'error', user, householdId: hid, members, marketingOptIn, message: error.code || error.message }));
      },
      async write(docs) {
        for (let i = 0; i < docs.length; i += 400) {
          const batch = fs.writeBatch(db);
          for (const doc of docs.slice(i, i + 400)) {
            batch.set(fs.doc(records, `${doc.kind}_${doc.id}`), { kind: doc.kind, id: String(doc.id), data: doc.deleted ? null : doc.data, deleted: Boolean(doc.deleted), ts: doc.ts, by: user?.uid || '' });
          }
          // Offline: Firestore queues the batch and sends it when back online.
          batch.commit().catch((error) => report({ state: 'error', user, householdId: hid, members, marketingOptIn, message: error.code || error.message }));
        }
      }
    };
  }

  async function ensureHousehold(uid) {
    const userRef = fs.doc(db, 'users', uid);
    const userDoc = await fs.getDoc(userRef).catch(() => null);
    const saved = userDoc?.exists() ? userDoc.data().householdId : '';
    if (userDoc?.exists()) marketingOptIn = normalizeMarketingOptIn(userDoc.data());
    if (saved) return saved;
    const own = fs.doc(db, 'households', uid);
    const ownDoc = await fs.getDoc(own).catch(() => null);
    if (!ownDoc?.exists()) {
      await fs.setDoc(own, { ownerUid: uid, members: [uid], createdAt: fs.serverTimestamp() });
      try { onNewHousehold?.(); } catch {} // v1.8.2: anonymous «new account» count (source word only)
    }
    // merge: true so a concurrent marketing write is not wiped
    await fs.setDoc(userRef, { householdId: uid }, { merge: true });
    return uid;
  }

  function connect(hid) {
    engine?.stop();
    householdId = hid;
    engine = new SyncEngine({ backend: backendFor(hid), getState, setState, store: metaStore(hid), uid: () => user?.uid || '',
      onRemote: onRemote ? (docs, before) => onRemote(docs, before, user?.uid || '') : null });
    engine.start();
    // v1.7.0: household members (read only; a failure just hides «Ποιος πλήρωσε τι»).
    stopMembers?.(); members = [];
    try {
      stopMembers = fs.onSnapshot(fs.doc(db, 'households', hid), (doc) => {
        const list = Array.isArray(doc.data()?.members) ? doc.data().members.filter((m) => typeof m === 'string') : [];
        if (list.join() === members.join()) return;
        members = list;
        if (lastStatus.householdId === hid) report({ ...lastStatus, members, marketingOptIn });
      }, () => {});
    } catch { stopMembers = null; }
  }

  auth.onAuthStateChanged(authApi, async (current) => {
    user = current ? { uid: current.uid, email: current.email, name: current.displayName } : null;
    if (!current) {
      engine?.stop(); engine = null; householdId = ''; stopMembers?.(); stopMembers = null; members = [];
      stopUser?.(); stopUser = null; marketingOptIn = false; marketingCommitDone = false;
      report({ state: 'signed-out' }); return;
    }
    report({ state: 'connecting', user, marketingOptIn });
    try {
      connect(await ensureHousehold(current.uid));
      watchUser(current.uid);
      report({ ...lastStatus, state: lastStatus.state === 'synced' ? 'synced' : 'connecting', user, householdId, members, marketingOptIn });
    }
    catch (error) { report({ state: 'error', user, marketingOptIn, message: error.code || error.message }); }
  });

  // Google redirect: checkbox choice was stashed in sessionStorage before leaving the page.
  auth.getRedirectResult(authApi).then((cred) => { if (cred?.user) commitSignupMarketing(cred); }).catch(() => {});

  return {
    push: () => engine?.push(),
    writers: () => engine?.writers || {},
    async signInWithGoogle({ marketingOptIn: optIn = false } = {}) {
      rememberPending(optIn, 'google-signup');
      const provider = new auth.GoogleAuthProvider();
      try {
        const result = await auth.signInWithPopup(authApi, provider);
        await commitSignupMarketing(result);
        return result;
      } catch (error) {
        if (error.code === 'auth/popup-blocked') {
          // Keep sessionStorage pending for getRedirectResult after return.
          await auth.signInWithRedirect(authApi, provider);
          return;
        }
        clearPending();
        throw error;
      }
    },
    signInWithEmail: (email, password) => {
      // Login must never apply the (default-unchecked) checkbox to an existing profile.
      clearPending();
      return auth.signInWithEmailAndPassword(authApi, email, password);
    },
    async signUpWithEmail(email, password, { marketingOptIn: optIn = false } = {}) {
      assertNotDisposableEmail(email);
      rememberPending(optIn, 'email-signup');
      try {
        const result = await auth.createUserWithEmailAndPassword(authApi, email, password);
        await commitSignupMarketing(result);
        return result;
      } catch (error) {
        clearPending();
        throw error;
      }
    },
    resetPassword: (email) => auth.sendPasswordResetEmail(authApi, email),
    signOut: () => auth.signOut(authApi),
    async setMarketingOptIn(optIn) {
      if (!user) throw new Error('Συνδέσου πρώτα.');
      await writeMarketing(user.uid, Boolean(optIn), 'settings');
      marketingOptIn = Boolean(optIn);
      if (lastStatus.user) report({ ...lastStatus, marketingOptIn });
    },
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
    // v1.9.4: delete the account (Firestore data as the rules allow, then the Firebase Auth user).
    async deleteAccount() {
      const current = authApi.currentUser;
      if (!current) throw new Error('Συνδέσου πρώτα.');
      if (!recentLogin(current.metadata?.lastSignInTime)) { const e = new Error('auth/requires-recent-login'); e.code = 'auth/requires-recent-login'; throw e; }
      engine?.stop(); engine = null; stopMembers?.(); stopMembers = null; stopUser?.(); stopUser = null;
      const result = await deleteAccountData(fs, db, current.uid, householdId);
      await auth.deleteUser(current);
      try { localStorage.removeItem(META_KEY); } catch {}
      try { sessionStorage.removeItem(PENDING_MARKETING_KEY); } catch {}
      try { await fs.terminate(db); await fs.clearIndexedDbPersistence(db); } catch {}
      return result;
    },
    async leaveHousehold() {
      if (!user || !householdId || householdId === user.uid) return;
      await fs.updateDoc(fs.doc(db, 'households', householdId), { members: fs.arrayRemove(user.uid) });
      await fs.setDoc(fs.doc(db, 'users', user.uid), { householdId: user.uid }, { merge: true });
      connect(await ensureHousehold(user.uid));
    }
  };
}
