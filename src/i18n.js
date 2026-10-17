// Tiny i18n layer. Greek is the source language: keys are the Greek UI strings themselves,
// so `el` maps each key to itself and `en` holds the English translation of every key.
// Stored data (categories, units, locations) stays Greek; it is translated only when displayed.

export const LANG_KEY = 'spitothiki:lang';
export const LANGS = ['el', 'en'];

const EN = {
  // Shell / navigation
  'Σπιτοθήκη — Το σπίτι σε τάξη': 'Spitothiki — Your home in order',
  'Οργάνωσε τα τρόφιμα του σπιτιού, τις ημερομηνίες λήξης και τη λίστα αγορών σου.': 'Organise your household food, expiry dates and shopping list.',
  'Μετάβαση στο περιεχόμενο': 'Skip to content',
  'Κύρια πλοήγηση': 'Main navigation',
  'Σπιτοθήκη — αρχική': 'Spitothiki — home',
  'Σπιτοθήκη': 'Spitothiki',
  'Το σπίτι σε τάξη': 'Your home in order',
  'Ο ΧΩΡΟΣ ΜΟΥ': 'MY SPACE',
  'Επισκόπηση': 'Overview',
  'Το απόθεμά μου': 'My pantry',
  'Λίστα αγορών': 'Shopping list',
  'Ρυθμίσεις': 'Settings',
  'Τα δεδομένα σου μένουν εδώ': 'Your data stays here',
  'Αποθηκεύονται μόνο σε αυτή τη συσκευή.': 'Stored only on this device.',
  'ΠΡΩΤΗ ΕΚΔΟΣΗ · 0.1': 'FIRST VERSION · 0.1',
  'Μόνο στη συσκευή σου': 'Only on your device',
  'Προσθήκη προϊόντος': 'Add product',
  'Απλά, για το σπίτι.': 'Simply, for the home.',
  'Αντίγραφο ασφαλείας & απόρρητο': 'Backup & privacy',
  'Γλώσσα': 'Language',
  'Αλλαγή γλώσσας': 'Change language',
  'Διάλεξε τη γλώσσα της εφαρμογής. Τα δεδομένα σου δεν αλλάζουν.': 'Choose the app language. Your data does not change.',
  // Item dialog
  'ΤΟ ΑΠΟΘΕΜΑ ΜΟΥ': 'MY PANTRY',
  'Νέο προϊόν': 'New product',
  'Επεξεργασία προϊόντος': 'Edit product',
  'Κλείσιμο': 'Close',
  'Όνομα προϊόντος': 'Product name',
  'π.χ. Γάλα, ρύζι, ελαιόλαδο': 'e.g. Milk, rice, olive oil',
  'Σάρωση': 'Scan',
  'ή γράψε τον barcode': 'or type the barcode',
  'Αναζήτηση': 'Look up',
  'Κατηγορία': 'Category',
  'Πού βρίσκεται;': 'Where is it?',
  'Δεν ορίστηκε': 'Not set',
  'Ποσότητα': 'Quantity',
  'Μονάδα': 'Unit',
  'Υπενθύμιση κάτω από': 'Remind below',
  'Ημερομηνία λήξης': 'Expiry date',
  'Προαιρετικά. Θα σου δείξουμε τι πλησιάζει στη λήξη.': 'Optional. We will show you what is about to expire.',
  'Άκυρο': 'Cancel',
  'Αποθήκευση προϊόντος': 'Save product',
  'ΕΠΙΒΕΒΑΙΩΣΗ': 'CONFIRMATION',
  'Να συνεχίσω;': 'Continue?',
  'Όχι, πίσω': 'No, go back',
  'Ναι, συνέχισε': 'Yes, continue',
  'Σάρωση προϊόντος': 'Scan product',
  'Στόχευσε τον barcode με την κάμερα.': 'Point the camera at the barcode.',
  'ΛΙΣΤΑ ΑΓΟΡΩΝ': 'SHOPPING LIST',
  'Κοινοποίηση λίστας': 'Share list',
  'Κείμενο λίστας': 'List text',
  'Αντιγραφή': 'Copy',
  // Data values (displayed translated, stored in Greek)
  'Γαλακτοκομικά': 'Dairy', 'Φρούτα & λαχανικά': 'Fruit & vegetables', 'Κρέας & ψάρι': 'Meat & fish',
  'Ξηρά τρόφιμα': 'Dry goods', 'Κατεψυγμένα': 'Frozen', 'Ροφήματα': 'Drinks', 'Καθαριότητα': 'Cleaning', 'Άλλο': 'Other', 'Όλα': 'All',
  'Ντουλάπι': 'Cupboard', 'Ψυγείο': 'Fridge', 'Κατάψυξη': 'Freezer', 'Μπάνιο': 'Bathroom',
  'τεμ.': 'pcs', 'τεμάχια': 'pcs', 'πακέτα': 'packs', 'κιλά': 'kg', 'γραμμάρια': 'g', 'λίτρα': 'L',
  // Expiry
  'Έληξε {date}': 'Expired {date}', 'Λήγει σήμερα': 'Expires today', 'Λήγει αύριο': 'Expires tomorrow',
  'Λήγει σε {days} ημέρες': 'Expires in {days} days', 'Λήξη {date}': 'Expires {date}',
  'Η ημερομηνία λήξης είναι πάνω από ένα χρόνο πριν. Βεβαιώσου ότι είναι σωστή.': 'The expiry date is more than a year ago. Make sure it is correct.',
  'Η ημερομηνία λήξης είναι πάνω από 10 χρόνια μετά. Βεβαιώσου ότι είναι σωστή.': 'The expiry date is more than 10 years away. Make sure it is correct.',
  // Overview
  'ΣΠΙΤΟΘΗΚΗ': 'SPITOTHIKI',
  '{count} εκκρεμές προϊόν': '{count} pending item', '{count} εκκρεμή προϊόντα': '{count} pending items',
  'Χαμηλό απόθεμα': 'Low stock',
  'Μείωση ποσότητας για {name}': 'Decrease quantity of {name}', 'Αύξηση ποσότητας για {name}': 'Increase quantity of {name}',
  'Επεξεργασία {name}': 'Edit {name}', 'Διαγραφή {name}': 'Delete {name}', 'Στη λίστα': 'To list',
  'ΜΙΚΡΕΣ ΣΥΝΗΘΕΙΕΣ, ΠΙΟ ΗΡΕΜΟ ΣΠΙΤΙ': 'SMALL HABITS, A CALMER HOME',
  'Η κουζίνα σου,': 'Your kitchen,', 'με μια ματιά.': 'at a glance.',
  'Ξέρεις τι έχεις, τι τελειώνει και τι χρειάζεται να μπει στη λίστα.': 'Know what you have, what is running out and what needs to go on the list.',
  'Σύνοψη αποθέματος': 'Pantry summary',
  'προϊόντα στο σπίτι': 'products at home', 'λήγουν ή έληξαν': 'expiring or expired', 'χρειάζονται αναπλήρωση': 'need restocking',
  '⚠️ Έχεις {count} προϊόν που έχει λήξει. Έλεγξέ τα πριν τα χρησιμοποιήσεις.': '⚠️ You have {count} expired product. Check it before use.',
  '⚠️ Έχεις {count} προϊόντα που έχουν λήξει. Έλεγξέ τα πριν τα χρησιμοποιήσεις.': '⚠️ You have {count} expired products. Check them before use.',
  'Έλεγξε τις ημερομηνίες': 'Check the dates', 'Ό,τι λήγει μέσα στις επόμενες 7 ημέρες': 'Anything expiring in the next 7 days',
  'Όλο το απόθεμα': 'Whole pantry', 'Όλα καλά εδώ': 'All good here', 'Δεν έχεις προϊόντα που λήγουν σύντομα.': 'Nothing is expiring soon.',
  'Πρόσθεσε προϊόν': 'Add a product', 'Χρειάζονται αναπλήρωση': 'Need restocking', 'Με βάση το ελάχιστο απόθεμα': 'Based on minimum stock',
  'Δεν υπάρχει κάτι που να χρειάζεται αναπλήρωση.': 'Nothing needs restocking.', 'Όταν προσθέσεις προϊόντα, θα τα βλέπεις εδώ.': 'Once you add products, you will see them here.',
  'Δες το απόθεμα': 'View pantry', 'Γρήγορες κινήσεις': 'Quick actions', 'Τα βασικά, χωρίς ψάξιμο': 'The essentials, no searching',
  'Καταχώρισε κάτι που έφερες σπίτι': 'Log something you brought home', 'Άνοιξε τη λίστα': 'Open the list', '{pending} για ψώνια': '{pending} to buy',
  // Pantry
  '{count} προϊόν': '{count} product', '{count} προϊόντα': '{count} products',
  'Δεν βρήκα προϊόντα': 'No products found', 'Το απόθεμα είναι άδειο': 'The pantry is empty',
  'Δοκίμασε άλλη αναζήτηση ή κατηγορία.': 'Try another search or category.', 'Πρόσθεσε τα πρώτα προϊόντα που έχεις στο σπίτι.': 'Add the first products you have at home.',
  'Καθαρισμός φίλτρων': 'Clear filters', 'Όσα έχεις στο σπίτι, οργανωμένα σε ένα σημείο.': 'Everything you have at home, organised in one place.',
  'Αναζήτηση προϊόντος ή θέσης': 'Search product or location', 'Αναζήτηση στο απόθεμα': 'Search the pantry', 'Φίλτρο κατηγορίας': 'Category filter',
  // Shopping
  'Ολοκληρώθηκε: {name}': 'Done: {name}', 'Σημείωση ως αγορασμένο: {name}': 'Mark as bought: {name}',
  'Μπήκε στο απόθεμα': 'Added to pantry', 'Μπήκε στο καλάθι': 'In the basket', 'Αφαίρεση {name} από τη λίστα': 'Remove {name} from the list',
  'Σημείωσε όσα χρειάζεσαι και πάρε τη λίστα μαζί σου.': 'Note what you need and take the list with you.',
  'Τι χρειάζεται το σπίτι;': 'What does the home need?', 'Κανένα εκκρεμές προϊόν': 'No pending items',
  'Κοινοποίηση': 'Share', 'Καθάρισε τα αγορασμένα': 'Clear bought items', 'π.χ. Φέτα': 'e.g. Feta', 'Προϊόν για αγορά': 'Item to buy',
  'Προσθήκη': 'Add', 'Η λίστα είναι άδεια': 'The list is empty', 'Πρόσθεσε όσα χρειάζεσαι πριν πας για ψώνια.': 'Add what you need before you go shopping.',
  'Γράψε το πρώτο προϊόν': 'Write the first item', 'Μικρή υπενθύμιση': 'A small reminder',
  'Κράτησε τη λίστα απλή και πρόσθεσε μόνο ό,τι χρειάζεσαι.': 'Keep the list simple and add only what you need.',
  'Εκκρεμούν': 'Pending', 'Στο καλάθι': 'In basket', 'Στη συσκευή': 'On device', 'Ιδιωτικά': 'Private',
  '🛒 Λίστα αγορών (Σπιτοθήκη)': '🛒 Shopping list (Spitothiki)',
  // Settings
  'Διαχείριση και αντίγραφο ασφαλείας των δεδομένων σου.': 'Manage and back up your data.', 'Απόρρητο πρώτα': 'Privacy first',
  'Αυτή η έκδοση αποθηκεύει το απόθεμα και τη λίστα αγορών μόνο στον browser της συσκευής. Δεν υπάρχει λογαριασμός ή συγχρονισμός με cloud.': 'This version stores your pantry and shopping list only in this device’s browser. There is no account or cloud sync.',
  'Αν καθαρίσεις τα δεδομένα του browser ή αλλάξεις συσκευή, χρησιμοποίησε αντίγραφο ασφαλείας για να μεταφέρεις τα δεδομένα σου.': 'If you clear your browser data or change device, use a backup to move your data.',
  'Εμφάνιση': 'Appearance', 'Διάλεξε φωτεινό ή σκούρο θέμα, ή άφησέ το να ακολουθεί τη συσκευή.': 'Choose a light or dark theme, or follow the device.',
  'Θέμα': 'Theme', 'Αυτόματο': 'Automatic', 'Φωτεινό': 'Light', 'Σκούρο': 'Dark',
  'Αντίγραφο ασφαλείας': 'Backup', 'Εξήγαγε ή εισήγαγε ένα αρχείο JSON. Το αρχείο περιέχει τα προϊόντα και τη λίστα αγορών σου.': 'Export or import a JSON file containing your products and shopping list.',
  'Εξαγωγή αντιγράφου': 'Export backup', 'Εισαγωγή αντιγράφου': 'Import backup', 'Δοκιμαστικά δεδομένα': 'Sample data',
  'Γέμισε την εφαρμογή με ενδεικτικά προϊόντα για να δεις πώς λειτουργεί.': 'Fill the app with sample products to see how it works.',
  'Φόρτωση παραδειγμάτων': 'Load samples', 'Καθαρισμός δεδομένων': 'Clear data',
  'Διέγραψε όλα τα προϊόντα και τις λίστες από αυτή τη συσκευή.': 'Delete all products and lists from this device.', 'Διαγραφή όλων': 'Delete all',
  // Sync
  'Λάθος email ή κωδικός.': 'Wrong email or password.', 'Υπάρχει ήδη λογαριασμός με αυτό το email.': 'An account with this email already exists.',
  'Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες.': 'The password needs at least 6 characters.', 'Το email δεν είναι σωστό.': 'The email is not valid.',
  'Η σύνδεση ακυρώθηκε.': 'Sign-in was cancelled.', 'Το domain δεν έχει εγκριθεί στο Firebase (Authorized domains).': 'This domain is not authorised in Firebase (Authorized domains).',
  'Αυτός ο τρόπος σύνδεσης δεν έχει ενεργοποιηθεί στο Firebase.': 'This sign-in method is not enabled in Firebase.', 'Χωρίς σύνδεση στο internet.': 'No internet connection.',
  'Δεν επιτρέπεται (έλεγξε τον κωδικό πρόσκλησης ή τους κανόνες του Firestore).': 'Not allowed (check the invite code or the Firestore rules).',
  'Δεν βρέθηκε το νοικοκυριό.': 'Household not found.', 'Κάτι πήγε στραβά.': 'Something went wrong.',
  'Χωρίς σύνδεση: ο συγχρονισμός θα ξεκινήσει όταν επιστρέψει το internet.': 'Offline: sync will start when the internet is back.',
  'Δεν φόρτωσε το Firebase.': 'Firebase did not load.', 'Συγχρονισμός συσκευών': 'Device sync',
  'Ανενεργός. Για να μοιράζεσαι το απόθεμα και τη λίστα με άλλες συσκευές ή μέλη του σπιτιού, χρειάζεται ρύθμιση Firebase στο': 'Disabled. To share the pantry and list with other devices or household members, Firebase must be configured in',
  'Μέχρι τότε όλα μένουν μόνο σε αυτή τη συσκευή. Μπορείς να μεταφέρεις δεδομένα με το αντίγραφο ασφαλείας.': 'Until then everything stays on this device. You can move data with a backup.',
  'Σύνδεση…': 'Connecting…',
  'Συνδέσου για να συγχρονίζονται το απόθεμα και η λίστα σε όλες τις συσκευές σου. Τα δεδομένα αυτής της συσκευής θα ενωθούν με όσα έχεις ήδη.': 'Sign in to sync your pantry and list across all your devices. This device’s data will be merged with what you already have.',
  'Αποσυνδεδεμένος': 'Signed out', 'Σύνδεση με Google': 'Sign in with Google', 'Κωδικός': 'Password', 'Σύνδεση': 'Sign in',
  'Νέος λογαριασμός': 'New account', 'Ξέχασα τον κωδικό': 'Forgot password', 'Συνδεδεμένος': 'Signed in', 'Σφάλμα συγχρονισμού': 'Sync error',
  'Εκτός σύνδεσης: οι αλλαγές θα σταλούν μόλις επιστρέψει το internet.': 'Offline: changes will be sent when the internet is back.',
  'Συγχρονισμένο ✓': 'Synced ✓', 'Συνδεδεμένος ως': 'Signed in as', 'κοινό νοικοκυριό.': 'shared household.',
  'Πρόσκληση μέλους': 'Invite member', 'Αποχώρηση από νοικοκυριό': 'Leave household', 'Αποσύνδεση': 'Sign out',
  'Κωδικός πρόσκλησης': 'Invite code', 'Συμμετοχή': 'Join',
  'Με τη συμμετοχή σε άλλο νοικοκυριό, τα προϊόντα αυτής της συσκευής προστίθενται στο κοινό απόθεμα.': 'When you join another household, this device’s products are added to the shared pantry.',
  'Συνδέσου πρώτα.': 'Sign in first.', 'Ο κωδικός πρόσκλησης δεν είναι σωστός.': 'The invite code is not valid.',
  // Barcode / scanner
  'Ο κωδικός δεν είναι έγκυρος barcode.': 'This is not a valid barcode.', 'Υπάρχει ήδη στο απόθεμα ως «{name}».': 'Already in the pantry as “{name}”.',
  'Αναζήτηση στο Open Food Facts…': 'Searching Open Food Facts…',
  'Δεν βρέθηκε το προϊόν. Γράψε το όνομα και θα το θυμάμαι για αυτόν τον barcode.': 'Product not found. Type the name and I will remember it for this barcode.',
  'Βρέθηκε: {name}. Έλεγξε τα στοιχεία πριν την αποθήκευση.': 'Found: {name}. Check the details before saving.',
  'Χωρίς σύνδεση: η αναζήτηση δεν είναι διαθέσιμη.': 'Offline: lookup is not available.', 'Η αναζήτηση απέτυχε.': 'The lookup failed.',
  'Η αναζήτηση στο Open Food Facts απέτυχε.': 'The Open Food Facts lookup failed.', 'Δεν φόρτωσε ο σαρωτής. Έλεγξε τη σύνδεση.': 'The scanner did not load. Check your connection.',
  'Η κάμερα δεν είναι διαθέσιμη σε αυτόν τον browser.': 'The camera is not available in this browser.', 'Άνοιγμα κάμερας…': 'Opening camera…',
  'Δεν δόθηκε άδεια για την κάμερα. Μπορείς να γράψεις τον barcode με το χέρι.': 'Camera permission was not granted. You can type the barcode by hand.',
  'Δεν βρέθηκε κάμερα. Μπορείς να γράψεις τον barcode με το χέρι.': 'No camera found. You can type the barcode by hand.', 'Η σάρωση δεν είναι διαθέσιμη.': 'Scanning is not available.',
  // Notifications
  ' και {count} ακόμη': ' and {count} more', '1 προϊόν λήγει σύντομα': '1 product expires soon', '{count} προϊόντα λήγουν σύντομα': '{count} products expire soon',
  'Ο browser δεν υποστηρίζει ειδοποιήσεις.': 'This browser does not support notifications.',
  'Οι ειδοποιήσεις δεν επιτράπηκαν. Μπορείς να τις ενεργοποιήσεις από τις ρυθμίσεις του browser.': 'Notifications were not allowed. You can enable them in the browser settings.',
  'Οι ειδοποιήσεις ενεργοποιήθηκαν.': 'Notifications enabled.', 'Οι ειδοποιήσεις είναι μπλοκαρισμένες στις ρυθμίσεις του browser.': 'Notifications are blocked in the browser settings.',
  'Ενεργές': 'On', 'Ανενεργές': 'Off', 'Ειδοποιήσεις λήξης': 'Expiry notifications',
  'Όταν ανοίγεις την εφαρμογή, σου θυμίζουμε (μία φορά τη μέρα) ό,τι λήγει μέσα στις επόμενες ημέρες.': 'When you open the app, we remind you (once a day) of anything expiring in the next few days.',
  'Κατάσταση: {status}': 'Status: {status}', 'Ειδοποίηση για λήξη μέσα σε (ημέρες)': 'Notify for expiry within (days)',
  'Απενεργοποίηση': 'Turn off', 'Ενεργοποίηση ειδοποιήσεων': 'Turn on notifications',
  'Οι ειδοποιήσεις εμφανίζονται όταν ανοίγεις την εφαρμογή ή επιστρέφεις σε αυτή. Ειδοποιήσεις με την εφαρμογή κλειστή χρειάζονται server (push), που αυτή η έκδοση δεν έχει.': 'Notifications appear when you open or return to the app. Notifications while the app is closed need a push server, which this version does not have.',
  'Οι ειδοποιήσεις απενεργοποιήθηκαν.': 'Notifications turned off.',
  // Toasts & confirms
  'Δεν ήταν δυνατή η αποθήκευση στη συσκευή.': 'Could not save on this device.', 'Η λίστα δεν έχει εκκρεμή προϊόντα.': 'The list has no pending items.',
  'Η λίστα αντιγράφηκε.': 'List copied.', 'Το {name} προστέθηκε στη λίστα.': '{name} was added to the list.',
  'Το αντίγραφο ασφαλείας κατέβηκε.': 'Backup downloaded.', 'Η μέγιστη ποσότητα είναι {max}.': 'The maximum quantity is {max}.',
  'Θα αφαιρεθεί το «{name}» από το απόθεμα.': '“{name}” will be removed from the pantry.', 'Το προϊόν αφαιρέθηκε.': 'Product removed.',
  'Αφαίρεση προϊόντος;': 'Remove product?', 'Το προϊόν αφαιρέθηκε από τη λίστα.': 'Item removed from the list.',
  'Αποσυνδέθηκες. Τα δεδομένα μένουν σε αυτή τη συσκευή.': 'Signed out. Your data stays on this device.',
  'Δώσε αυτόν τον κωδικό στο άλλο μέλος (αντιγράφηκε): {code}': 'Give this code to the other member (copied): {code}',
  'Θα επιστρέψεις στο δικό σου νοικοκυριό. Τα κοινά προϊόντα θα μείνουν στο κοινό νοικοκυριό.': 'You will return to your own household. Shared products stay in the shared household.',
  'Αποχώρησες από το νοικοκυριό.': 'You left the household.', 'Αποχώρηση;': 'Leave?',
  'Η λίστα καθαρίστηκε.': 'List cleared.', 'Τα παραδείγματα φορτώθηκαν.': 'Samples loaded.',
  'Τα τωρινά δεδομένα θα αντικατασταθούν από δοκιμαστικά προϊόντα.': 'Your current data will be replaced with sample products.', 'Φόρτωση παραδειγμάτων;': 'Load samples?',
  'Θα διαγραφούν όλα τα προϊόντα και η λίστα αγορών από αυτή τη συσκευή.': 'All products and the shopping list will be deleted from this device.',
  ' Επειδή είσαι συνδεδεμένος, θα διαγραφούν και από τις συγχρονισμένες συσκευές.': ' Because you are signed in, they will also be deleted from your synced devices.',
  ' Φρόντισε να έχεις αντίγραφο αν τα χρειάζεσαι.': ' Make sure you have a backup if you need them.',
  'Τα δεδομένα διαγράφηκαν.': 'Data deleted.', 'Διαγραφή όλων των δεδομένων;': 'Delete all data?',
  'Το αντίγραφο περιέχει {items} προϊόντα και {shopping} είδη στη λίστα. Θα αντικαταστήσει τα τωρινά δεδομένα.': 'The backup contains {items} products and {shopping} list items. It will replace your current data.',
  'Το αντίγραφο εισήχθη.': 'Backup imported.', 'Εισαγωγή αντιγράφου;': 'Import backup?', 'Δεν ήταν δυνατή η εισαγωγή.': 'Import failed.',
  'Δεν ήταν δυνατή η ανάγνωση του αρχείου.': 'Could not read the file.', 'Οι αλλαγές αποθηκεύτηκαν.': 'Changes saved.', 'Το προϊόν προστέθηκε.': 'Product added.',
  'Έλεγξε τα στοιχεία και δοκίμασε ξανά.': 'Check the details and try again.', 'Γράψε το email σου.': 'Enter your email.',
  'Σου στείλαμε email για νέο κωδικό.': 'We sent you a password reset email.', 'Γράψε τον κωδικό πρόσκλησης.': 'Enter the invite code.',
  'Μπήκες στο κοινό νοικοκυριό.': 'You joined the shared household.', 'Προστέθηκε στη λίστα αγορών.': 'Added to the shopping list.', 'Έλεγξε τα στοιχεία.': 'Check the details.',
  // Domain / storage errors
  'Χρειάζεται όνομα προϊόντος.': 'A product name is required.', 'Η ποσότητα πρέπει να είναι αριθμός μηδέν ή μεγαλύτερος.': 'Quantity must be a number zero or greater.',
  'Η ποσότητα δεν μπορεί να ξεπερνά τα 99999.': 'Quantity cannot exceed 99999.', 'Η ελάχιστη ποσότητα πρέπει να είναι μηδέν ή μεγαλύτερη.': 'Minimum quantity must be zero or greater.',
  'Η ελάχιστη ποσότητα δεν μπορεί να ξεπερνά τα 99999.': 'Minimum quantity cannot exceed 99999.', 'Η ποσότητα πρέπει να είναι μεγαλύτερη από μηδέν.': 'Quantity must be greater than zero.',
  'Τα δεδομένα αποθήκευσης δεν έχουν έγκυρη μορφή.': 'The stored data is not in a valid format.', 'Το αρχείο αντιγράφου δεν είναι έγκυρο JSON.': 'The backup file is not valid JSON.',
  'Το αρχείο αντιγράφου έχει μη έγκυρη μορφή.': 'The backup file has an invalid format.'
};

