// Small client-side blocklist of disposable / temporary email domains.
// Used only for email+password sign-up (not Google Sign-In, not sign-in of an existing account).
// Keep the list short and maintainable; prefer real addresses (Gmail, Outlook, …).

export const DISPOSABLE_EMAIL_MSG =
  'Δεν δέχομαι προσωρινά email. Χρησιμοποίησε κανονικό Gmail ή άλλο.';

// Lowercase registrable domains (and common aliases). Subdomains of these are also blocked.
export const DISPOSABLE_DOMAINS = new Set([
  // The one that signed up as a fake Spitothiki tester (Nov 2026)
  'emailhook.site',
  // Common throwaway / inbox-catcher services
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamail.biz',
  'pokemail.net',
  'spam4.me',
  '10minutemail.com',
  '10minutemail.net',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'tempail.com',
  'tempinbox.com',
  'tempmailo.com',
  'tmpmail.org',
  'tmpmail.net',
  'throwaway.email',
  'throwam.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'trashmail.com',
  'trash-mail.com',
  'trashmail.me',
  'getnada.com',
  'nada.email',
  'maildrop.cc',
  'mailnesia.com',
  'discard.email',
  'dispostable.com',
  'fakeinbox.com',
  'mohmal.com',
  'emailondeck.com',
  'mailcatch.com',
  'mytemp.email',
  'tempr.email',
  'mailnull.com',
  'spamgourmet.com',
  'mintemail.com',
  'meltmail.com',
  'getairmail.com',
  '33mail.com',
  'inboxkitten.com',
  'mailtemp.net',
  'bumpymail.com',
  'mailforspam.com',
  'emailfake.com',
  'generator.email',
  'mailnesia.com',
  'guerrillamail.info',
  'spamfree24.org',
  'mailscrap.com',
  'tempmailaddress.com',
  'emailtemporanea.com',
  'emailtemporanea.net',
  'tempsky.com',
  'mailpoof.com',
  'fake-mail.ml',
]);

/** Domain part of an email, lowercased; empty if missing / invalid shape. */
export function emailDomain(email) {
  const raw = String(email || '').trim().toLowerCase();
  const at = raw.lastIndexOf('@');
  if (at < 1 || at === raw.length - 1) return '';
  // Drop a trailing ">" or similar paste junk
  return raw.slice(at + 1).replace(/>$/, '').trim();
}

/** True when the address uses a known disposable domain (or a subdomain of one). */
export function isDisposableEmail(email) {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain.endsWith('.' + blocked)) return true;
  }
  return false;
}

/** Throws Error(DISPOSABLE_EMAIL_MSG) when the email is disposable. */
export function assertNotDisposableEmail(email) {
  if (isDisposableEmail(email)) {
    const err = new Error(DISPOSABLE_EMAIL_MSG);
    err.code = 'auth/disposable-email';
    throw err;
  }
}
