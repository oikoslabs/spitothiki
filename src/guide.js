// In-app user manual: numbered sections you can scroll, with a table of contents and search.
// Greek is the source language (same as the rest of the UI). English lives in GUIDE_EN.

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ');

export const GUIDE_SECTIONS = [
  {
    id: 'start',
    icon: '👋',
    title: 'Ξεκίνημα',
    intro: 'Ξεκίνα από εδώ: κάνε πρώτα αυτά τα 3.',
    bullets: [
      'Πάτα «Σάρωση» και σκάναρε το QR μιας απόδειξης. Τα έξοδα γράφονται μόνα τους· αν θέλεις, τα προϊόντα μπαίνουν και στο απόθεμα.',
      'Στην αρχική οθόνη δες πόσα ξόδεψες αυτόν τον μήνα και τι λήγει στις επόμενες 7 ημέρες.',
      'Γράψε στη λίστα αγορών ό,τι χρειάζεται το σπίτι, πριν βγεις για ψώνια.',
      'Η σύνδεση είναι προαιρετική. Χρειάζεται μόνο αν θέλεις τα ίδια δεδομένα σε άλλο κινητό ή να τα βλέπει η οικογένεια.'
    ]
  },
  {
    id: 'pantry',
    icon: '🧺',
    title: 'Αποθήκη (τι έχεις στο σπίτι)',
    intro: 'Όσα έχεις στο σπίτι, με ποσότητα και λήξη, σε ένα σημείο.',
    bullets: [
      'Πάτα «Προσθήκη προϊόντος» και γράψε όνομα, ποσότητα και, αν θέλεις, πού βρίσκεται. Μπορείς να σκανάρεις το barcode για να συμπληρωθεί το όνομα.',
      'Βάλε ημερομηνία λήξης με το χέρι, ή σκάναρε τον κωδικό πάνω στην ετικέτα του προϊόντος (όχι την απόδειξη). Η εφαρμογή διαβάζει μόνο τη λήξη ή την «ανάλωση κατά προτίμηση», όχι την ημερομηνία παραγωγής.',
      'Όταν πετάς κάτι, πάτα το κάδο στο απόθεμα και σημείωσέ το ως «πετάχτηκε».',
      'Στο πεδίο «Υπενθύμιση κάτω από» εμφανίζεται ετικέτα «Χαμηλό απόθεμα». Αυτό δεν βάζει μόνο του το προϊόν στη λίστα αγορών.'
    ]
  },
  {
    id: 'shopping',
    icon: '✓',
    title: 'Λίστα αγορών',
    intro: 'Σημείωσε όσα χρειάζεσαι και πάρε τη λίστα μαζί σου.',
    bullets: [
      'Γράψε ένα προϊόν ή πάτα «Στη λίστα» από το απόθεμα. Σε πολλούς browsers μπορείς να προσθέσεις και με φωνή (🎤).',
      'Όταν τσεκάρεις κάτι ως αγορασμένο, η ποσότητα μπαίνει στο απόθεμα. Γράψε την τιμή αν θέλεις να μετρήσει στα έξοδα.',
      'Η αυτόματη λίστα (Ρυθμίσεις) βάζει μόνη της ένα προϊόν μόνο όταν η ποσότητα γίνει 0 ή όταν έχει ήδη λήξει — όχι όταν απλώς πέσει κάτω από το ελάχιστο.',
      'Στα «Επαναλαμβανόμενα» ορίζεις εσύ κάθε πότε να μπαίνει κάτι (π.χ. γάλα κάθε εβδομάδα). Η εφαρμογή δεν το μαντεύει από τις αγορές σου.'
    ]
  },
  {
    id: 'cart',
    icon: '🛒',
    title: 'Καλάθι μέσα στο κατάστημα',
    intro: 'Στο κατάστημα, σκάναρε ό,τι βάζεις στο καρότσι και δες το σύνολο πριν το ταμείο.',
    bullets: [
      'Πάτα «Καλάθι στο κατάστημα», διάλεξε κατάστημα και, αν θέλεις, βάλε προϋπολογισμό για αυτή την επίσκεψη.',
      'Σκάναρε τα προϊόντα ή πρόσθεσέ τα με το χέρι. Θα δεις αν πλησιάζεις ή ξεπερνάς το όριο.',
      'Στο τέλος, η λίστα τσεκάρεται, το απόθεμα γεμίζει και τα έξοδα καταγράφονται. Αν μετά σκανάρεις την απόδειξη, μπορεί να συνδεθεί με το καλάθι για να μην μετρήσει δύο φορές.'
    ]
  },
  {
    id: 'receipts',
    icon: '📷',
    title: 'Αποδείξεις',
    intro: 'Σκάναρε το QR και τα έξοδα (και, αν θες, τα προϊόντα) μπαίνουν μόνα τους.',
    bullets: [
      'Σκάναρε το QR της ηλεκτρονικής απόδειξης, όχι την κάρτα πόντων και όχι το barcode του ταμείου. Βλέπεις τα είδη πριν μπουν οπουδήποτε.',
      'Αν το QR είναι της ΑΑΔΕ και δεν έχει τα είδη, βγάλε φωτογραφία την απόδειξη ή γράψε το ποσό με το χέρι.',
      'Η σάρωση απόδειξης δεν τσεκάρει τη λίστα αγορών. Η ημερομηνία λήξης δεν έρχεται από την απόδειξη — μόνο από τον κωδικό στο ίδιο το προϊόν.',
      'Αν είναι βενζίνη ή διόδια, μπορείς να τη μεταφέρεις στις Μετακινήσεις.'
    ]
  },
  {
    id: 'cook',
    icon: '🍳',
    title: 'Τι να μαγειρέψω',
    intro: 'Ιδέες με ό,τι έχεις στο σπίτι, πρώτα όσα λήγουν σύντομα.',
    bullets: [
      'Πάτα «Μαγείρεμα & γεύματα» και δες συνταγές που ταιριάζουν με το απόθεμά σου.',
      'Ό,τι λείπει μπορείς να το βάλεις στη λίστα με ένα πάτημα, ή τη συνταγή στο πρόγραμμα της εβδομάδας.'
    ]
  },
  {
    id: 'meals',
    icon: '📅',
    title: 'Πρόγραμμα φαγητού',
    intro: 'Σχεδίασε την εβδομάδα και πάρε έτοιμη τη λίστα με ό,τι λείπει.',
    bullets: [
      'Στο «Πρόγραμμα γευμάτων» βάλε πρωινό, μεσημεριανό και βραδινό για κάθε μέρα, από συνταγή ή με ελεύθερο κείμενο.',
      'Πάτα «Ό,τι λείπει στη λίστα»: προστίθενται μόνο τα υλικά που δεν έχεις στο απόθεμα και δεν είναι ήδη στη λίστα. Δεν γίνεται αυτόματα μόλις προσθέσεις ένα γεύμα.',
      'Μπορείς να αντιγράψεις την προηγούμενη εβδομάδα. Αν έχεις πρόγραμμα διατροφής, φωτογράφισε το χαρτί του διαιτολόγου και στείλε τα υλικά στη λίστα.'
    ]
  },
  {
    id: 'bills',
    icon: '📄',
    title: 'Λογαριασμοί',
    intro: 'ΔΕΗ, νερό, ενοίκιο και συνδρομές: τι πληρώνεις και πότε.',
    bullets: [
      'Πάτα «Προσθήκη λογαριασμού», βάλε ποσό και ημερομηνία λήξης. Αν επαναλαμβάνεται, διάλεξε κάθε πότε (π.χ. κάθε μήνα)· όταν τον πληρώνεις, ανοίγει μόνος του ο επόμενος.',
      'Αν πληρώνεται με πάγια εντολή, σημείωσέ το: την ημερομηνία λήξης σημειώνεται πληρωμένος, χωρίς υπενθύμιση.',
      'Μπορείς να εισάγεις λογαριασμό από PDF ή φωτογραφία.'
    ]
  },
  {
    id: 'spending',
    icon: '∑',
    title: 'Σύνολο εξόδων',
    intro: 'Πόσα ξόδεψες αυτόν τον μήνα, ανά κατηγορία, και σύγκριση με τον προηγούμενο.',
    bullets: [
      'Πάτα «Σύνολο εξόδων» για αγορές, ενοίκιο, λογαριασμούς, μετακινήσεις και μικροέξοδα του μήνα.',
      'Μπορείς να φτιάξεις δικές σου κατηγορίες εξόδων (π.χ. Ρούχα). Στο κοινό σπίτι με δύο μέλη βλέπεις και «Ποιος πλήρωσε τι».',
      'Δεν υπάρχει ακόμη εβδομαδιαίο σύνολο για όλα τα έξοδα, ούτε μηνιαίο όριο προϋπολογισμού για το νοικοκυριό. Προϋπολογισμός υπάρχει μόνο στο καλάθι, για μία επίσκεψη στο κατάστημα.'
    ]
  },
  {
    id: 'transport',
    icon: '🚗',
    title: 'Μετακινήσεις',
    intro: 'Βενζίνη, διόδια, ΜΜΜ, ταξί και στάθμευση, κάθε μήνα.',
    bullets: [
      'Καταχώρισε ένα έξοδο μετακίνησης, ή μετάφερε μια απόδειξη καυσίμων ή διοδίων από τις Αποδείξεις.',
      'Στα καύσιμα μπορείς να βάλεις λίτρα και χιλιόμετρα για την κατανάλωση. Τα μηνιαία πάγια (π.χ. κάρτα απεριορίστων) καταχωρούνται μόνα τους κάθε μήνα.'
    ]
  },
  {
    id: 'extras',
    icon: '☕',
    title: 'Μικροέξοδα',
    intro: 'Καφές, σάντουιτς και ό,τι μικρό πληρώνεις κάθε μέρα, με ένα πάτημα.',
    bullets: [
      'Πάτα το κουμπί του εξόδου: καταχωρείται σήμερα, με την τελευταία τιμή που έβαλες.',
      'Φτιάξε τα δικά σου κουμπιά και άλλαξε τιμή ή ημερομηνία όταν χρειάζεται.'
    ]
  },
  {
    id: 'chores',
    icon: '🧹',
    title: 'Δουλειές σπιτιού',
    intro: 'Τι πρέπει να γίνει και πότε, χωρίς να το θυμάσαι.',
    bullets: [
      'Πρόσθεσε μια δουλειά και κάθε πόσες μέρες γίνεται. Πάτα «Έγινε» όταν την τελειώσεις.',
      'Μπορείς να ορίσεις ποιος την κάνει και αν θέλεις υπενθύμιση.'
    ]
  },
  {
    id: 'household',
    icon: '🏠',
    title: 'Κοινό σπίτι',
    intro: 'Η σύνδεση είναι προαιρετική· τη χρειάζεσαι μόνο για συγχρονισμό ή για να βλέπει όλη η οικογένεια τα ίδια.',
    bullets: [
      'Χωρίς λογαριασμό τα πάντα μένουν στο κινητό σου και η εφαρμογή δουλεύει κανονικά.',
      'Στις Ρυθμίσεις συνδέσου με Google ή email. Με «＋ Πρόσκληση μέλους» παίρνεις έναν κωδικό για το άλλο κινητό.',
      'Όσο η εφαρμογή είναι ανοιχτή, οι αλλαγές φαίνονται σε λίγα δευτερόλεπτα. Δεν έρχεται ειδοποίηση όταν αγοράζει άλλο μέλος και έχεις την εφαρμογή κλειστή.'
    ]
  },
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Ειδοποιήσεις',
    intro: 'Υπενθυμίσεις για λήξεις, λογαριασμούς και δουλειές, όταν τις ενεργοποιήσεις.',
    bullets: [
      'Στις Ρυθμίσεις πάτα «Ενεργοποίηση ειδοποιήσεων». Όταν ανοίγεις την εφαρμογή, μία φορά τη μέρα, σου θυμίζει ό,τι λήγει μέσα στις ημέρες που ορίζεις (προεπιλογή 3).',
      'Με κλειστή εφαρμογή, αν το επιτρέπει το κινητό σου, έρχονται υπενθυμίσεις κάθε πρωί περίπου στις 9:00.',
      'Προαιρετικά, υπενθύμιση να σκανάρεις τα ψώνια σου αν περάσουν 7 μέρες χωρίς σάρωση (το πολύ μία την εβδομάδα).'
    ]
  },
  {
    id: 'settings',
    icon: '⚙',
    title: 'Ρυθμίσεις και αντίγραφα',
    intro: 'Εμφάνιση, αντίγραφο ασφαλείας και προσαρμογή της αρχικής.',
    bullets: [
      'Εξαγωγή ή εισαγωγή αντιγράφου σε αρχείο (και με κωδικό). Προαιρετικά, κρυπτογραφημένο αντίγραφο στο δικό σου Google Drive, μία φορά τη μέρα (κρατάει τα 5 τελευταία).',
      'Ρύθμισε θέμα, μέγεθος γραμμάτων, τι φαίνεται στην αρχική και στην κάτω μπάρα, και δικά σου είδη προϊόντων.',
      'Αν δεν συνδεθείς και αλλάξεις κινητό ή καθαρίσεις τα δεδομένα του browser, χρειάζεσαι αντίγραφο για να τα πάρεις μαζί σου.'
    ]
  },
  {
    id: 'tips',
    icon: '💡',
    title: 'Χρήσιμα tips',
    numbered: false,
    intro: 'Μικρές λεπτομέρειες που γλιτώνουν λάθη.',
    bullets: [
      'Άνοιξε τη Σπιτοθήκη στο spitothiki.web.app. Από το μενού του browser (Chrome ή Safari) μπορείς να την προσθέσεις στην αρχική οθόνη του κινητού σου. Δεν χρειάζεται λογαριασμός.',
      'Η εφαρμογή είναι δωρεάν, χωρίς διαφημίσεις, και δουλεύει και χωρίς internet. Τα δεδομένα μένουν στο κινητό ώσπου να συνδεθείς.',
      'Μοίρασε τη λίστα αγορών με το κουμπί κοινοποίησης και, αν ψωνίζεις συχνά στο ίδιο κατάστημα, όρισε τη σειρά των διαδρόμων.',
      'Για απορίες ή προβλήματα, γράψε στο oikoslabs.apps@gmail.com.'
    ]
  }
];

