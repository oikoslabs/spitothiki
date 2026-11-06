// v1.9.18: optional product-news opt-in (separate from necessary service emails).
// Pure helpers — no Firebase imports — so unit tests stay offline.

export const MARKETING_CONSENT_VERSION = '1';
export const MARKETING_LABEL = 'Θέλω να λαμβάνω περιστασιακά νέα για τη Σπιτοθήκη (συμβουλές χρήσης, νέες δυνατότητες). Μπορώ να το σταματήσω όποτε θέλω.';
export const MARKETING_HINT = 'Τα απαραίτητα μηνύματα υπηρεσίας (ασφάλεια, σημαντική ενημέρωση έκδοσης, αλλαγές όρων/απορρήτου) δεν επηρεάζονται.';

/** Existing accounts without a field are treated as opted out (never auto-enrolled). */
export function normalizeMarketingOptIn(data) {
  return data?.marketingOptIn === true;
}

/**
 * Only brand-new accounts may receive the signup-form choice.
 * Returning users must keep whatever is already stored (including absent = false).
 */
export function shouldApplySignupMarketing({ isNewUser, pending }) {
  return Boolean(isNewUser) && pending != null && typeof pending.optIn === 'boolean';
}

/**
 * Build the fields written to users/{uid} (caller merges with householdId / timestamps).
 * optIn false on signup still records the decision so Settings can show the real state.
 */
export function marketingFields({ optIn, source, version = MARKETING_CONSENT_VERSION }) {
  const on = Boolean(optIn);
  const src = String(source || 'unknown').slice(0, 40);
  const ver = String(version || MARKETING_CONSENT_VERSION).slice(0, 20);
  return {
    marketingOptIn: on,
    marketingConsentVersion: ver,
    marketingConsentSource: src,
    // Timestamps are filled by the Firebase adapter (serverTimestamp / null).
    setOptInAt: on,
    setOptOutAt: !on && src === 'settings'
  };
}

export function readMarketingCheckbox(root = typeof document !== 'undefined' ? document : null) {
  const el = root?.querySelector?.('#marketing-optin');
  return Boolean(el?.checked);
}
