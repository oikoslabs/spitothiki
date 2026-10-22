// v1.4: encrypted backup (.spitobak). PBKDF2-SHA256 → AES-256-GCM via WebCrypto. Unit-tested.
import { parseBackup } from './storage.js';

export const BACKUP_MAGIC = 'spitothiki-encrypted';
export const PBKDF2_ITERATIONS = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;
const toB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function isEncryptedBackup(text) {
  try { const v = JSON.parse(String(text)); return Boolean(v && v.format === BACKUP_MAGIC); } catch { return false; }
}

export async function encryptBackup(state, password, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (!String(password || '').length) throw new Error('Γράψε κωδικό για την κρυπτογράφηση.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(state))));
  return JSON.stringify({ format: BACKUP_MAGIC, version: 1, kdf: 'PBKDF2-SHA256', iterations, cipher: 'AES-256-GCM', salt: toB64(salt), iv: toB64(iv), data: toB64(data), createdAt: new Date().toISOString() });
}

export async function decryptBackup(text, password) {
  let box;
  try { box = JSON.parse(String(text)); } catch { throw new Error('Το αρχείο δεν είναι αντίγραφο της Σπιτοθήκης ή είναι χαλασμένο.'); }
  if (!box || box.format !== BACKUP_MAGIC) throw new Error('Το αρχείο δεν είναι κρυπτογραφημένο αντίγραφο.');
  let plain;
  try {
    const key = await deriveKey(password, fromB64(box.salt), Number(box.iterations) || PBKDF2_ITERATIONS);
    plain = dec.decode(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data)));
  } catch { throw new Error('Λάθος κωδικός ή χαλασμένο αρχείο. Δοκίμασε ξανά.'); }
  return parseBackup(plain);
}

// Accepts both the new encrypted file and the old plain JSON backup.
export async function readBackup(text, askPassword) {
  if (!isEncryptedBackup(text)) return parseBackup(text);
  const password = await askPassword();
  if (password == null) return null;
  return decryptBackup(text, password);
}
