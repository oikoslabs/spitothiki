// v1.5: Google Identity Services token client (client-side OAuth, no backend).
import { DRIVE_SCOPE, tokenValid } from './gdrive.js';
// OAuth Web client of the Firebase project (public identifier, not a secret).
export const GOOGLE_CLIENT_ID = '621742059103-4ggfqqvo0mllqj6ocdr8890f1r6u2fkt.apps.googleusercontent.com';
let token = null; let client = null; let loading = null;
function loadGis() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (!loading) loading = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { loading = null; reject(new Error('Δεν φόρτωσε η σύνδεση Google. Έλεγξε το ίντερνετ.')); };
    document.head.append(s);
  });
  return loading;
}
export function hasToken() { return tokenValid(token); }
export function forgetToken() {
  if (token?.value && globalThis.google?.accounts?.oauth2) { try { google.accounts.oauth2.revoke(token.value, () => {}); } catch {} }
  token = null;
}
// interactive=false → prompt '' (no screen if already granted); true → consent screen.
export async function getDriveToken(force = false, { interactive = false } = {}) {
  if (!force && tokenValid(token)) return token.value;
  await loadGis();
  return new Promise((resolve, reject) => {
    client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) { reject(new Error('Η σύνδεση με το Google Drive δεν ολοκληρώθηκε.')); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) { reject(new Error('Χρειάζεται να επιτρέψεις την πρόσβαση στο Drive.')); return; }
        token = { value: r.access_token, expiresAt: Date.now() + Number(r.expires_in || 3600) * 1000 }; resolve(token.value);
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Έκλεισες το παράθυρο της Google.' : e?.type === 'popup_failed_to_open' ? 'Ο browser μπλόκαρε το παράθυρο της Google.' : 'Η σύνδεση με το Google Drive δεν ολοκληρώθηκε.'))
    });
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}
