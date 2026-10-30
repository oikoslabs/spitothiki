// Firestore security rules tests against the emulator: an attacker account vs. a victim household.
// Run: npx firebase emulators:exec --only firestore --config firebase.emu.json --project demo-spitothiki "node --test tests/rules/firestore-rules.emu.mjs"
// (needs Java and `npm i --no-save @firebase/rules-unit-testing firebase`). Not part of `npm test`.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where, arrayUnion, arrayRemove, serverTimestamp, Timestamp } from 'firebase/firestore';

let env;
const V = 'victim', A = 'attacker', M = 'member';
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-spitothiki', firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
});
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'households', V), { ownerUid: V, members: [V] });
    await setDoc(doc(db, 'households', V, 'records', 'r1'), { kind: 'items', id: 'r1', data: { name: 'x' }, deleted: false, ts: 1, by: V });
    await setDoc(doc(db, 'households', V, 'invites', 'goodcode1'), { createdBy: V, createdAt: Timestamp.now() });
    await setDoc(doc(db, 'households', V, 'invites', 'oldcode01'), { createdBy: V, createdAt: Timestamp.fromMillis(Date.now() - 8 * 86400000) });
    await setDoc(doc(db, 'users', V), { householdId: V });
    await setDoc(doc(db, 'households', A), { ownerUid: A, members: [A] });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

