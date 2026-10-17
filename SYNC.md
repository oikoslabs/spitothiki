# Συγχρονισμός με Firebase (προαιρετικός)

Χωρίς ρύθμιση η εφαρμογή μένει 100% τοπική. Για συγχρονισμό μεταξύ συσκευών και μελών του σπιτιού:

1. **Firebase console → Add project** (ή χρησιμοποίησε υπάρχον).
2. **Project settings → Your apps → Web app (</>)**: δημιούργησε web app και αντέγραψε το `firebaseConfig` στο `src/firebase-config.js`.
   - Χρειάζονται τα `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
   - Δεν είναι μυστικά. Την πρόσβαση την ελέγχουν οι κανόνες του Firestore.
3. **Authentication → Sign-in method**: ενεργοποίησε **Google** και **Email/Password**.
4. **Authentication → Settings → Authorized domains**: τα `spitothiki.web.app` και `spitothiki.firebaseapp.com` (Firebase Hosting) είναι εγκεκριμένα από προεπιλογή. Για την έκδοση στο GitHub Pages πρόσθεσε και το `ster4runsneakers.github.io`.
5. **Firestore Database → Create database** (production mode, π.χ. `eur3`). Μετά, στο **Rules**, επικόλλησε το `firestore.rules` και πάτα **Publish**.
6. Κάνε commit το `src/firebase-config.js`. Μετά το deploy, στις Ρυθμίσεις εμφανίζεται «Συγχρονισμός συσκευών».

## Πώς δουλεύει
- Τα δεδομένα μένουν στο localStorage, οπότε η εφαρμογή δουλεύει και offline. Κάθε αλλαγή στέλνεται ως ξεχωριστό έγγραφο στο `households/{id}/records`.
- Χωρίς internet, το Firestore κρατά τις αλλαγές σε ουρά και τις στέλνει όταν επιστρέψει η σύνδεση.
- **Συγκρούσεις:** κερδίζει η τελευταία αλλαγή ανά προϊόν, με βάση την ώρα της συσκευής. Αν δύο συσκευές αλλάξουν το ίδιο προϊόν offline, μένει η πιο πρόσφατη.
- Με την πρώτη σύνδεση, τα προϊόντα της συσκευής ενώνονται με όσα υπάρχουν ήδη στον λογαριασμό.
- **Κοινό νοικοκυριό:** Ρυθμίσεις → «Πρόσκληση μέλους» δίνει έναν κωδικό. Το άλλο μέλος συνδέεται με τον δικό του λογαριασμό και τον βάζει στο «Συμμετοχή».
- Η «Διαγραφή όλων» όταν είσαι συνδεδεμένος σβήνει τα δεδομένα και από τις άλλες συσκευές.

## Firebase Hosting
- Η εφαρμογή σερβίρεται και από το `https://spitothiki.web.app`. Τη ρύθμιση την κάνουν τα `firebase.json` και `.firebaserc`.
- Όλα τα paths είναι σχετικά, οπότε δουλεύει και στη ρίζα (`/`) και στο `/spitothiki/` του GitHub Pages.
- Τα HTML/JS/CSS/manifest και το `sw.js` σερβίρονται με `no-cache`, ώστε οι ενημερώσεις να φαίνονται αμέσως.
- Χειροκίνητο deploy: `firebase deploy --only hosting`.
- Αυτόματο deploy: το workflow στο `docs/firebase-hosting.workflow.yml` (αντιγράφεται στο `.github/workflows/`) κάνει deploy σε κάθε push στο `main`, μόλις μπει το secret `FIREBASE_SERVICE_ACCOUNT_SPITOTHIKI`. Χωρίς αυτό τρέχουν μόνο τα tests.