export const VIEW_TO_SECTION = {
  overview: 'start',
  pantry: 'pantry',
  shopping: 'shopping',
  cart: 'cart',
  receipts: 'receipts',
  cook: 'cook',
  bills: 'bills',
  insights: 'spending',
  transport: 'transport',
  extras: 'extras',
  chores: 'chores',
  settings: 'settings'
};

export function sectionForView(view, { cookTab } = {}) {
  if (view === 'cook' && cookTab === 'plan') return 'meals';
  return VIEW_TO_SECTION[view] || '';
}

export function guideSectionById(id) {
  return GUIDE_SECTIONS.find((section) => section.id === id) || null;
}

export function guideHeading(section, index = GUIDE_SECTIONS.indexOf(section)) {
  if (section.numbered === false) return section.title;
  const number = GUIDE_SECTIONS.slice(0, index + 1).filter((entry) => entry.numbered !== false).length;
  return `${number}. ${section.title}`;
}

export function searchGuide(query, { sections = GUIDE_SECTIONS, translate = (text) => text } = {}) {
  const q = fold(query).trim();
  if (!q) return sections;
  return sections.filter((section) => {
    const hay = fold([translate(section.title), translate(section.intro), ...section.bullets.map((bullet) => translate(bullet))].join(' '));
    return hay.includes(q);
  });
}

