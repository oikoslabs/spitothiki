// v1.9.4: «Διαγραφή λογαριασμού» (in-app account deletion). Firestore part, with the Firestore module (`fs`)
// passed in so it runs with the real SDK in the app and in the emulator rules tests (tests/rules/).
// What it does, in the order the security rules allow:
//  1. If the user is in someone else's household, they leave it (their shared data stays with that household).
//  2. Their own household (id = uid): if other members are in it, ownership goes to the first other member and
//     the user is removed (the shared data stays for them). If they are alone, its records, invites and the
//     household doc are deleted.
//  3. Their users/{uid} doc is deleted. The caller then deletes the Firebase Auth user and the local data.
export const DELETE_WORD = { el: 'ΔΙΑΓΡΑΦΗ', en: 'DELETE' };
export const RECENT_LOGIN_MS = 4 * 60 * 1000; // Firebase asks for a fresh sign-in ~5 minutes after login.

export function confirmWordOk(typed) {
  const v = String(typed || '').trim().toLocaleUpperCase('el-GR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return v === DELETE_WORD.el || v === DELETE_WORD.en;
}
export function recentLogin(lastSignInTime, now = Date.now()) {
  const t = Date.parse(lastSignInTime || '');
  return Number.isFinite(t) && now - t < RECENT_LOGIN_MS;
}
export function planOwnHousehold(data, uid) {
  if (!data) return { action: 'none' };
  const others = (Array.isArray(data.members) ? data.members : []).filter((m) => typeof m === 'string' && m !== uid);
  return others.length ? { action: 'handover', newOwner: others[0], members: others } : { action: 'delete' };
}

async function deleteAll(fs, db, path) {
  const snap = await fs.getDocs(fs.collection(db, ...path));
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = fs.writeBatch(db);
    for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
  return snap.docs.length;
}

export async function deleteAccountData(fs, db, uid, currentHid = '') {
  const result = { leftHousehold: false, handedOverTo: '', deletedHousehold: false, deletedDocs: 0 };
  if (currentHid && currentHid !== uid) {
    const ref = fs.doc(db, 'households', currentHid);
    const snap = await fs.getDoc(ref).catch(() => null);
    if (snap?.exists() && (snap.data().members || []).includes(uid)) { await fs.updateDoc(ref, { members: fs.arrayRemove(uid) }); result.leftHousehold = true; }
  }
  const own = fs.doc(db, 'households', uid);
  const ownSnap = await fs.getDoc(own);
  const plan = planOwnHousehold(ownSnap.exists() ? ownSnap.data() : null, uid);
  if (plan.action === 'handover') {
    await fs.updateDoc(own, { ownerUid: plan.newOwner, members: plan.members });
    result.handedOverTo = plan.newOwner;
  } else if (plan.action === 'delete') {
    result.deletedDocs += await deleteAll(fs, db, ['households', uid, 'records']);
    result.deletedDocs += await deleteAll(fs, db, ['households', uid, 'invites']);
    await fs.deleteDoc(own);
    result.deletedHousehold = true;
  }
  await fs.deleteDoc(fs.doc(db, 'users', uid));
  return result;
}