test('signed-out visitor cannot read anything', async () => {
  await assertFails(getDoc(doc(anon(), 'households', V)));
  await assertFails(getDoc(doc(anon(), 'households', V, 'records', 'r1')));
  await assertFails(getDocs(collection(anon(), 'households')));
});
test('attacker cannot read the victim household, its records, invites or user doc', async () => {
  const db = as(A);
  await assertFails(getDoc(doc(db, 'households', V)));
  await assertFails(getDoc(doc(db, 'households', V, 'records', 'r1')));
  await assertFails(getDocs(collection(db, 'households', V, 'records')));
  await assertFails(getDoc(doc(db, 'households', V, 'invites', 'goodcode1')));
  await assertFails(getDocs(collection(db, 'households', V, 'invites')));
  await assertFails(getDoc(doc(db, 'users', V)));
});
test('attacker cannot list households or query across all records', async () => {
  const db = as(A);
  await assertFails(getDocs(collection(db, 'households')));
  await assertFails(getDocs(query(collection(db, 'households'), where('members', 'array-contains', V))));
  await assertFails(getDocs(collectionGroup(db, 'records')));
  await assertFails(getDocs(collectionGroup(db, 'invites')));
  await assertFails(getDocs(collection(db, 'users')));
});
test('attacker cannot write or delete victim data', async () => {
  const db = as(A);
  await assertFails(setDoc(doc(db, 'households', V, 'records', 'r2'), { kind: 'items', id: 'r2', data: {}, deleted: false, ts: 1, by: A }));
  await assertFails(updateDoc(doc(db, 'households', V, 'records', 'r1'), { deleted: true, by: A }));
  await assertFails(deleteDoc(doc(db, 'households', V, 'records', 'r1')));
  await assertFails(deleteDoc(doc(db, 'households', V)));
  await assertFails(setDoc(doc(db, 'households', V), { ownerUid: A, members: [A] }));
  await assertFails(setDoc(doc(db, 'users', V), { householdId: A }));
  await assertFails(setDoc(doc(db, 'households', V, 'invites', 'mine00001'), { createdBy: A, createdAt: serverTimestamp() }));
});
test('attacker cannot create a household under someone else\'s id or with extra members', async () => {
  const db = as(A);
  await assertFails(setDoc(doc(db, 'households', 'someoneelse'), { ownerUid: A, members: [A] }));
  await env.withSecurityRulesDisabled((ctx) => deleteDoc(doc(ctx.firestore(), 'households', A)));
  await assertFails(setDoc(doc(db, 'households', A), { ownerUid: A, members: [A, V] }));
  await assertSucceeds(setDoc(doc(db, 'households', A), { ownerUid: A, members: [A] }));
});
test('joining without an invite, with a guessed or expired code, fails', async () => {
  const db = as(A);
  await assertFails(updateDoc(doc(db, 'households', V), { members: arrayUnion(A) }));
  await assertFails(updateDoc(doc(db, 'households', V), { members: arrayUnion(A), lastJoinCode: 'guess0001' }));
  await assertFails(updateDoc(doc(db, 'households', V), { members: arrayUnion(A), lastJoinCode: 'oldcode01' }));
});
test('joining with a valid invite cannot also change owner, other fields or add extra people', async () => {
  const db = as(A);
  await assertFails(updateDoc(doc(db, 'households', V), { members: arrayUnion(A), lastJoinCode: 'goodcode1', ownerUid: A }));
  await assertFails(updateDoc(doc(db, 'households', V), { members: arrayUnion(A, 'friend'), lastJoinCode: 'goodcode1' }));
  await assertFails(updateDoc(doc(db, 'households', V), { members: [A], lastJoinCode: 'goodcode1' }));
  await assertFails(updateDoc(doc(db, 'households', V), { members: arrayUnion(A), lastJoinCode: 'goodcode1', name: 'pwned' }));
});
test('valid invite works (expected), then the new member cannot escalate', async () => {
  const db = as(M);
  await assertSucceeds(updateDoc(doc(db, 'households', V), { members: arrayUnion(M), lastJoinCode: 'goodcode1' }));
  await assertSucceeds(getDoc(doc(db, 'households', V, 'records', 'r1')));
  await assertFails(updateDoc(doc(db, 'households', V), { ownerUid: M }));
  await assertFails(updateDoc(doc(db, 'households', V), { members: arrayRemove(V) }));
  await assertFails(updateDoc(doc(db, 'households', V), { members: arrayUnion(A) }));
  await assertFails(deleteDoc(doc(db, 'households', V)));
  await assertFails(setDoc(doc(db, 'households', V, 'records', 'r3'), { kind: 'items', id: 'r3', data: {}, deleted: false, ts: 1, by: V }));
  await assertFails(setDoc(doc(db, 'households', V, 'records', 'r3'), { kind: 'items', id: 'r3', data: {}, deleted: false, ts: 1, by: M, extra: 1 }));
  await assertFails(setDoc(doc(db, 'households', V, 'invites', 'fake00001'), { createdBy: M, createdAt: Timestamp.fromMillis(Date.now()) }));
  // Leaving works; after leaving, no more access.
  await assertSucceeds(updateDoc(doc(db, 'households', V), { members: arrayRemove(M) }));
  await assertFails(getDoc(doc(db, 'households', V, 'records', 'r1')));
});
test('owner can remove a member; removed member loses access', async () => {
  await assertSucceeds(updateDoc(doc(as(M), 'households', V), { members: arrayUnion(M), lastJoinCode: 'goodcode1' }));
  await assertSucceeds(updateDoc(doc(as(V), 'households', V), { members: arrayRemove(M) }));
  await assertFails(getDoc(doc(as(M), 'households', V)));
  await assertFails(updateDoc(doc(as(V), 'households', V), { ownerUid: M }));
});
test('a household is capped at 20 members', async () => {
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'households', V), { members: [V, ...Array.from({ length: 19 }, (_, i) => `u${i}`)] }));
  await assertFails(updateDoc(doc(as(M), 'households', V), { members: arrayUnion(M), lastJoinCode: 'goodcode1' }));
});
test('records and household docs have shape limits', async () => {
  const db = as(V);
  await assertFails(setDoc(doc(db, 'households', V, 'records', 'k'), { kind: 'x'.repeat(100), id: 'k', data: {}, deleted: false, ts: 1, by: V }));
  await assertFails(setDoc(doc(db, 'households', V, 'records', 'k2'), { kind: 'items', id: 'x'.repeat(500), data: {}, deleted: false, ts: 1, by: V }));
  await assertFails(setDoc(doc(db, 'households', V, 'records', 'k3'), { kind: 'items', id: 'k3', data: 'not-a-map', deleted: 'no', ts: 'x', by: V }));
  await assertSucceeds(setDoc(doc(db, 'households', V, 'records', 'ok'), { kind: 'items', id: 'ok', data: { name: 'Γάλα' }, deleted: false, ts: 1, by: V }));
  await assertSucceeds(setDoc(doc(db, 'households', V, 'records', 'gone'), { kind: 'items', id: 'gone', data: null, deleted: true, ts: 2, by: V }));
  await assertFails(updateDoc(doc(db, 'households', V), { junk: 'x'.repeat(200 * 1024) }));
  await assertSucceeds(updateDoc(doc(db, 'households', V), { members: [V] }));
});