export const GUIDE_EN = {
  'Οδηγός': 'Guide',
  'Πώς δουλεύει η Σπιτοθήκη': 'How Spitothiki works',
  'Βρες μια λειτουργία ή μια λέξη, π.χ. απόδειξη, λήξη, λίστα.': 'Find a feature or a word, e.g. receipt, expiry, list.',
  'Αναζήτηση στον οδηγό': 'Search the guide',
  'Περιεχόμενα': 'Contents',
  'Δεν βρήκα ενότητες για «{query}».': 'No sections found for “{query}”.',
  'Άνοιξε τον οδηγό': 'Open the guide',
  'Διάβασε τον οδηγό': 'Read the guide',
  'Πώς δουλεύει κάθε λειτουργία, με απλά βήματα.': 'How each feature works, in simple steps.',
  'Οδηγός: {title}': 'Guide: {title}',
  'Ξεκίνημα': 'Getting started',
  'Ξεκίνα από εδώ: κάνε πρώτα αυτά τα 3.': 'Start here: do these 3 things first.',
  'Πάτα «Σάρωση» και σκάναρε το QR μιας απόδειξης. Τα έξοδα γράφονται μόνα τους· αν θέλεις, τα προϊόντα μπαίνουν και στο απόθεμα.': 'Tap «Scan» and scan the QR code on a receipt. Spending is recorded by itself; if you want, the products go into the pantry too.',
  'Στην αρχική οθόνη δες πόσα ξόδεψες αυτόν τον μήνα και τι λήγει στις επόμενες 7 ημέρες.': 'On the home screen, see how much you spent this month and what expires in the next 7 days.',
  'Γράψε στη λίστα αγορών ό,τι χρειάζεται το σπίτι, πριν βγεις για ψώνια.': 'Write on the shopping list what the house needs, before you go out shopping.',
  'Η σύνδεση είναι προαιρετική. Χρειάζεται μόνο αν θέλεις τα ίδια δεδομένα σε άλλο κινητό ή να τα βλέπει η οικογένεια.': 'Signing in is optional. You only need it if you want the same data on another phone, or for the family to see it.',
  'Αποθήκη (τι έχεις στο σπίτι)': 'Pantry (what you have at home)',
  'Όσα έχεις στο σπίτι, με ποσότητα και λήξη, σε ένα σημείο.': 'Everything you have at home, with quantity and expiry, in one place.',
  'Πάτα «Προσθήκη προϊόντος» και γράψε όνομα, ποσότητα και, αν θέλεις, πού βρίσκεται. Μπορείς να σκανάρεις το barcode για να συμπληρωθεί το όνομα.': 'Tap «Add product» and type a name, quantity and, if you want, where it is. You can scan the barcode to fill in the name.',
  'Βάλε ημερομηνία λήξης με το χέρι, ή σκάναρε τον κωδικό πάνω στην ετικέτα του προϊόντος (όχι την απόδειξη). Η εφαρμογή διαβάζει μόνο τη λήξη ή την «ανάλωση κατά προτίμηση», όχι την ημερομηνία παραγωγής.': 'Enter an expiry date by hand, or scan the code on the product’s own label (not the receipt). The app reads only the expiry or “best before” date, not the production date.',
  'Όταν πετάς κάτι, πάτα το κάδο στο απόθεμα και σημείωσέ το ως «πετάχτηκε».': 'When you throw something away, tap the bin on the pantry item and mark it as thrown away.',
  'Στο πεδίο «Υπενθύμιση κάτω από» εμφανίζεται ετικέτα «Χαμηλό απόθεμα». Αυτό δεν βάζει μόνο του το προϊόν στη λίστα αγορών.': 'The «Remind me below» field shows a «Low stock» tag. That does not add the product to the shopping list by itself.',
  'Σημείωσε όσα χρειάζεσαι και πάρε τη λίστα μαζί σου.': 'Note what you need and take the list with you.',
  'Γράψε ένα προϊόν ή πάτα «Στη λίστα» από το απόθεμα. Σε πολλούς browsers μπορείς να προσθέσεις και με φωνή (🎤).': 'Type a product or tap «To the list» from the pantry. In many browsers you can also add items by voice (🎤).',
  'Όταν τσεκάρεις κάτι ως αγορασμένο, η ποσότητα μπαίνει στο απόθεμα. Γράψε την τιμή αν θέλεις να μετρήσει στα έξοδα.': 'When you tick something as bought, its quantity is added to the pantry. Type the price if you want it to count in spending.',
  'Η αυτόματη λίστα (Ρυθμίσεις) βάζει μόνη της ένα προϊόν μόνο όταν η ποσότητα γίνει 0 ή όταν έχει ήδη λήξει — όχι όταν απλώς πέσει κάτω από το ελάχιστο.': 'The automatic list (Settings) adds a product by itself only when the quantity reaches 0 or it has already expired — not when it merely drops below the minimum.',
  'Στα «Επαναλαμβανόμενα» ορίζεις εσύ κάθε πότε να μπαίνει κάτι (π.χ. γάλα κάθε εβδομάδα). Η εφαρμογή δεν το μαντεύει από τις αγορές σου.': 'In «Repeating items» you choose how often something is added (e.g. milk every week). The app does not guess this from your purchases.',
  'Καλάθι μέσα στο κατάστημα': 'In-store cart',
  'Στο κατάστημα, σκάναρε ό,τι βάζεις στο καρότσι και δες το σύνολο πριν το ταμείο.': 'In the store, scan whatever you put in the trolley and see the total before the till.',
  'Πάτα «Καλάθι στο κατάστημα», διάλεξε κατάστημα και, αν θέλεις, βάλε προϋπολογισμό για αυτή την επίσκεψη.': 'Tap «In-store cart», pick a store and, if you want, set a budget for this visit.',
  'Σκάναρε τα προϊόντα ή πρόσθεσέ τα με το χέρι. Θα δεις αν πλησιάζεις ή ξεπερνάς το όριο.': 'Scan the products or add them by hand. You will see if you are near or over the limit.',
  'Στο τέλος, η λίστα τσεκάρεται, το απόθεμα γεμίζει και τα έξοδα καταγράφονται. Αν μετά σκανάρεις την απόδειξη, μπορεί να συνδεθεί με το καλάθι για να μην μετρήσει δύο φορές.': 'At the end, the list is ticked off, the pantry is filled and spending is recorded. If you later scan the receipt, it can be linked to the cart so the expense is not counted twice.',
  'Σκάναρε το QR και τα έξοδα (και, αν θες, τα προϊόντα) μπαίνουν μόνα τους.': 'Scan the QR code and spending (and, if you want, the products) are added by themselves.',
  'Σκάναρε το QR της ηλεκτρονικής απόδειξης, όχι την κάρτα πόντων και όχι το barcode του ταμείου. Βλέπεις τα είδη πριν μπουν οπουδήποτε.': 'Scan the QR code on the electronic receipt, not the loyalty card and not the till barcode. You see the items before they go anywhere.',
  'Αν το QR είναι της ΑΑΔΕ και δεν έχει τα είδη, βγάλε φωτογραφία την απόδειξη ή γράψε το ποσό με το χέρι.': 'If the QR code is from AADE and has no items, take a photo of the receipt or type the amount by hand.',
  'Η σάρωση απόδειξης δεν τσεκάρει τη λίστα αγορών. Η ημερομηνία λήξης δεν έρχεται από την απόδειξη — μόνο από τον κωδικό στο ίδιο το προϊόν.': 'Scanning a receipt does not tick off the shopping list. The expiry date does not come from the receipt — only from the code on the product itself.',
  'Αν είναι βενζίνη ή διόδια, μπορείς να τη μεταφέρεις στις Μετακινήσεις.': 'If it is fuel or a toll, you can move it to Transport.',
  'Τι να μαγειρέψω': 'What should I cook',
  'Πάτα «Μαγείρεμα & γεύματα» και δες συνταγές που ταιριάζουν με το απόθεμά σου.': 'Tap «Cooking & meals» and see recipes that match your pantry.',
  'Ό,τι λείπει μπορείς να το βάλεις στη λίστα με ένα πάτημα, ή τη συνταγή στο πρόγραμμα της εβδομάδας.': 'You can add what’s missing to the list in one tap, or put the recipe on the week’s plan.',
  'Πρόγραμμα φαγητού': 'Meal plan',
  'Σχεδίασε την εβδομάδα και πάρε έτοιμη τη λίστα με ό,τι λείπει.': 'Plan the week and get a ready list of what’s missing.',
  'Στο «Πρόγραμμα γευμάτων» βάλε πρωινό, μεσημεριανό και βραδινό για κάθε μέρα, από συνταγή ή με ελεύθερο κείμενο.': 'In «Meal plan», add breakfast, lunch and dinner for each day, from a recipe or as free text.',
  'Πάτα «Ό,τι λείπει στη λίστα»: προστίθενται μόνο τα υλικά που δεν έχεις στο απόθεμα και δεν είναι ήδη στη λίστα. Δεν γίνεται αυτόματα μόλις προσθέσεις ένα γεύμα.': 'Tap «Missing items to the list»: only ingredients you don’t have in the pantry and that are not already on the list are added. This does not happen automatically when you add a meal.',
  'Μπορείς να αντιγράψεις την προηγούμενη εβδομάδα. Αν έχεις πρόγραμμα διατροφής, φωτογράφισε το χαρτί του διαιτολόγου και στείλε τα υλικά στη λίστα.': 'You can copy the previous week. If you have a diet plan, photograph the dietitian’s sheet and send the ingredients to the list.',
  'ΔΕΗ, νερό, ενοίκιο και συνδρομές: τι πληρώνεις και πότε.': 'Electricity, water, rent and subscriptions: what you pay and when.',
  'Πάτα «Προσθήκη λογαριασμού», βάλε ποσό και ημερομηνία λήξης. Αν επαναλαμβάνεται, διάλεξε κάθε πότε (π.χ. κάθε μήνα)· όταν τον πληρώνεις, ανοίγει μόνος του ο επόμενος.': 'Tap «Add bill», enter the amount and due date. If it repeats, choose how often (e.g. every month); when you pay it, the next one is created by itself.',
  'Αν πληρώνεται με πάγια εντολή, σημείωσέ το: την ημερομηνία λήξης σημειώνεται πληρωμένος, χωρίς υπενθύμιση.': 'If it is paid by direct debit, mark it as such: on the due date it is marked paid, with no reminder.',
  'Μπορείς να εισάγεις λογαριασμό από PDF ή φωτογραφία.': 'You can import a bill from a PDF or a photo.',
  'Πόσα ξόδεψες αυτόν τον μήνα, ανά κατηγορία, και σύγκριση με τον προηγούμενο.': 'How much you spent this month, by category, and a comparison with the previous one.',
  'Πάτα «Σύνολο εξόδων» για αγορές, ενοίκιο, λογαριασμούς, μετακινήσεις και μικροέξοδα του μήνα.': 'Tap «Spending overview» for this month’s shopping, rent, bills, transport and small expenses.',
  'Μπορείς να φτιάξεις δικές σου κατηγορίες εξόδων (π.χ. Ρούχα). Στο κοινό σπίτι με δύο μέλη βλέπεις και «Ποιος πλήρωσε τι».': 'You can create your own expense categories (e.g. Clothes). In a shared home with two members you also see «Who paid what».',
  'Δεν υπάρχει ακόμη εβδομαδιαίο σύνολο για όλα τα έξοδα, ούτε μηνιαίο όριο προϋπολογισμού για το νοικοκυριό. Προϋπολογισμός υπάρχει μόνο στο καλάθι, για μία επίσκεψη στο κατάστημα.': 'There is not yet a weekly total for all spending, nor a monthly budget limit for the household. A budget exists only in the cart, for one store visit.',
  'Βενζίνη, διόδια, ΜΜΜ, ταξί και στάθμευση, κάθε μήνα.': 'Fuel, tolls, public transport, taxis and parking, each month.',
  'Καταχώρισε ένα έξοδο μετακίνησης, ή μετάφερε μια απόδειξη καυσίμων ή διοδίων από τις Αποδείξεις.': 'Record a transport expense, or move a fuel or toll receipt from Receipts.',
  'Στα καύσιμα μπορείς να βάλεις λίτρα και χιλιόμετρα για την κατανάλωση. Τα μηνιαία πάγια (π.χ. κάρτα απεριορίστων) καταχωρούνται μόνα τους κάθε μήνα.': 'For fuel you can enter litres and kilometres for consumption. Monthly standing costs (e.g. an unlimited travel card) are recorded by themselves each month.',
  'Καφές, σάντουιτς και ό,τι μικρό πληρώνεις κάθε μέρα, με ένα πάτημα.': 'Coffee, a sandwich and any small daily payment, in one tap.',
  'Πάτα το κουμπί του εξόδου: καταχωρείται σήμερα, με την τελευταία τιμή που έβαλες.': 'Tap the expense button: it is recorded today, at the last price you entered.',
  'Φτιάξε τα δικά σου κουμπιά και άλλαξε τιμή ή ημερομηνία όταν χρειάζεται.': 'Create your own buttons and change the price or date when you need to.',
  'Τι πρέπει να γίνει και πότε, χωρίς να το θυμάσαι.': 'What needs doing and when, without you having to remember.',
  'Πρόσθεσε μια δουλειά και κάθε πόσες μέρες γίνεται. Πάτα «Έγινε» όταν την τελειώσεις.': 'Add a chore and how often it is done. Tap «Done» when you finish it.',
  'Μπορείς να ορίσεις ποιος την κάνει και αν θέλεις υπενθύμιση.': 'You can set who does it and whether you want a reminder.',
  'Η σύνδεση είναι προαιρετική· τη χρειάζεσαι μόνο για συγχρονισμό ή για να βλέπει όλη η οικογένεια τα ίδια.': 'Signing in is optional; you only need it to sync, or for the whole family to see the same data.',
  'Χωρίς λογαριασμό τα πάντα μένουν στο κινητό σου και η εφαρμογή δουλεύει κανονικά.': 'Without an account, everything stays on your phone and the app works as normal.',
  'Στις Ρυθμίσεις συνδέσου με Google ή email. Με «＋ Πρόσκληση μέλους» παίρνεις έναν κωδικό για το άλλο κινητό.': 'In Settings, sign in with Google or email. With «＋ Invite member» you get a code for the other phone.',
  'Όσο η εφαρμογή είναι ανοιχτή, οι αλλαγές φαίνονται σε λίγα δευτερόλεπτα. Δεν έρχεται ειδοποίηση όταν αγοράζει άλλο μέλος και έχεις την εφαρμογή κλειστή.': 'While the app is open, changes show up within a few seconds. You do not get a notification when another member buys something and the app is closed.',
  'Ειδοποιήσεις': 'Notifications',
  'Υπενθυμίσεις για λήξεις, λογαριασμούς και δουλειές, όταν τις ενεργοποιήσεις.': 'Reminders for expiries, bills and chores, once you turn them on.',
  'Στις Ρυθμίσεις πάτα «Ενεργοποίηση ειδοποιήσεων». Όταν ανοίγεις την εφαρμογή, μία φορά τη μέρα, σου θυμίζει ό,τι λήγει μέσα στις ημέρες που ορίζεις (προεπιλογή 3).': 'In Settings, tap «Turn on notifications». When you open the app, once a day, it reminds you of what expires within the number of days you set (default 3).',
  'Με κλειστή εφαρμογή, αν το επιτρέπει το κινητό σου, έρχονται υπενθυμίσεις κάθε πρωί περίπου στις 9:00.': 'With the app closed, if your phone allows it, reminders arrive every morning at about 9:00.',
  'Προαιρετικά, υπενθύμιση να σκανάρεις τα ψώνια σου αν περάσουν 7 μέρες χωρίς σάρωση (το πολύ μία την εβδομάδα).': 'Optionally, a reminder to scan your shopping if 7 days pass without a scan (at most once a week).',
  'Ρυθμίσεις και αντίγραφα': 'Settings and backups',
  'Εμφάνιση, αντίγραφο ασφαλείας και προσαρμογή της αρχικής.': 'Appearance, backup and home-screen layout.',
  'Εξαγωγή ή εισαγωγή αντιγράφου σε αρχείο (και με κωδικό). Προαιρετικά, κρυπτογραφημένο αντίγραφο στο δικό σου Google Drive, μία φορά τη μέρα (κρατάει τα 5 τελευταία).': 'Export or import a backup file (with a password if you want). Optionally, an encrypted copy in your own Google Drive, once a day (keeps the last 5).',
  'Ρύθμισε θέμα, μέγεθος γραμμάτων, τι φαίνεται στην αρχική και στην κάτω μπάρα, και δικά σου είδη προϊόντων.': 'Set the theme, text size, what appears on the home screen and the bottom bar, and your own product types.',
  'Αν δεν συνδεθείς και αλλάξεις κινητό ή καθαρίσεις τα δεδομένα του browser, χρειάζεσαι αντίγραφο για να τα πάρεις μαζί σου.': 'If you are not signed in and you change phone or clear the browser data, you need a backup to take your data with you.',
  'Χρήσιμα tips': 'Useful tips',
  'Μικρές λεπτομέρειες που γλιτώνουν λάθη.': 'Small details that help you avoid mistakes.',
  'Άνοιξε τη Σπιτοθήκη στο spitothiki.web.app. Από το μενού του browser (Chrome ή Safari) μπορείς να την προσθέσεις στην αρχική οθόνη του κινητού σου. Δεν χρειάζεται λογαριασμός.': 'Open Spitothiki at spitothiki.web.app. From the browser menu (Chrome or Safari) you can add it to your phone’s home screen. No account is needed.',
  'Η εφαρμογή είναι δωρεάν, χωρίς διαφημίσεις, και δουλεύει και χωρίς internet. Τα δεδομένα μένουν στο κινητό ώσπου να συνδεθείς.': 'The app is free, with no ads, and works offline too. Your data stays on the phone until you sign in.',
  'Μοίρασε τη λίστα αγορών με το κουμπί κοινοποίησης και, αν ψωνίζεις συχνά στο ίδιο κατάστημα, όρισε τη σειρά των διαδρόμων.': 'Share the shopping list with the share button and, if you often shop at the same store, set the aisle order.',
  'Για απορίες ή προβλήματα, γράψε στο oikoslabs.apps@gmail.com.': 'For questions or problems, write to oikoslabs.apps@gmail.com.'
};
