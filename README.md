# Σπιτοθήκη

**Live:** https://spitothiki.web.app

A bilingual (Greek / English) app for running a home: what's in the cupboards and when it expires, the shopping list, the in-store cart, what to cook, the bills, transport and the small daily spending — with one monthly total. Mobile-first, works offline, installable as an app. Optional private sync for the whole household.

## Features

- **Pantry (Αποθήκη):** products, quantities, categories, storage place, minimum stock, expiry dates with reminders; low stock goes straight to the list.
- **Shopping list + cart:** list per store, voice add, «Καλάθι στο κατάστημα» with running total and budget, prices remembered per store, finish → pantry is updated.
- **Scan anything (📷 Σάρωση):** one button for product barcodes, receipt QR codes, toll receipts and bill payment codes; also from a photo or PDF.
- **Receipts:** Greek e-receipt QR / photo → items, store and total imported.
- **Cooking + meal plan:** recipe ideas from what you have, weekly plan, missing ingredients to the list.
- **Diet plan (Πρόγραμμα διατροφής):** photograph the dietitian's sheet → a 4-meal weekly plan → the shopping list.
- **Bills:** add from PDF, photo or payment code (amount, due date and payment code read automatically), reminders, history, recurring bills, **direct debit** («Πληρώνεται με πάγια εντολή»: paid automatically on the due date, never shown as pending).
- **Transport:** fuel, tolls (from the toll receipt), tickets, parking, consumption per car.
- **Extras:** one-tap small spending (coffee, snacks …) with your own categories.
- **Monthly totals:** everything counted once, per month, with history.
- **Household sharing (Κοινό σπίτι):** sign in, invite members with a code, everyone sees the same lists; you can also set the app up for an older relative.
- **Comfort:** text size, high contrast, dark mode, Greek/English, first-run setup, undo instead of «are you sure?», accessibility checked (WCAG 2.1 AA, 44px tap targets).
- **Backup:** export / import a file with all your data.

## Privacy

Without sign-in everything stays in this browser (`localStorage`). With household sync, data goes to a private Firebase project protected by sign-in and Firestore rules (see [SYNC.md](SYNC.md) and `firestore.rules`). No ads. Cloudflare Web Analytics counts page visits anonymously (no cookies); your household data is never sent to it. Backup files contain personal household data — don't share or commit them. Never commit real bills or receipts; tests use anonymised fixtures only.

## Stack

- Plain HTML, CSS and JavaScript modules — no framework, no build step.
- Service worker (`sw.js`, network-first + offline shell cache) and web manifest.
- Firebase Auth + Firestore for optional sync (`src/sync*.js`), Firebase Hosting for the live site.
- Barcode/QR: the browser's BarcodeDetector with a fallback; PDF reading with pdf.js; text recognition from photos for bills and diet plans.
- Main modules in `src/`: `app.js` (screens and actions), `format.js`, `theme.js`, `prefs.js`, `i18n.js`, `domain.js`, `features.js`, `cart.js`, `bills.js`, `bill-pdf.js`, `transport.js`, `mealplan.js`, `diet-plan.js`, `diet-ui.js`, `recipes.js`, `receipt*.js`, `scan-router.js`, `onboarding.js`, `storage.js`, `sync-core.js`.

## Run locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
npm test                      # unit tests (node --test), no install needed
```

Browser smoke tests (`tests/smoke/*.mjs`) need Chrome and `npm i --no-save puppeteer-core axe-core`, then e.g.
`node tests/smoke/a11y-smoke.mjs http://127.0.0.1:8080/`.

## Deploy (manual — this is the source of truth)

1. Make the change on a branch, open a PR, run `npm test` and the smokes, merge.
2. Bump `CACHE_VERSION` in `sw.js` (and add any new file to its precache list).
3. From an up-to-date `main`:
   ```bash
   firebase deploy --only hosting --project spitothiki
   curl -s https://spitothiki.web.app/sw.js | grep CACHE_VERSION   # verify
   ```
4. Rollback: see [docs/ROLLBACK.md](docs/ROLLBACK.md).

GitHub Actions do not deploy. `docs/ci.workflow.yml` (tests on every push/PR) is ready to replace the old GitHub Pages workflow, and `docs/firebase-hosting.workflow.yml` is an optional manual-only deploy button; installing either needs a token with the `workflow` scope (instructions inside each file).

## Συγχρονισμός (προαιρετικός)

Δες το [SYNC.md](SYNC.md) για ενεργοποίηση με Firebase. Χωρίς ρύθμιση όλα μένουν στη συσκευή.
