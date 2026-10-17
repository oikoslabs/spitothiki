# Σπιτοθήκη

A small Greek home-pantry and shopping-list web app. Mobile-first, offline-friendly, and local-only.

## What works in this MVP

- Track household products, quantities, units, categories, storage locations, minimum-stock reminders, and expiry dates.
- See products expiring soon, expired products, and items below their restock threshold.
- Search and filter the pantry; adjust quantities; add low-stock products to the shopping list.
- Create and check off a shopping list.
- Export/import a JSON backup and load sample data for a demo.

## Privacy and limits

All data is stored in this browser's `localStorage`. There is no account, cloud sync, analytics, or backend in this version. Data does **not** sync between family members or devices. If browser storage is cleared, the data is lost unless you exported a backup. Backup JSON files contain personal household information; do not commit or share them publicly.

The repository and deployed GitHub Pages code are public. Do not add API keys or private data to the source. Cross-device sharing should only be added later with authentication and server-side access rules.

## Run locally

Requires Node.js for tests. The app itself is static HTML/CSS/JavaScript and needs no install/build step.

```bash
npm test
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploy

The GitHub Actions workflow runs the tests and publishes the repository root to GitHub Pages on pushes to `main`. Enable **Settings → Pages → Build and deployment → GitHub Actions** once the repository exists.
