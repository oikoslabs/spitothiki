# Επιστροφή σε προηγούμενη έκδοση (rollback)

Η Σπιτοθήκη ανεβαίνει στο Firebase Hosting (https://spitothiki.web.app). Κάθε ανέβασμα κρατιέται στο ιστορικό,
οπότε μπορείς πάντα να γυρίσεις σε μια παλιότερη έκδοση. Τα δεδομένα των χρηστών **δεν** επηρεάζονται:
μένουν στο κινητό τους και (αν έχουν σύνδεση) στο Firestore.

| Έκδοση | Git tag | Firebase version id |
|---|---|---|
| 1.0 | `v1.0` | `d300168e8142ef9d` |

## 1. Με ένα κλικ (πιο εύκολο)
1. Άνοιξε https://console.firebase.google.com/project/spitothiki/hosting
2. Στο **Ιστορικό εκδόσεων (Release history)** βρες την έκδοση που θέλεις (δες ημερομηνία ή τον πίνακα πιο πάνω).
3. Πάτα τις τρεις τελείες **⋮ → Επαναφορά (Rollback)** και επιβεβαίωσε.
4. Σε 1–2 λεπτά η ιστοσελίδα είναι ξανά η παλιά. Οι χρήστες βλέπουν την αλλαγή όταν κλείσουν και ξανανοίξουν την εφαρμογή.

## 2. Από τη γραμμή εντολών (με το version id)
```bash
firebase hosting:clone spitothiki:<VERSION_ID> spitothiki:live
# π.χ. επιστροφή στην 1.0:
firebase hosting:clone spitothiki:d300168e8142ef9d spitothiki:live
```
Το τρέχον version id το βλέπεις με:
```bash
firebase hosting:channel:list --project spitothiki --json
```

## 3. Ξανανέβασμα μιας παλιάς έκδοσης από το Git (tag)
```bash
git fetch --tags
git checkout v1.0            # ή οποιοδήποτε tag
npm test                     # προαιρετικός έλεγχος
firebase deploy --only hosting --project spitothiki
git checkout main            # γύρνα πίσω στον κανονικό κώδικα
```
Μετά από επαναφορά, για να συνεχίσεις τη δουλειά: διόρθωσε το πρόβλημα στο `main` και κάνε κανονικό deploy.

## Καλό να ξέρεις
- Το service worker (`sw.js`) έχει αριθμό cache (π.χ. `v31`). Μια παλιά έκδοση έχει μικρότερο αριθμό· ο browser την παίρνει
  κανονικά επειδή ελέγχει πάντα το δίκτυο πρώτα. Αν κάποιος βλέπει ακόμη τη νέα, αρκεί να κλείσει/ανοίξει την εφαρμογή δύο φορές.
- Οι κανόνες του Firestore (`firestore.rules`) δεν αλλάζουν με το rollback του Hosting.
