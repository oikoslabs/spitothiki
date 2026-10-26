# Proxy αποδείξεων Σπιτοθήκης (Cloudflare Worker)

Κάποιοι πάροχοι ηλεκτρονικών αποδείξεων δεν επιτρέπουν στον browser να διαβάσει την απόδειξη απευθείας (CORS).
Αυτός ο μικρός Worker «μεσολαβεί»: δέχεται **μόνο GET**, **μόνο https** και **μόνο** προς τα domains των
αδειοδοτημένων παρόχων ηλεκτρονικής τιμολόγησης που υπάρχουν στη λίστα `ALLOWED_DOMAINS` στο `src/receipt-domains.js` (την ίδια λίστα χρησιμοποιεί και η εφαρμογή).
Απαντά μόνο στη Σπιτοθήκη (`spitothiki.web.app` και τα preview `spitothiki--*.web.app`). Δεν αποθηκεύει τίποτα.

Η εφαρμογή δοκιμάζει πρώτα **απευθείας** σύνδεση· τον proxy τον χρησιμοποιεί μόνο αν η απευθείας αποτύχει.

## Εγκατάσταση (δωρεάν λογαριασμός Cloudflare)

```bash
cd proxy
npx wrangler login      # ανοίγει τον browser για σύνδεση στο Cloudflare
npx wrangler deploy     # δίνει μια διεύθυνση π.χ. https://spitothiki-receipt-proxy.<όνομα>.workers.dev
```

Μετά, στη Σπιτοθήκη: **Ρυθμίσεις → Σάρωση απόδειξης → Διεύθυνση proxy**, βάλε τη διεύθυνση του Worker.

## Δοκιμή

```bash
curl -H "Origin: https://spitothiki.web.app" "https://<worker>/?url=https%3A%2F%2F<πάροχος>%2Ffd%2F<κλειδί>%2FmyDATA"
```

## Ασφάλεια

- Δεν είναι ανοιχτός proxy: άλλα domains απαντούν 403, και ελέγχονται και τα redirects.
- Όριο μεγέθους 2 MB, μόνο GET/OPTIONS.
- Ο δωρεάν λογαριασμός Workers έχει 100.000 αιτήματα/ημέρα — υπεραρκετά για οικιακή χρήση.
- Αν ένας πάροχος λείπει από τη λίστα, πρόσθεσέ τον στο `ALLOWED_DOMAINS` του `src/receipt-domains.js`, ξανά `npx wrangler deploy` και ανέβασε και την εφαρμογή.
