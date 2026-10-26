# Πηγές επισκεπτών (v1.8.2)

Ένα link ανά προφίλ. Η εφαρμογή κρατά ΜΟΝΟ τη λέξη της πηγής, μία φορά ανά συσκευή (πρώτο άνοιγμα), και στέλνει
`{type:'visit'|'signup', src}` στο `https://spitothiki-stats.cornerstore553.workers.dev/e` → Workers Analytics Engine,
dataset `spitothiki_sources` (blob1 = type, blob2 = source). Χωρίς IP, συσκευή, email ή χρήστη. Τίποτα στο Firestore.

| Πηγή | Link |
|---|---|
| TikTok | https://spitothiki.web.app/?src=tiktok |
| Facebook | https://spitothiki.web.app/?src=facebook |
| Instagram | https://spitothiki.web.app/?src=instagram |
| Telegram | https://spitothiki.web.app/?src=telegram |
| Viber | https://spitothiki.web.app/?src=viber |
| Reddit | https://spitothiki.web.app/?src=reddit |
| Pinterest | https://spitothiki.web.app/?src=pinterest |
| SofisStore | https://spitothiki.web.app/?src=sofisstore (και το παλιό `?utm_source=sofisstore`) |

## Σύντομα links (v1.8.3) — για όπου το link δεν πατιέται (π.χ. TikTok bio)

`spitothiki.web.app/tiktok`, `/facebook`, `/instagram`, `/telegram`, `/viber`, `/reddit`, `/pinterest`, `/sofisstore`.
Κεφαλαία/μικρά δεν πειράζουν (`/TikTok`, `/TIKTOK`), ούτε η κάθετος στο τέλος. Το Firebase Hosting κάνει 302 → `/?src=<λέξη>`
(firebase.json `redirects`), offline το ίδιο κάνει ο service worker, και η εφαρμογή διαβάζει και το path ως εφεδρεία.
Μετράνε ακριβώς σαν το `?src=` (μία φορά ανά συσκευή, η διεύθυνση γίνεται `/`).

Χωρίς παράμετρο = `direct`. Άγνωστη λέξη = `other`. Συσκευές που χρησιμοποιούσαν την εφαρμογή πριν το v1.8.2 = `existing` (δεν στέλνουν visit, μόνο signup αν φτιάξουν λογαριασμό).

Νούμερα: `tools/sources-report.sh [days]` ή τα SQL στο `tools/sources.sql`. Η Analytics Engine κρατά ~90 μέρες.

## Δοκιμαστικά events (αφαίρεσέ τα)
- 26/10/2026 19:41 ώρα Αθήνας: **1 visit, tiktok** (έλεγχος του v1.8.2 στο live). Signup δοκιμή δεν έγινε.