export const dictionaries = { el: Object.fromEntries(Object.keys(EN).map((key) => [key, key])), en: EN };

// Messages built by domain.js with data inside them; matched by pattern so domain.js stays untouched.
const unitEn = (unit) => EN[unit] || unit;
const PATTERNS_EN = [
  [/^Το «(.+)» έχει άλλη μονάδα \((.+)\), οπότε το απόθεμα δεν άλλαξε\.$/, (m, name, unit) => `“${name}” uses a different unit (${unitEn(unit)}), so the pantry was not changed.`],
  [/^Προστέθηκαν (\S+) (.+) «(.+)» στο απόθεμα\.$/, (m, n, unit, name) => `Added ${n} ${unitEn(unit)} of “${name}” to the pantry.`],
  [/^Το «(.+)» μπήκε στο απόθεμα\.$/, (m, name) => `“${name}” was added to the pantry.`],
  [/^Αφαιρέθηκαν (\S+) (.+) «(.+)» από το απόθεμα\.$/, (m, n, unit, name) => `Removed ${n} ${unitEn(unit)} of “${name}” from the pantry.`]
];

export function detectLanguage(saved, browserLang) {
  if (LANGS.includes(saved)) return saved;
  return String(browserLang || '').toLowerCase().startsWith('en') ? 'en' : 'el';
}

