// v1.5: stores the derived (non-extractable) backup key in IndexedDB. No password is ever stored.
const DB = 'spitothiki-keys'; const STORE = 'keys'; const ID = 'drive';
function open() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('no idb')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => resolve(r?.result); t.onerror = () => reject(t.error); });
}
export const loadDriveKey = () => tx('readonly', (s) => s.get(ID)).catch(() => null);
export const saveDriveKey = (value) => tx('readwrite', (s) => s.put(value, ID));
export const clearDriveKey = () => tx('readwrite', (s) => s.delete(ID)).catch(() => {});