// ---- v1.9.4 account deletion (src/account-delete.js with the real Firestore SDK) ----
import * as fsmod from 'firebase/firestore';
import { deleteAccountData } from '../../src/account-delete.js';
const adminGet = async (path) => { let snap; await env.withSecurityRulesDisabled(async (ctx) => { snap = await getDoc(doc(ctx.firestore(), ...path)); }); return snap; };
const exists = async (path) => (await adminGet(path)).exists();

test('account deletion: sole member deletes records, invites, household and user doc', async () => {
  const r = await deleteAccountData(fsmod, as(V), V, V);
  assert.equal(r.deletedHousehold, true); assert.equal(r.deletedDocs, 3);
  for (const p of [['households', V], ['households', V, 'records', 'r1'], ['households', V, 'invites', 'goodcode1'], ['users', V]]) assert.equal(await exists(p), false, p.join('/'));
});
test('account deletion: owner with another member hands the household over; data stays for them', async () => {
  await assertSucceeds(updateDoc(doc(as(M), 'households', V), { members: arrayUnion(M), lastJoinCode: 'goodcode1' }));
  const r = await deleteAccountData(fsmod, as(V), V, V);
  assert.equal(r.handedOverTo, M);
  const h = (await adminGet(['households', V])).data();
  assert.equal(h.ownerUid, M); assert.deepEqual(h.members, [M]);
  await assertSucceeds(getDoc(doc(as(M), 'households', V, 'records', 'r1')));
  await assertFails(getDoc(doc(as(V), 'households', V, 'records', 'r1')));
  assert.equal(await exists(['users', V]), false);
});
test('account deletion: a member of someone else\'s household leaves it, then deletes their own', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'households', M), { ownerUid: M, members: [M] }));
  await assertSucceeds(updateDoc(doc(as(M), 'households', V), { members: arrayUnion(M), lastJoinCode: 'goodcode1' }));
  const r = await deleteAccountData(fsmod, as(M), M, V);
  assert.equal(r.leftHousehold, true); assert.equal(r.deletedHousehold, true);
  const h = (await adminGet(['households', V])).data();
  assert.deepEqual(h.members, [V]); assert.equal(h.ownerUid, V);
});
test('handover rule cannot be abused', async () => {
  await assertSucceeds(updateDoc(doc(as(M), 'households', V), { members: arrayUnion(M), lastJoinCode: 'goodcode1' }));
  // a non-owner member cannot take or give ownership
  await assertFails(updateDoc(doc(as(M), 'households', V), { ownerUid: M, members: [M] }));
  // an outsider cannot
  await assertFails(updateDoc(doc(as(A), 'households', V), { ownerUid: A, members: [M] }));
  // the owner cannot hand over to a non-member, nor stay in while handing over, nor drop others at the same time
  await assertFails(updateDoc(doc(as(V), 'households', V), { ownerUid: A, members: [M] }));
  await assertFails(updateDoc(doc(as(V), 'households', V), { ownerUid: M, members: [V, M] }));
  await assertFails(updateDoc(doc(as(V), 'households', V), { ownerUid: M, members: [] }));
});