let lang = 'el';
try { lang = detectLanguage(localStorage.getItem(LANG_KEY), navigator.language); } catch { lang = detectLanguage(null, globalThis.navigator?.language); }

export const getLang = () => lang;
export const locale = () => (lang === 'en' ? 'en-GB' : 'el-GR');
export function setLang(next) {
  if (!LANGS.includes(next)) return;
  lang = next;
  try { localStorage.setItem(LANG_KEY, next); } catch {}
}

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

// Translate a key (Greek source string). Unknown strings are returned unchanged (e.g. user data, server messages).
export function t(key, vars) {
  const source = String(key ?? '');
  if (lang === 'el') return fill(source, vars);
  if (Object.hasOwn(EN, source)) return fill(EN[source], vars);
  for (const [re, fn] of PATTERNS_EN) if (re.test(source)) return source.replace(re, fn);
  return fill(source, vars);
}

// Display-time translation of stored values (categories, units, locations).
export const tv = (value) => t(value);

// Translates static and rendered markup in place: text nodes and placeholder/aria-label/title attributes
// whose (trimmed, icon-stripped) text is a known key. Originals are remembered so switching back works.
const ORIG = new WeakMap();
const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP = '.product-name, .shopping-row-name, textarea, script, style, code, [data-no-i18n]';
const SPLIT = /^([^\p{L}]*?)(\p{L}[\s\S]*?)([\s→›]*)$/u;

