// Receipt providers the app can read (shared by the app and the receipt proxy Worker, proxy/worker.js).
// v1.8.0: the app checks a scanned link against this list BEFORE any lookup, so an unknown shop gets
// «δεν υποστηρίζονται ακόμα» instead of a misleading «no internet». Pure, unit-tested.
// To add a provider: add its registered domain here, then `cd proxy && npx wrangler deploy` and deploy the app.

// Registered domains of AADE-licensed e-invoicing providers (subdomains allowed).
// Keep this list short and explicit: the proxy must never become an open relay.
export const ALLOWED_DOMAINS = [
  'epsilonnet.gr', 'epsilondigital.gr', // Epsilon Digital (e.g. epsilondigital-<chain>.epsilonnet.gr/fd/...)
  'impact.gr', 'mydataconnect.gr', // IMPACT myDATA connect / eInvoicing
  'softone.gr', 'softone.cloud', 's1cloud.net', // SoftOne e-Invoicing
  'entersoft.gr', 'entersoft.eu', 'retail-link.gr', 'e-invoicing.gr', // Entersoft / Retail Link (e.g. Leroy Merlin: e-invoicing.gr/edocuments/ViewInvoice/...)
  'prosvasisgo.com', 'prosvasis.gr', // PROSVASISGO
  'pelatologio.gr', 'oxygen.gr', // Oxygen-Pelatologio
  'primer.gr', 'primersoftware.gr', // Primer MyData
  'ilyda.com', 'megmydata.gr', // Meg myData (ΙΛΥΔΑ)
  'mat.gr', 'matrapidsign.gr', // MAT RapidSign
  'simplyinvoice.gr', 'simply.gr', // SIMPLY
  'tesae.gr', // Pegasus e-invoicing
  'orian.gr', // Orian MyInvoices
  'parochos.gr', 'parochos-online.gr', // Parochos Online
  'vivawallet.com', 'viva.com', // Viva Fiscal
  'wrapp.ai', // WRAPP
  'edicomgroup.com', // EDIWIN
  'invoicelink.gr', 'megasoft.gr', // InvoiceLink
  'onesys.gr', // ONESIGN
  'elorus.com', // Elorus Fuse
  'timologisi.online' // timologisi.online
];

export function allowedHost(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return ALLOWED_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

// Where the app runs: live, Firebase preview channels (spitothiki--<channel>-<hash>.web.app) and local testing.
export const ALLOWED_ORIGINS = ['https://spitothiki.web.app', 'https://spitothiki.firebaseapp.com', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const PREVIEW_ORIGIN = /^https:\/\/spitothiki--[a-z0-9-]{1,60}\.web\.app$/;
export const isAllowedOrigin = (origin) => ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(String(origin || ''));