function translateText(original) {
  const match = original.match(SPLIT);
  if (!match) return original;
  const [, pre, core, post] = match;
  if (lang === 'el') return original;
  const direct = Object.hasOwn(EN, core) ? EN[core] : Object.hasOwn(EN, core.trim()) ? EN[core.trim()] : null;
  return direct === null ? original : `${pre}${direct}${post}`;
}

export function translateDom(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(SKIP) || !node.nodeValue.trim()) continue;
    if (!ORIG.has(node)) ORIG.set(node, node.nodeValue);
    node.nodeValue = translateText(ORIG.get(node));
  }
  const elements = root.querySelectorAll ? [root, ...root.querySelectorAll('[placeholder], [aria-label], [title]')] : [];
  for (const el of elements) {
    if (!el.getAttribute || el.closest?.('[data-no-i18n]')) continue;
    let saved = ORIG.get(el);
    for (const name of ATTRS) {
      if (!el.hasAttribute(name)) continue;
      if (!saved) { saved = {}; ORIG.set(el, saved); }
      if (!(name in saved)) saved[name] = el.getAttribute(name);
      el.setAttribute(name, translateText(saved[name]));
    }
  }
}

// Greek text still visible in English mode (for tests): ignores user data containers.
export function untranslatedGreek(root = document.body) {
  if (lang === 'el') return [];
  const found = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(SKIP + ', .toast')) continue;
    if (/[\u0370-\u03ff\u1f00-\u1fff]/.test(node.nodeValue)) found.push(node.nodeValue.trim());
  }
  for (const el of root.querySelectorAll('[placeholder], [aria-label], [title]')) {
    for (const name of ATTRS) { const v = el.getAttribute(name); if (v && /[\u0370-\u03ff]/.test(v) && !el.closest(SKIP)) found.push(`${name}=${v}`); }
  }
  return found;
}
