import { MAX_QUANTITY, expiringItems, createPantryItem, createShoppingItem, expiringWithin, expiryStatus, expiryWarning, normalizeSearch, normalizeUnit, pantrySummary, receiveShoppingItem, returnShoppingItem, shoppingListText, syncShoppingWithItem, toggleShoppingItem } from './domain.js';
import { decodeImageCodes, lookupBarcode, normalizeBarcode, startScanner } from './barcode.js';
import { isUrlCode, lastTollAmount, parseTollBarcode, parseTollText, tollAmountFromText } from './toll-barcode.js';
import { authProviders, firebaseConfig } from './firebase-config.js';
import { loadState, parseBackup, saveState } from './storage.js';
import { fetchReceipt, receiptId } from './receipt.js';
import { fetchMealDbSuggestions, ingredientName, pantryIngredients, suggestBuiltin } from './recipes.js';
import { CATEGORIES, WASTE_REASONS, applyWaste, createStore, createWaste, groupByStore, monthKey, rowCategory, monthlySpending, moveCategory, purchaseFor, shiftMonth, storeOrder, wasteStats } from './features.js';
import { RECURRING_INTERVALS, applyRecurring, createRecurring, dueFromSnapshot, expirySnapshot, parseVoiceItems } from './features.js';
import { MEAL_SLOTS, copyPreviousWeek, createMeal, recipeFromMealDb, shiftDays, weekDays, weekShoppingNeeds, weekStart } from './mealplan.js';
import { BUILTIN_RECIPES } from './recipes.js';
import { BILL_ICONS, BILL_PERIODS, BILL_TYPES, billStats, billsDue, createBill, guessBillType, paidHistory, parseBillCode, unpaidBills, payBill, unpayBill } from './bills.js';
import { findDuplicateBill, readBillFile } from './bill-pdf.js';
import { addCartItem, budgetState, createTrip, finishTrip, lastPrice, lineTotal, remainingShopping, removeCartItem, tripForReceipt, updateCartItem } from './cart.js';
import { VM_MODES, interpretCode } from './gs1.js';
import { TRANSPORT_ICONS, TRANSPORT_TYPES, applyTransportRecurring, classifyReceipt, consumptionFor, createTransport, createTransportRecurring, fuelStats, pricePerLiter, transportMonth } from './transport.js';
import { EXTRA_DEFAULT_EMOJI, EXTRA_SUGGESTIONS, LEGACY_EXTRA_CATEGORIES, createExtra, createExtraCategory, deleteExtraCategory, extraCategories, findExtraCategory, suggestEmoji, extrasMonth, extrasSummary, lastUnitPrice, quickExtra, setExtraQty, unitPrice } from './extras.js';
import { getLang, locale, setLang, t, translateDom, untranslatedGreek } from './i18n.js';

const viewRoot = document.querySelector('#view-content');
const itemDialog = document.querySelector('#item-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
const itemForm = document.querySelector('#item-form');
const backupFile = document.querySelector('#backup-file');
const toast = document.querySelector('#toast');

let state = loadState();
const VIEWS = ['overview', 'pantry', 'shopping', 'cart', 'cook', 'bills', 'transport', 'extras', 'insights', 'settings'];
let activeView = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
let pantryQuery = '';
let pantryCategory = 'Όλα';
let pantryStatus = ''; // '' | 'expiring' (opened from the home card «λήγουν ή έληξαν»)
let toastTimer;
let confirmAction = null;

const CATEGORY_ICONS = {
  'Γαλακτοκομικά': '🥛', 'Φρούτα & λαχανικά': '🥬', 'Κρέας & ψάρι': '🍗',
  'Ξηρά τρόφιμα': '🌾', 'Κατεψυγμένα': '🧊', 'Ροφήματα': '☕',
  'Καθαριότητα': '🧽', 'Άλλο': '🧺'
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const options = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return new Intl.DateTimeFormat(locale(), options).format(date);
}

function daysUntil(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const [ty, tm, td] = localDateKey().split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(ty, tm - 1, td);
  if (!Number.isFinite(target) || !Number.isFinite(today)) return null;
  return Math.round((target - today) / 86_400_000);
}

function expiryLabel(value) {
  const status = expiryStatus(value, localDateKey());
  const days = daysUntil(value);
  if (status === 'none') return '';
  if (status === 'expired') return t('Έληξε {date}', { date: formatDate(value) });
  if (days === 0) return t('Λήγει σήμερα');
  if (days === 1) return t('Λήγει αύριο');
  if (status === 'soon') return t('Λήγει σε {days} ημέρες', { days });
  return t('Λήξη {date}', { date: formatDate(value) });
}

function showToast(message) {
  toast.textContent = t(message);
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function persist() {
  try {
    saveState(state);
    renderNavCounts();
    sync?.push();
    scheduleBackgroundSnapshot();
    return true;
  } catch {
    showToast('Δεν ήταν δυνατή η αποθήκευση στη συσκευή.');
    return false;
  }
}

function renderNavCounts() {
  document.querySelector('#nav-pantry-count').textContent = String(state.items.length);
  document.querySelector('#nav-shopping-count').textContent = String(state.shopping.filter((item) => !item.checked).length);
  const billCount = document.querySelector('#nav-bills-count');
  if (billCount) { const due = billsDue(state.bills || [], localDateKey()).length; billCount.textContent = String(due); billCount.hidden = !due; }
}

function pendingLabel(count) {
  return t(count === 1 ? '{count} εκκρεμές προϊόν' : '{count} εκκρεμή προϊόντα', { count });
}

const SECTION_LABELS = { overview: 'Σπιτοθήκη', pantry: 'Το απόθεμά μου', shopping: 'Λίστα αγορών', cart: 'Καλάθι στο κατάστημα', cook: 'Μαγείρεμα', bills: 'Λογαριασμοί', transport: 'Μετακινήσεις', extras: 'Μικροέξοδα', insights: 'Σύνολο εξόδων', settings: 'Ρυθμίσεις' };
function setActiveNavigation() {
  document.body.dataset.screen = activeView;
  const current = document.querySelector('#current-section');
  if (current) current.textContent = t(SECTION_LABELS[activeView] || 'Σπιτοθήκη');
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === activeView;
    button.classList.toggle('is-active', active);
    if (button.classList.contains('nav-item')) {
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  });
}

// Collapsible panels (<details class="collapsible" id>) stay open across re-renders once the user opens them.
const openPanels = new Set();
const openAttr = (id) => (openPanels.has(id) ? 'open' : '');
document.addEventListener('toggle', (event) => { const d = event.target; if (d.matches?.('details.collapsible[id]')) { if (d.open) openPanels.add(d.id); else openPanels.delete(d.id); } }, true);

// Which menu group each section belongs to (shown as a breadcrumb under the top bar: ⌂ Αρχική › ΕΞΟΔΑ).
const SECTION_GROUPS = { pantry: 'ΣΠΙΤΙ', shopping: 'ΣΠΙΤΙ', cart: 'ΣΠΙΤΙ', cook: 'ΣΠΙΤΙ', bills: 'ΕΞΟΔΑ', transport: 'ΕΞΟΔΑ', extras: 'ΕΞΟΔΑ', insights: 'ΕΞΟΔΑ', settings: 'ΕΦΑΡΜΟΓΗ' };
function renderCrumbs() {
  const group = SECTION_GROUPS[activeView];
  return `<nav class="eyebrow crumbs" aria-label="${escapeHtml(t('Πού βρίσκομαι'))}"><button class="crumb-home" type="button" data-view="overview">⌂ ${escapeHtml(t('Αρχική'))}</button>${group ? `<span aria-hidden="true">›</span><span>${escapeHtml(t(group))}</span>` : ''}</nav>`;
}

// Most common actions: bottom bar on phones (first four + "all"), the quick-actions sheet and the home screen.
const QUICK_ACTIONS = [
  { id: 'receipt', icon: '🧾', label: 'Σάρωση απόδειξης', hint: 'Ψώνια, καύσιμα ή διόδια με ένα QR/barcode' },
  { id: 'list', icon: '✓', label: 'Πρόσθεσε στη λίστα', hint: 'Κάτι που χρειάζεται το σπίτι' },
  { id: 'extra', icon: '☕', label: 'Μικροέξοδο', hint: 'Καφές, σάντουιτς, καπνός με ένα πάτημα' },
  { id: 'transport', icon: '⛽', label: 'Καύσιμα / μετακίνηση', hint: 'Βενζίνη, διόδια, ΜΜΜ, ταξί' },
  { id: 'bill', icon: '📄', label: 'Νέος λογαριασμός', hint: 'ΔΕΗ, νερό, ενοίκιο, συνδρομές' },
  { id: 'product', icon: '＋', label: 'Πρόσθεσε προϊόν', hint: 'Κάτι που έφερες σπίτι' },
  { id: 'cart', icon: '🛒', label: 'Καλάθι στο κατάστημα', hint: 'Σκάναρε ό,τι βάζεις στο καρότσι' },
  { id: 'cook', icon: '🍳', label: 'Τι να μαγειρέψω;', hint: 'Ιδέες με ό,τι λήγει πρώτο' }
];
const renderQuickActions = (ids) => QUICK_ACTIONS.filter((a) => !ids || ids.includes(a.id)).map((a) => `<button class="quick-action" type="button" data-action="quick" data-quick="${a.id}"><span class="quick-action-icon" aria-hidden="true">${a.icon}</span><span><strong>${escapeHtml(t(a.label))}</strong><small>${escapeHtml(t(a.hint))}</small></span><span class="arrow" aria-hidden="true">›</span></button>`).join('');
function runQuickAction(id) {
  const sheet = document.querySelector('#quick-sheet');
  if (sheet?.open) sheet.close();
  const focus = (selector, block = 'center') => requestAnimationFrame(() => { const el = document.querySelector(selector); el?.scrollIntoView({ block }); if (el?.matches('input, select')) el.focus({ preventScroll: true }); });
  if (id === 'all') { document.querySelector('#quick-sheet-list').innerHTML = renderQuickActions(); translateDom(sheet); sheet.showModal(); }
  else if (id === 'receipt') openReceiptDialog();
  else if (id === 'product') openItemDialog();
  else if (id === 'list') { navigate('shopping'); focus('#shopping-form input[name="name"]'); }
  else if (id === 'extra') { navigate('extras'); focus('#extras-quick-panel', 'start'); }
  else if (id === 'transport') { transportDraft = null; navigate('transport'); focus('#transport-amount'); }
  else if (id === 'bill') { navigate('bills'); openBillDialog(); }
  else if (id === 'cart' || id === 'cook') navigate(id);
}

function renderHeader(title, description, actionLabel = '') {
  return `<header class="page-heading"><div>${renderCrumbs()}<h1>${title}</h1><p>${description}</p></div>${actionLabel ? `<button class="button button-primary" type="button" data-action="add-item"><span aria-hidden="true">＋</span>${actionLabel}</button>` : ''}</header>`;
}

function renderEmpty(title, description, action = 'add-item', label = 'Προσθήκη προϊόντος', emoji = '🧺') {
  return `<div class="empty-state"><span class="empty-art" aria-hidden="true">${emoji}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p><button class="button button-primary" type="button" data-action="${action}">${escapeHtml(label)}</button></div>`;
}

function renderExpiryPill(item) {
  if (!item.expiry) return '';
  const status = expiryStatus(item.expiry, localDateKey());
  const variant = status === 'expired' ? 'expired' : status === 'soon' ? '' : 'fresh';
  return `<span class="expiry-pill ${variant}">${status === 'expired' ? '!' : status === 'soon' ? '◷' : '✓'} ${escapeHtml(expiryLabel(item.expiry))}</span>`;
}

function renderMiniProduct(item) {
  const icon = CATEGORY_ICONS[item.category] || '🧺';
  return `<div class="product-row"><span class="product-emoji" aria-hidden="true">${icon}</span><div class="product-main"><strong class="product-name">${escapeHtml(item.name)}</strong><div class="product-detail"><span>${escapeHtml(t(item.category || 'Άλλο'))}</span>${renderExpiryPill(item)}</div></div><span class="quantity-chip">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))}</span></div>`;
}

function renderInventoryCard(item) {
  const icon = CATEGORY_ICONS[item.category] || '🧺';
  const location = item.location ? `<span class="meta-tag">${escapeHtml(t(item.location))}</span>` : '';
  const expiry = item.expiry ? `<span class="meta-tag">${escapeHtml(expiryLabel(item.expiry))}</span>` : '';
  const low = Number(item.minimum) > 0 && Number(item.quantity) <= Number(item.minimum);
  const lowTag = low ? '<span class="meta-tag low-stock-tag">Χαμηλό απόθεμα</span>' : '';
  return `<article class="inventory-card">
    <span class="product-emoji" aria-hidden="true">${icon}</span>
    <div class="product-main"><strong class="product-name">${escapeHtml(item.name)}</strong><div class="inventory-meta"><span class="meta-tag">${escapeHtml(t(item.category || 'Άλλο'))}</span>${location}${expiry}${lowTag}</div><span class="quantity-chip">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))}</span></div>
    <div class="card-actions">
      <button class="icon-button" type="button" data-action="adjust-quantity" data-id="${escapeHtml(item.id)}" data-delta="-1" aria-label="${escapeHtml(t('Μείωση ποσότητας για {name}', { name: item.name }))}">−</button>
      <button class="icon-button" type="button" data-action="adjust-quantity" data-id="${escapeHtml(item.id)}" data-delta="1" aria-label="${escapeHtml(t('Αύξηση ποσότητας για {name}', { name: item.name }))}">＋</button>
      <button class="icon-button" type="button" data-action="edit-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Επεξεργασία {name}', { name: item.name }))}">✎</button>
      <button class="icon-button" type="button" data-action="waste-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Πετάχτηκε: {name}', { name: item.name }))}" title="${escapeHtml(t('Πετάχτηκε: {name}', { name: item.name }))}">🗑</button>
      <button class="icon-button danger" type="button" data-action="delete-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Διαγραφή {name}', { name: item.name }))}">×</button>
      <button class="button button-quiet small-action" type="button" data-action="add-to-shopping" data-id="${escapeHtml(item.id)}">Στη λίστα</button>
    </div>
  </article>`;
}

function renderOverview() {
  const today = localDateKey();
  const summary = pantrySummary(state.items, today);
  const upcoming = expiringItems(state.items, today)
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry))).slice(0, 3);
  const month = monthKey(today);
  const totals = monthTotals(month);
  const pending = state.shopping.filter((item) => !item.checked).length;
  const due = billsDue(state.bills || [], today);
  return `<section class="hero-panel home-hero"><div class="hero-copy"><p class="eyebrow">ΜΙΚΡΕΣ ΣΥΝΗΘΕΙΕΣ, ΠΙΟ ΗΡΕΜΟ ΣΠΙΤΙ</p><h1>Η Σπιτοθήκη σου<br>με μια ματιά</h1><p>Τι έχεις στο σπίτι, τι λήγει, τι χρειάζεται η λίστα και πόσα ξοδεύεις κάθε μήνα.</p></div><div class="hero-illustration" aria-hidden="true"><span>🫒</span></div></section>
    ${summary.expired ? `<div class="alert-banner" role="status">${t(summary.expired === 1 ? '⚠️ Έχεις {count} προϊόν που έχει λήξει. Έλεγξέ τα πριν τα χρησιμοποιήσεις.' : '⚠️ Έχεις {count} προϊόντα που έχουν λήξει. Έλεγξέ τα πριν τα χρησιμοποιήσεις.', { count: summary.expired })}</div>` : ''}
    <section class="stats-grid home-stats" aria-label="Σύνοψη αποθέματος">
      <button class="stat-card" type="button" data-action="home-card" data-card="all" id="home-card-all"><span class="stat-icon">🧺</span><div><strong>${summary.products}</strong><span>προϊόντα στο σπίτι</span></div></button>
      <button class="stat-card" type="button" data-action="home-card" data-card="expiring" id="home-card-expiring"><span class="stat-icon amber">◷</span><div><strong>${summary.expiringSoon + summary.expired}</strong><span>λήγουν ή έληξαν</span></div></button>
      <button class="stat-card" type="button" data-action="home-card" data-card="shopping" id="home-card-shopping"><span class="stat-icon blue">✓</span><div><strong>${pending}</strong><span>${escapeHtml(t('στη λίστα αγορών'))}</span></div></button>
    </section>
    <div class="dashboard-grid">
      <section class="panel" id="home-month"><div class="panel-heading"><div><h2>${escapeHtml(t('Τα έξοδα του μήνα'))}</h2><p data-no-i18n>${escapeHtml(monthLabel(month))}</p></div><button class="panel-link" type="button" data-view="insights">${escapeHtml(t('Αναλυτικά →'))}</button></div>
        <p class="big-number" id="home-month-total">${escapeHtml(money(totals.total))}</p>${renderBars(totals.rows, money)}
        ${due.length ? `<button class="alert-banner home-bills-due" type="button" data-view="bills">📄 ${escapeHtml(t('{count} λογαριασμοί λήγουν σύντομα ή έχουν λήξει', { count: due.length }))} ›</button>` : ''}</section>
      <section class="panel quick-panel" id="home-quick"><div class="panel-heading"><div><h2>Γρήγορες κινήσεις</h2><p>Τα βασικά, χωρίς ψάξιμο</p></div></div><div class="quick-actions quick-grid">${renderQuickActions(['receipt', 'list', 'extra', 'transport', 'bill', 'product'])}</div></section>
      <section class="panel" id="home-expiry"><div class="panel-heading"><div><h2>Έλεγξε τις ημερομηνίες</h2><p>Ό,τι λήγει μέσα στις επόμενες 7 ημέρες</p></div><button class="panel-link" type="button" data-action="home-card" data-card="expiring">${escapeHtml(t('Όλα όσα λήγουν →'))}</button></div><div class="product-list">${upcoming.length ? upcoming.map(renderMiniProduct).join('') : renderEmpty('Όλα καλά εδώ', 'Δεν έχεις προϊόντα που λήγουν σύντομα.', 'add-item', 'Πρόσθεσε προϊόν', '🌿')}</div></section>
    </div>`;
}

function renderPantryList() {
  const list = document.querySelector('#inventory-list');
  const count = document.querySelector('#inventory-count');
  if (!list || !count) return;
  const q = normalizeSearch(pantryQuery.trim());
  const source = pantryStatus === 'expiring' ? expiringItems(state.items, localDateKey()) : state.items;
  const filtered = source.filter((item) => {
    const matchesText = !q || normalizeSearch(`${item.name} ${item.category} ${item.location} ${t(item.category)} ${t(item.location)}`).includes(q);
    const matchesCategory = pantryCategory === 'Όλα' || item.category === pantryCategory;
    return matchesText && matchesCategory;
  });
  if (pantryStatus !== 'expiring') filtered.sort((a, b) => a.name.localeCompare(b.name, getLang()));
  count.textContent = t(filtered.length === 1 ? '{count} προϊόν' : '{count} προϊόντα', { count: filtered.length });
  list.innerHTML = filtered.length ? filtered.map(renderInventoryCard).join('') : renderEmpty(state.items.length ? 'Δεν βρήκα προϊόντα' : 'Το απόθεμα είναι άδειο', state.items.length ? 'Δοκίμασε άλλη αναζήτηση ή κατηγορία.' : 'Πρόσθεσε τα πρώτα προϊόντα που έχεις στο σπίτι.', state.items.length ? 'clear-filters' : 'add-item', state.items.length ? 'Καθαρισμός φίλτρων' : 'Προσθήκη προϊόντος');
  translateDom(list);
  translateDom(count);
}

function renderReceiptButton() {
  return '<button class="button button-quiet" type="button" data-action="open-receipt">🧾 Σάρωση απόδειξης</button>';
}

function renderPantry() {
  const categories = ['Όλα', ...new Set(state.items.map((item) => item.category || 'Άλλο'))];
  return `${renderHeader('Το απόθεμά μου', 'Όσα έχεις στο σπίτι, οργανωμένα σε ένα σημείο.', 'Προσθήκη προϊόντος')}
    <div class="settings-actions page-actions">${renderReceiptButton()}</div>
    <section class="panel"><div class="toolbar"><label class="search-wrap"><span aria-hidden="true">⌕</span><input id="pantry-search" class="search-input" type="search" value="${escapeHtml(pantryQuery)}" placeholder="Αναζήτηση προϊόντος ή θέσης" aria-label="Αναζήτηση στο απόθεμα"></label><span class="inventory-count" id="inventory-count">${t('{count} προϊόντα', { count: state.items.length })}</span></div>
    ${pantryStatus === 'expiring' ? `<div class="active-filter" id="pantry-status-filter" role="status"><span>${escapeHtml(t('Εμφανίζονται μόνο όσα λήγουν μέσα σε 7 ημέρες ή έληξαν, πρώτα τα πιο επείγοντα.'))}</span><button type="button" class="filter-chip is-active" data-action="clear-pantry-status" aria-label="${escapeHtml(t('Κατάργηση φίλτρου: Λήγουν ή έληξαν'))}">◷ ${escapeHtml(t('Λήγουν ή έληξαν'))} ×</button></div>` : ''}
    <div class="filter-row" aria-label="Φίλτρο κατηγορίας">${categories.map((category) => `<button type="button" class="filter-chip ${pantryCategory === category ? 'is-active' : ''}" data-action="filter-category" data-category="${escapeHtml(category)}" aria-pressed="${pantryCategory === category}">${category === 'Όλα' ? '' : `<span aria-hidden="true">${CATEGORY_ICONS[category] || '🧺'}</span> `}${escapeHtml(category)}</button>`).join('')}</div>
    <div id="inventory-list" class="inventory-list"></div></section>`;
}

function renderShoppingRow(item) {
  return `<div class="shopping-row ${item.checked ? 'checked has-price' : ''}"><input class="shopping-check" type="checkbox" data-action="toggle-shopping" data-id="${escapeHtml(item.id)}" ${item.checked ? 'checked' : ''} aria-label="${escapeHtml(t(item.checked ? 'Ολοκληρώθηκε: {name}' : 'Σημείωση ως αγορασμένο: {name}', { name: item.name }))}"><div><strong class="shopping-row-name">${escapeHtml(item.name)}</strong><div class="shopping-row-detail">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))}</div></div><span class="shopping-state">${item.checked ? (item.pantryAdded ? 'Μπήκε στο απόθεμα' : 'Μπήκε στο καλάθι') : ''}</span>${item.checked ? renderPriceField(item) : ''}<button class="icon-button danger" type="button" data-action="remove-shopping" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Αφαίρεση {name} από τη λίστα', { name: item.name }))}">×</button></div>`;
}

function renderPriceField(row) {
  const purchase = (state.purchases || []).find((p) => p.id === `pur-${row.id}`);
  const label = t('Τιμή για {name}', { name: row.name });
  return `<label class="price-field" title="${escapeHtml(label)}"><span aria-hidden="true">€</span><input class="field-input price-input" type="number" inputmode="decimal" min="0" max="100000" step="0.01" data-id="${escapeHtml(row.id)}" value="${purchase ? escapeHtml(purchase.price) : ''}" placeholder="Τιμή" aria-label="${escapeHtml(label)}"></label>`;
}

const STORE_KEY = 'spitothiki:store';
let storesOpen = false;
const activeStore = () => { let id = ''; try { id = localStorage.getItem(STORE_KEY) || ''; } catch {} return (state.stores || []).find((store) => store.id === id) || null; };
const categoryLabel = (category) => `${CATEGORY_ICONS[category] || '🧺'} ${t(category)}`;

function renderStoreBar() {
  const current = activeStore();
  const stores = state.stores || [];
  const chip = (id, label, active) => `<button type="button" class="filter-chip ${active ? 'is-active' : ''}" data-action="set-store" data-store="${escapeHtml(id)}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
  const bar = `<div class="store-bar" role="group" aria-label="Σειρά λίστας ανά κατάστημα">${chip('', 'Χωρίς κατάστημα', !current)}${stores.map((store) => chip(store.id, store.name, current?.id === store.id)).join('')}<button type="button" class="panel-link" data-action="toggle-stores" aria-expanded="${storesOpen}">⚙ Καταστήματα</button></div>`;
  if (!storesOpen) return bar;
  const order = current ? storeOrder(current.order) : [];
  return `${bar}<div class="store-manager" id="store-manager"><form id="store-form" class="store-form" novalidate><input class="field-input" name="name" maxlength="40" placeholder="π.χ. Σουπερμάρκετ της γειτονιάς" aria-label="Όνομα καταστήματος"><button class="button button-quiet" type="submit">＋ Νέο κατάστημα</button></form>
    ${current ? `<p class="field-hint">${escapeHtml(t('Σειρά διαδρόμων στο «{name}»: βάλε τις κατηγορίες με τη σειρά που περπατάς.', { name: current.name }))}</p><ol class="aisle-list">${order.map((category, index) => `<li class="aisle-row"><span class="aisle-number">${index + 1}</span><span class="aisle-name">${escapeHtml(categoryLabel(category))}</span><button class="icon-button" type="button" data-action="aisle-up" data-category="${escapeHtml(category)}" ${index === 0 ? 'disabled' : ''} aria-label="${escapeHtml(t('Πιο νωρίς: {name}', { name: t(category) }))}">↑</button><button class="icon-button" type="button" data-action="aisle-down" data-category="${escapeHtml(category)}" ${index === order.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('Πιο αργά: {name}', { name: t(category) }))}">↓</button></li>`).join('')}</ol>
    <details class="vm-settings" id="vm-settings"><summary>${escapeHtml(t('Barcode ζυγιζόμενων (20–29)'))}</summary><p class="field-hint">${escapeHtml(t('Οι ζυγαριές του καταστήματος τυπώνουν τιμή ή βάρος μέσα στον barcode. «Αυτόματα»: 25–29 βάρος (GS1 Ελλάδας), 20–24 με βάση τη λογική και ό,τι θυμάμαι.'))}</p><div class="vm-grid">${['20','21','22','23','24','25','26','27','28','29'].map((prefix) => `<label class="vm-row"><span data-no-i18n>${prefix}…</span><select class="field-input vm-mode" data-prefix="${prefix}" aria-label="${escapeHtml(t('Πρόθεμα {prefix}', { prefix }))}">${VM_MODES.map((mode) => `<option value="${mode}" ${(current.vm?.[prefix] || 'auto') === mode ? 'selected' : ''}>${escapeHtml(t({ auto: 'Αυτόματα', price: 'Τιμή', weight: 'Βάρος' }[mode]))}</option>`).join('')}</select></label>`).join('')}</div></details>
    <div class="settings-actions"><button class="button button-quiet" type="button" data-action="delete-store">${escapeHtml(t('Διαγραφή καταστήματος «{name}»', { name: current.name }))}</button></div>` : '<p class="field-hint">Διάλεξε ή φτιάξε ένα κατάστημα για να ορίσεις τη σειρά των διαδρόμων.</p>'}</div>`;
}

function renderShoppingRows(pending, checked) {
  const store = activeStore();
  if (!store) return [...pending, ...checked].map(renderShoppingRow).join('');
  const groups = groupByStore(pending, store, state.items);
  return `${groups.map((group) => `<div class="aisle-heading"><span>${escapeHtml(t('Διάδρομος {n}', { n: group.aisle }))}</span> ${escapeHtml(categoryLabel(group.category))}</div>${group.rows.map(renderShoppingRow).join('')}`).join('')}${checked.length ? `<div class="aisle-heading">${escapeHtml(t('Στο καλάθι'))}</div>${checked.map(renderShoppingRow).join('')}` : ''}`;
}

function renderShopping() {
  const pending = state.shopping.filter((item) => !item.checked);
  const checked = state.shopping.filter((item) => item.checked);
  const trip = activeTrip();
  return `${renderHeader('Λίστα αγορών', 'Σημείωσε όσα χρειάζεσαι και πάρε τη λίστα μαζί σου.')}
    <div class="page-actions cart-entry"><button class="button ${trip ? 'button-primary' : 'button-quiet'}" type="button" data-view="cart" id="open-cart">🛒 ${escapeHtml(trip ? t('Συνέχεια καλαθιού · {total}', { total: money(trip.total) }) : t('Καλάθι στο κατάστημα'))}</button></div>
    <div class="shopping-layout"><section class="panel"><div class="panel-heading"><div><h2>Τι χρειάζεται το σπίτι;</h2><p>${pending.length ? pendingLabel(pending.length) : 'Κανένα εκκρεμές προϊόν'}</p></div><div class="panel-links">${pending.length ? '<button class="panel-link" type="button" data-action="share-shopping">↗ Κοινοποίηση</button>' : ''}${checked.length ? '<button class="panel-link" type="button" data-action="clear-completed">Καθάρισε τα αγορασμένα</button>' : ''}</div></div>
    <form id="shopping-form" class="shopping-add-form shopping-main-form" novalidate><input class="field-input" name="name" required maxlength="80" placeholder="π.χ. Φέτα" aria-label="Προϊόν για αγορά"><input class="field-input" name="quantity" type="number" min="0.1" max="${MAX_QUANTITY}" step="0.1" value="1" aria-label="Ποσότητα"><select class="field-input unit-select" name="unit" aria-label="Μονάδα">${unitOptions()}</select><select class="field-input category-select" name="category" aria-label="Κατηγορία"><option value="">Κατηγορία: αυτόματα</option>${CATEGORIES.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</option>`).join('')}</select><button class="button button-primary" type="submit">＋ Προσθήκη</button>${SpeechRecognitionApi ? '<button class="button button-quiet voice-button" type="button" data-action="voice-add" aria-label="Προσθήκη με φωνή" title="Προσθήκη με φωνή">🎤</button>' : ''}</form>
    <p class="form-error" id="shopping-error" role="alert" hidden></p>
    ${renderStoreBar()}
    <div class="shopping-list">${state.shopping.length ? renderShoppingRows(pending, checked) : renderEmpty('Η λίστα είναι άδεια', 'Πρόσθεσε όσα χρειάζεσαι πριν πας για ψώνια.', 'focus-shopping', 'Γράψε το πρώτο προϊόν', '🛒')}</div></section>
    <aside class="panel shopping-summary"><span class="stat-icon">🛍️</span><h2>Μικρή υπενθύμιση</h2><p>Κράτησε τη λίστα απλή και πρόσθεσε μόνο ό,τι χρειάζεσαι.</p><div class="shopping-summary-list"><div class="summary-line"><span>Εκκρεμούν</span><strong>${pending.length}</strong></div><div class="summary-line"><span>Στο καλάθι</span><strong>${checked.length}</strong></div><div class="summary-line"><span>Στη συσκευή</span><strong>Ιδιωτικά</strong></div></div></aside></div>
    ${renderRecurringPanel()}`;
}

function renderSettings() {
  return `${renderHeader('Ρυθμίσεις', 'Διαχείριση και αντίγραφο ασφαλείας των δεδομένων σου.')}
    <div class="settings-grid"><section class="panel settings-card"><span class="stat-icon">🔒</span><h2>Απόρρητο πρώτα</h2><p>Το απόθεμα, οι λίστες και τα έξοδά σου αποθηκεύονται στη συσκευή σου και η εφαρμογή δουλεύει και χωρίς internet. Αν συνδεθείς, συγχρονίζονται ιδιωτικά μέσω Firebase μόνο με τα μέλη του νοικοκυριού σου. Δεν υπάρχουν διαφημίσεις ούτε παρακολούθηση.</p><div class="privacy-note">Η αναζήτηση barcode στέλνει μόνο τον αριθμό του barcode στο Open Food Facts. Αν δεν έχεις συνδεθεί και καθαρίσεις τα δεδομένα του browser ή αλλάξεις συσκευή, χρησιμοποίησε αντίγραφο ασφαλείας.</div></section>
    <section class="panel settings-card"><span class="stat-icon">◐</span><h2>Εμφάνιση</h2><p>Διάλεξε φωτεινό ή σκούρο θέμα, ή άφησέ το να ακολουθεί τη συσκευή.</p><div class="theme-options" role="group" aria-label="Θέμα">${[['auto', 'Αυτόματο'], ['light', 'Φωτεινό'], ['dark', 'Σκούρο']].map(([value, label]) => `<button type="button" class="filter-chip ${currentTheme() === value ? 'is-active' : ''}" data-action="set-theme" data-theme="${value}" aria-pressed="${currentTheme() === value}">${label}</button>`).join('')}</div></section>
    ${renderLanguageCard()}
    ${renderSyncCard()}
    ${renderNotificationCard()}
    <section class="panel settings-card"><span class="stat-icon blue">↗</span><h2>Αντίγραφο ασφαλείας</h2><p>Εξήγαγε ή εισήγαγε ένα αρχείο JSON. Το αρχείο περιέχει όλα τα δεδομένα σου: απόθεμα, λίστες και έξοδα.</p><div class="settings-actions"><button class="button button-primary" type="button" data-action="export-backup">⬇ Εξαγωγή αντιγράφου</button><button class="button button-quiet" type="button" data-action="import-backup">⬆ Εισαγωγή αντιγράφου</button></div></section></div>
    <details class="panel collapsible settings-more" id="settings-advanced" ${openAttr('settings-advanced')}><summary><h2>Για προχωρημένους</h2><span class="field-hint">Proxy αποδείξεων, δοκιμαστικά δεδομένα, διαγραφή όλων</span></summary>
    <div class="settings-grid">
    ${renderReceiptSettingsCard()}
    <section class="panel settings-card"><span class="stat-icon amber">✨</span><h2>Δοκιμαστικά δεδομένα</h2><p>Γέμισε την εφαρμογή με ενδεικτικά προϊόντα για να δεις πώς λειτουργεί.</p><div class="settings-actions"><button class="button button-quiet" type="button" data-action="load-demo">Φόρτωση παραδειγμάτων</button></div></section>
    <section class="panel settings-card danger-zone"><span class="stat-icon" style="background:var(--red-soft)">⌫</span><h2>Καθαρισμός δεδομένων</h2><p>Διέγραψε όλα τα δεδομένα (απόθεμα, λίστες, έξοδα) από αυτή τη συσκευή.</p><div class="settings-actions"><button class="button button-danger" type="button" data-action="clear-data">Διαγραφή όλων</button></div></section></div></details>`;
}

function renderApp() {
  setActiveNavigation();
  renderNavCounts();
  if (activeView === 'overview') viewRoot.innerHTML = renderOverview();
  else if (activeView === 'pantry') viewRoot.innerHTML = renderPantry();
  else if (activeView === 'shopping') viewRoot.innerHTML = renderShopping();
  else if (activeView === 'insights') viewRoot.innerHTML = renderInsights();
  else if (activeView === 'bills') viewRoot.innerHTML = renderBills();
  else if (activeView === 'transport') viewRoot.innerHTML = renderTransport();
  else if (activeView === 'extras') viewRoot.innerHTML = renderExtras();
  else if (activeView === 'cart') viewRoot.innerHTML = renderCart();
  else if (activeView === 'cook') { viewRoot.innerHTML = renderCook(); loadOnlineRecipes(); }
  else viewRoot.innerHTML = renderSettings();
  if (activeView === 'pantry') renderPantryList();
  translateDom(viewRoot);
}

function navigate(view) {
  if (!VIEWS.includes(view)) return;
  activeView = view;
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  pantryQuery = view === 'pantry' ? pantryQuery : '';
  if (view !== 'pantry') pantryStatus = '';
  renderApp();
  viewRoot.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openItemDialog(id = '') {
  itemForm.reset();
  document.querySelector('#form-error').hidden = true;
  const existing = state.items.find((item) => item.id === id);
  itemForm.elements.id.value = existing?.id || '';
  itemForm.elements.name.value = existing?.name || '';
  itemForm.elements.category.value = existing?.category || 'Άλλο';
  itemForm.elements.location.value = existing?.location || '';
  itemForm.elements.quantity.value = existing?.quantity ?? 1;
  itemForm.elements.unit.value = normalizeUnit(existing?.unit);
  updateNameCounter();
  updateExpiryWarning();
  itemForm.elements.minimum.value = existing?.minimum ?? 0;
  itemForm.elements.expiry.value = existing?.expiry || '';
  itemForm.elements.barcode.value = existing?.barcode || '';
  document.querySelector('#barcode-status').textContent = '';
  document.querySelector('#dialog-title').textContent = t(existing ? 'Επεξεργασία προϊόντος' : 'Νέο προϊόν');
  itemDialog.showModal();
  requestAnimationFrame(() => document.querySelector('#item-name').focus());
}

function updateNameCounter() {
  const input = document.querySelector('#item-name');
  document.querySelector('#item-name-count').textContent = `${input.value.length}/${input.maxLength}`;
}

function updateExpiryWarning() {
  const warning = document.querySelector('#expiry-warning');
  warning.textContent = t(expiryWarning(itemForm.elements.expiry.value, localDateKey()));
  warning.hidden = !warning.textContent;
}

async function shareShoppingList() {
  const text = shoppingListText(state.shopping).split('\n').map((line, i) => i === 0 ? t(line) : line.replace(/ (\S+)$/, (m, unit) => ` ${t(unit)}`)).join('\n');
  if (!text) { showToast('Η λίστα δεν έχει εκκρεμή προϊόντα.'); return; }
  if (navigator.share) {
    try { await navigator.share({ title: t('Λίστα αγορών'), text }); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  const dialog = document.querySelector('#share-dialog');
  document.querySelector('#share-text').value = text;
  document.querySelector('#share-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  document.querySelector('#share-viber').href = `viber://forward?text=${encodeURIComponent(text)}`;
  dialog.showModal();
}

async function copyShareText() {
  const field = document.querySelector('#share-text');
  try { await navigator.clipboard.writeText(field.value); }
  catch { field.select(); document.execCommand('copy'); }
  showToast('Η λίστα αντιγράφηκε.');
}

let stopScanner = null;
let sync = null;
let syncStatus = { state: firebaseConfig ? 'loading' : 'disabled' };

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Λάθος email ή κωδικός.', 'auth/wrong-password': 'Λάθος email ή κωδικός.', 'auth/user-not-found': 'Λάθος email ή κωδικός.',
  'auth/email-already-in-use': 'Υπάρχει ήδη λογαριασμός με αυτό το email.', 'auth/weak-password': 'Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες.',
  'auth/invalid-email': 'Το email δεν είναι σωστό.', 'auth/popup-closed-by-user': 'Η σύνδεση ακυρώθηκε.', 'auth/unauthorized-domain': 'Το domain δεν έχει εγκριθεί στο Firebase (Authorized domains).',
  'auth/operation-not-allowed': 'Αυτός ο τρόπος σύνδεσης δεν έχει ενεργοποιηθεί στο Firebase.', 'auth/network-request-failed': 'Χωρίς σύνδεση στο internet.',
  'permission-denied': 'Δεν επιτρέπεται (έλεγξε τον κωδικό πρόσκλησης ή τους κανόνες του Firestore).', 'not-found': 'Δεν βρέθηκε το νοικοκυριό.'
};
const authMessage = (error) => t(AUTH_ERRORS[error?.code] || error?.message || 'Κάτι πήγε στραβά.');

async function startSync() {
  if (!firebaseConfig) return;
  try {
    const { createFirebaseSync } = await import('./sync-firebase.js');
    sync = await createFirebaseSync({
      config: firebaseConfig,
      getState: () => state,
      setState: (next) => { state = next; try { saveState(state); } catch {} renderApp(); },
      onStatus: (status) => { syncStatus = status; if (activeView === 'settings') renderApp(); }
    });
  } catch {
    syncStatus = { state: 'error', message: navigator.onLine === false ? 'Χωρίς σύνδεση: ο συγχρονισμός θα ξεκινήσει όταν επιστρέψει το internet.' : 'Δεν φόρτωσε το Firebase.' };
    if (activeView === 'settings') renderApp();
  }
}

function renderSyncCard() {
  const status = syncStatus;
  const head = '<section class="panel settings-card sync-card" id="sync-card"><span class="stat-icon blue">⇅</span><h2>Συγχρονισμός συσκευών</h2>';
  if (status.state === 'disabled') {
    return `${head}<p>Ανενεργός. Για να μοιράζεσαι το απόθεμα και τη λίστα με άλλες συσκευές ή μέλη του σπιτιού, χρειάζεται ρύθμιση Firebase στο <code>src/firebase-config.js</code>.</p><p class="field-hint">Μέχρι τότε όλα μένουν μόνο σε αυτή τη συσκευή. Μπορείς να μεταφέρεις δεδομένα με το αντίγραφο ασφαλείας.</p></section>`;
  }
  if (status.state === 'loading' || status.state === 'connecting') return `${head}<p id="sync-status">Σύνδεση…</p></section>`;
  if (status.state === 'signed-out' || (status.state === 'error' && !status.user)) {
    return `${head}<p>Συνδέσου για να συγχρονίζονται το απόθεμα και η λίστα σε όλες τις συσκευές σου. Τα δεδομένα αυτής της συσκευής θα ενωθούν με όσα έχεις ήδη.</p>
      ${status.message ? `<p class="form-error" id="sync-status">${escapeHtml(t(status.message))}</p>` : '<p class="field-hint" id="sync-status">Αποσυνδεδεμένος</p>'}
      ${authProviders.includes('google') ? '<div class="settings-actions"><button class="button button-primary" type="button" data-action="sync-google">Σύνδεση με Google</button></div>' : ''}
      ${authProviders.includes('password') ? `<form id="sync-email-form" class="sync-email-form" novalidate><input class="field-input" name="email" type="email" autocomplete="email" placeholder="Email" aria-label="Email" required><input class="field-input" name="password" type="password" autocomplete="current-password" placeholder="Κωδικός" aria-label="Κωδικός" minlength="6" required>
        <div class="settings-actions"><button class="button button-quiet" type="submit" name="mode" value="signin">Σύνδεση</button><button class="button button-quiet" type="submit" name="mode" value="signup">Νέος λογαριασμός</button><button class="text-button" type="submit" name="mode" value="reset">Ξέχασα τον κωδικό</button></div></form>` : ''}</section>`;
  }
  const who = status.user?.email || status.user?.name || 'Συνδεδεμένος';
  const shared = status.householdId && status.user && status.householdId !== status.user.uid;
  const line = status.state === 'error' ? `<p class="form-error" id="sync-status">${escapeHtml(t(status.message || 'Σφάλμα συγχρονισμού'))}</p>`
    : `<p class="field-hint" id="sync-status">${status.offline ? 'Εκτός σύνδεσης: οι αλλαγές θα σταλούν μόλις επιστρέψει το internet.' : 'Συγχρονισμένο ✓'}</p>`;
  return `${head}<p>Συνδεδεμένος ως <strong>${escapeHtml(who)}</strong>${shared ? ' · κοινό νοικοκυριό' : ''}.</p>${line}
    <div class="settings-actions"><button class="button button-quiet" type="button" data-action="sync-invite">Πρόσκληση μέλους</button>${shared ? '<button class="button button-quiet" type="button" data-action="sync-leave">Αποχώρηση από νοικοκυριό</button>' : ''}<button class="button button-quiet" type="button" data-action="sync-signout">Αποσύνδεση</button></div>
    <form id="sync-join-form" class="sync-join-form" novalidate><input class="field-input" name="invite" placeholder="Κωδικός πρόσκλησης" aria-label="Κωδικός πρόσκλησης" autocomplete="off"><button class="button button-quiet" type="submit">Συμμετοχή</button></form>
    <p class="field-hint">Με τη συμμετοχή σε άλλο νοικοκυριό, τα προϊόντα αυτής της συσκευής προστίθενται στο κοινό απόθεμα.</p></section>`;
}

async function syncAction(fn, success) {
  try { const result = await fn(); if (success) showToast(typeof success === 'function' ? success(result) : success); }
  catch (error) { showToast(authMessage(error)); }
}

function codeInfo(code, store = activeStore()) {
  const memoryUnit = (id) => (state.prices || []).filter((p) => p.barcode === id).sort((a, b) => (Number(b.storeId === store?.id) - Number(a.storeId === store?.id)) || String(b.date).localeCompare(String(a.date)))[0]?.unit || '';
  return interpretCode(code, { vmMode: (prefix) => store?.vm?.[prefix] || 'auto', memoryUnit });
}
const kgText = (kg) => kg.toLocaleString(locale(), { maximumFractionDigits: 3 });

async function fillFromBarcode(code) {
  const status = document.querySelector('#barcode-status');
  const info = codeInfo(code);
  const barcode = info.barcode;
  const gs1Note = [];
  if (info.kind === 'gs1') {
    const date = info.expiry || info.bestBefore;
    if (date && !itemForm.elements.expiry.value) { itemForm.elements.expiry.value = date; gs1Note.push(t('Λήξη από τον κωδικό: {date}', { date: formatDate(date) })); }
    if (info.batch) gs1Note.push(t('Παρτίδα {batch}', { batch: info.batch }));
  }
  if (info.weightKg) gs1Note.push(t('Βάρος {kg} κιλά', { kg: kgText(info.weightKg) }));
  const withNote = (text) => [text, ...gs1Note].filter(Boolean).join(' · ');
  itemForm.elements.barcode.value = barcode || String(code || '');
  if (!barcode) { status.textContent = t('Ο κωδικός δεν είναι έγκυρος barcode.'); return; }
  const editingId = itemForm.elements.id.value;
  const known = state.items.find((item) => item.barcode === barcode && item.id !== editingId);
  if (known) {
    itemForm.elements.name.value = itemForm.elements.name.value || known.name;
    itemForm.elements.category.value = known.category || itemForm.elements.category.value;
    updateNameCounter();
    status.textContent = withNote(t('Υπάρχει ήδη στο απόθεμα ως «{name}».', { name: known.name }));
    return;
  }
  if (info.kind === 'vm') { status.textContent = withNote(t('Ζυγιζόμενο προϊόν καταστήματος (κωδικός {plu}). Γράψε το όνομα.', { plu: info.plu })); return; }
  status.textContent = t('Αναζήτηση στο Open Food Facts…');
  try {
    const product = await lookupBarcode(barcode);
    if (!product) { status.textContent = withNote(t('Δεν βρέθηκε το προϊόν. Γράψε το όνομα και θα το θυμάμαι για αυτόν τον barcode.')); return; }
    if (!itemForm.elements.name.value.trim() || !editingId) itemForm.elements.name.value = product.name;
    if (product.category) itemForm.elements.category.value = product.category;
    updateNameCounter();
    status.textContent = withNote(t('Βρέθηκε: {name}. Έλεγξε τα στοιχεία πριν την αποθήκευση.', { name: product.name }));
  } catch (error) {
    status.textContent = t(navigator.onLine === false ? 'Χωρίς σύνδεση: η αναζήτηση δεν είναι διαθέσιμη.' : t(error.message || 'Η αναζήτηση απέτυχε.'));
  }
}

async function openScanner({ onCode = fillFromBarcode, qr = false } = {}) {
  const dialog = document.querySelector('#scan-dialog');
  const status = document.querySelector('#scan-status');
  status.textContent = t('Άνοιγμα κάμερας…');
  document.querySelector('#scan-title').textContent = t(qr === 'any' ? 'Σάρωση κωδικού λογαριασμού' : qr ? 'Σάρωση QR απόδειξης' : 'Σάρωση προϊόντος');
  const torch = document.querySelector('#scan-torch');
  torch.hidden = true; torch.setAttribute('aria-pressed', 'false');
  dialog.showModal();
  try {
    stopScanner = await startScanner(document.querySelector('#scan-video'), (code) => {
      stopScanner = null;
      dialog.close();
      onCode(code);
    }, { qr });
    if (stopScanner?.hasTorch) torch.hidden = false;
    if (dialog.open) status.textContent = t(qr === 'any' ? 'Στόχευσε το QR ή τον barcode του λογαριασμού.' : qr ? 'Στόχευσε το QR ή τον barcode της απόδειξης μέσα στο πλαίσιο.' : 'Στόχευσε τον barcode με την κάμερα.');
    else closeScanner();
  } catch (error) {
    status.textContent = t(error?.name === 'NotAllowedError' ? 'Δεν δόθηκε άδεια για την κάμερα. Μπορείς να γράψεις τον barcode με το χέρι.'
      : error?.name === 'NotFoundError' ? 'Δεν βρέθηκε κάμερα. Μπορείς να γράψεις τον barcode με το χέρι.'
      : (error.message || 'Η σάρωση δεν είναι διαθέσιμη.'));
  }
}

function closeScanner() {
  stopScanner?.();
  stopScanner = null;
  const dialog = document.querySelector('#scan-dialog');
  if (dialog.open) dialog.close();
}

const NOTIFY_KEY = 'spitothiki:notifications';
// Shared with sw.js: the service worker reads this snapshot for periodic background checks.
const DATA_CACHE = 'spitothiki-data';
const SNAPSHOT_URL = './__expiry.json';
const PERIODIC_TAG = 'spitothiki-expiry';
const backgroundSyncSupported = () => typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype;

async function readBackgroundSnapshot() {
  try { const res = await (await caches.open(DATA_CACHE)).match(SNAPSHOT_URL); return res ? await res.json() : null; } catch { return null; }
}

async function writeBackgroundSnapshot() {
  if (!('caches' in window)) return;
  const settings = notifySettings();
  try {
    const cache = await caches.open(DATA_CACHE);
    if (!settings.enabled) { await cache.delete(SNAPSHOT_URL); return; }
    const snapshot = expirySnapshot(state.items, { days: settings.days, lang: getLang(), lastNotified: settings.lastNotified,
      titleOne: t('1 προϊόν λήγει σύντομα'), titleMany: t('{count} προϊόντα λήγουν σύντομα', { count: '{count}' }), more: t(' και {count} ακόμη', { count: '{count}' }) });
    Object.assign(snapshot, { lastBillNotified: settings.lastBillNotified, billTitleOne: t('1 λογαριασμός προς πληρωμή'), billTitleMany: t('{count} λογαριασμοί προς πληρωμή', { count: '{count}' }),
      bills: (state.bills || []).filter((bill) => !bill.paid).map((bill) => ({ name: bill.name, due: bill.due, remind: bill.remind ?? 3, amount: money(bill.amount) })) });
    await cache.put(SNAPSHOT_URL, new Response(JSON.stringify(snapshot), { headers: { 'content-type': 'application/json' } }));
  } catch {}
}

// Periodic Background Sync (Chromium, installed app only): lets the service worker check expiries about once a day.
async function updateBackgroundCheck() {
  await writeBackgroundSnapshot();
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (!registration?.periodicSync) return;
  try {
    if (notifySettings().enabled) {
      const permission = await navigator.permissions?.query({ name: 'periodic-background-sync' }).catch(() => null);
      if (!permission || permission.state === 'granted') await registration.periodicSync.register(PERIODIC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
    } else await registration.periodicSync.unregister(PERIODIC_TAG);
  } catch {}
}

let snapshotTimer;
function scheduleBackgroundSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => { if (notifySettings().enabled) writeBackgroundSnapshot(); }, 500);
}

function notifySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}');
    return { enabled: Boolean(saved.enabled), days: Number.isInteger(saved.days) && saved.days >= 0 && saved.days <= 30 ? saved.days : 3, lastNotified: String(saved.lastNotified || ''), lastBillNotified: String(saved.lastBillNotified || '') };
  } catch { return { enabled: false, days: 3, lastNotified: '', lastBillNotified: '' }; }
}

function saveNotifySettings(changes) {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify({ ...notifySettings(), ...changes })); } catch {}
}

function notificationsSupported() {
  return 'Notification' in window;
}

async function showNotification(title, body, tag = 'spitothiki-expiry') {
  const options = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag, lang: getLang() };
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (registration?.showNotification) return registration.showNotification(title, options);
  return new Notification(title, options);
}

// Checks expiries when the app opens or comes back to the foreground; notifies at most once per day.
async function checkExpiryNotifications() {
  const settings = notifySettings();
  if (!settings.enabled || !notificationsSupported() || Notification.permission !== 'granted') return;
  const today = localDateKey();
  const swSnapshot = await readBackgroundSnapshot();
  if (swSnapshot?.lastBillNotified === today) saveNotifySettings({ lastBillNotified: today });
  const bills = billsDue(state.bills || [], today);
  if (bills.length && settings.lastBillNotified !== today) {
    try {
      const body = bills.slice(0, 3).map((bill) => `${bill.name} ${money(bill.amount)} (${billDueLabel(bill).toLocaleLowerCase(locale())})`).join(', ') + (bills.length > 3 ? t(' και {count} ακόμη', { count: bills.length - 3 }) : '');
      await showNotification(bills.length === 1 ? t('1 λογαριασμός προς πληρωμή') : t('{count} λογαριασμοί προς πληρωμή', { count: bills.length }), `${body}.`, 'spitothiki-bills');
      saveNotifySettings({ lastBillNotified: today });
    } catch {}
  }
  if (settings.lastNotified === today) return;
  if (swSnapshot?.lastNotified === today) { saveNotifySettings({ lastNotified: today }); return; }
  const due = expiringWithin(state.items, today, settings.days);
  if (!due.length) return;
  const names = due.slice(0, 3).map((item) => `${item.name} (${expiryLabel(item.expiry).toLocaleLowerCase(locale())})`).join(', ');
  const more = due.length > 3 ? t(' και {count} ακόμη', { count: due.length - 3 }) : '';
  try {
    await showNotification(due.length === 1 ? t('1 προϊόν λήγει σύντομα') : t('{count} προϊόντα λήγουν σύντομα', { count: due.length }), `${names}${more}.`);
    saveNotifySettings({ lastNotified: today });
    await writeBackgroundSnapshot();
  } catch {}
}

async function enableNotifications() {
  if (!notificationsSupported()) { showToast('Ο browser δεν υποστηρίζει ειδοποιήσεις.'); return; }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') { showToast('Οι ειδοποιήσεις δεν επιτράπηκαν. Μπορείς να τις ενεργοποιήσεις από τις ρυθμίσεις του browser.'); renderApp(); return; }
  saveNotifySettings({ enabled: true, lastNotified: '' });
  updateBackgroundCheck();
  renderApp();
  showToast('Οι ειδοποιήσεις ενεργοποιήθηκαν.');
  checkExpiryNotifications();
}

function renderNotificationCard() {
  const settings = notifySettings();
  const permission = notificationsSupported() ? Notification.permission : 'unsupported';
  const active = settings.enabled && permission === 'granted';
  const status = permission === 'unsupported' ? 'Ο browser δεν υποστηρίζει ειδοποιήσεις.'
    : permission === 'denied' ? 'Οι ειδοποιήσεις είναι μπλοκαρισμένες στις ρυθμίσεις του browser.'
    : active ? 'Ενεργές' : 'Ανενεργές';
  return `<section class="panel settings-card"><span class="stat-icon amber">🔔</span><h2>Ειδοποιήσεις λήξης</h2><p>Όταν ανοίγεις την εφαρμογή, σου θυμίζουμε (μία φορά τη μέρα) ό,τι λήγει μέσα στις επόμενες ημέρες.</p>
    <p class="field-hint" id="notify-status">${escapeHtml(t('Κατάσταση: {status}', { status: t(status) }))}</p>
    <label class="field-label" for="notify-days">Ειδοποίηση για λήξη μέσα σε (ημέρες)</label><input class="field-input notify-days" id="notify-days" type="number" min="0" max="30" step="1" value="${settings.days}" inputmode="numeric">
    <div class="settings-actions">${active ? '<button class="button button-quiet" type="button" data-action="disable-notifications">Απενεργοποίηση</button>' : `<button class="button button-primary" type="button" data-action="enable-notifications" ${permission === 'unsupported' || permission === 'denied' ? 'disabled' : ''}>Ενεργοποίηση ειδοποιήσεων</button>`}</div>
    <p class="field-hint" id="notify-background">${backgroundSyncSupported() ? 'Έλεγχος στο παρασκήνιο: διαθέσιμος. Με την εφαρμογή εγκατεστημένη, ο browser ελέγχει περίπου μία φορά τη μέρα, όποτε κρίνει.' : 'Έλεγχος στο παρασκήνιο: δεν υποστηρίζεται από αυτόν τον browser. Ο έλεγχος γίνεται όταν ανοίγεις την εφαρμογή.'}</p>
    <p class="field-hint">Ειδοποιήσεις push με την εφαρμογή εντελώς κλειστή θα χρειάζονταν server (Cloud Functions), που αυτή η έκδοση δεν έχει.</p></section>`;
}

function renderLanguageCard() {
  const lang = getLang();
  return `<section class="panel settings-card"><span class="stat-icon blue">🌐</span><h2>Γλώσσα</h2><p>Διάλεξε τη γλώσσα της εφαρμογής. Τα δεδομένα σου δεν αλλάζουν.</p><div class="theme-options" role="group" aria-label="Γλώσσα" data-no-i18n>${[['el', 'Ελληνικά'], ['en', 'English']].map(([value, label]) => `<button type="button" class="filter-chip ${lang === value ? 'is-active' : ''}" data-action="set-lang" data-lang="${value}" lang="${value}" aria-pressed="${lang === value}">${label}</button>`).join('')}</div></section>`;
}

function applyLanguage() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = t('Σπιτοθήκη — Το σπίτι σε τάξη');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('Οργάνωσε το σπίτι και τα έξοδά σου: απόθεμα και λήξεις, λίστα αγορών, λογαριασμοί, μετακινήσεις και μικροέξοδα.'));
  const toggle = document.querySelector('#lang-toggle');
  if (toggle) { toggle.textContent = lang === 'en' ? 'ΕΛ' : 'EN'; toggle.setAttribute('aria-label', lang === 'en' ? 'Switch to Greek' : 'Αλλαγή σε English'); toggle.setAttribute('title', toggle.getAttribute('aria-label')); }
  translateDom(document.body);
}

function changeLanguage(lang) {
  setLang(lang);
  applyLanguage();
  renderApp();
}

// Exposed for the smoke test.
window.__i18n = { getLang, untranslatedGreek };

const THEME_KEY = 'spitothiki:theme';

function currentTheme() {
  try { const theme = localStorage.getItem(THEME_KEY); return theme === 'light' || theme === 'dark' ? theme : 'auto'; } catch { return 'auto'; }
}

function applyTheme(theme = currentTheme()) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121a16' : '#f5f6f0');
}

function setTheme(theme) {
  try { if (theme === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, theme); } catch {}
  applyTheme(theme);
  renderApp();
}

function showConfirm(message, action, title = 'Να συνεχίσω;') {
  confirmAction = action;
  document.querySelector('#confirm-title').textContent = t(title);
  document.querySelector('#confirm-message').textContent = t(message);
  confirmDialog.showModal();
}

function addItemToShopping(item) {
  const existing = state.shopping.find((row) => !row.checked && (row.itemId ? row.itemId === item.id : row.name.toLocaleLowerCase('el-GR') === item.name.toLocaleLowerCase('el-GR')));
  if (existing) {
    existing.quantity = Number(existing.quantity) + Math.max(1, Number(item.minimum) - Number(item.quantity));
    existing.itemId = item.id;
  } else {
    state.shopping.push(createShoppingItem({ itemId: item.id, name: item.name, quantity: Math.max(1, Math.ceil(Number(item.minimum) - Number(item.quantity))), unit: item.unit }));
  }
  persist();
  showToast(t('Το {name} προστέθηκε στη λίστα.', { name: item.name }));
}

// ---------- Recurring items ----------
const INTERVAL_LABELS = { 7: 'Κάθε εβδομάδα', 14: 'Κάθε 2 εβδομάδες', 30: 'Κάθε μήνα' };
const intervalLabel = (days) => INTERVAL_LABELS[days] ? t(INTERVAL_LABELS[days]) : t('Κάθε {days} ημέρες', { days });
const UNITS = ['τεμ.', 'πακέτα', 'κιλά', 'γραμμάρια', 'λίτρα'];
const unitOptions = (selected = 'τεμ.') => UNITS.map((unit) => `<option value="${unit}" ${unit === selected ? 'selected' : ''}>${escapeHtml(t(unit))}</option>`).join('');

function runRecurring() {
  const result = applyRecurring(state.recurring || [], state.shopping, localDateKey());
  if (!result.changed) return;
  state.recurring = result.recurring;
  state.shopping = result.shopping;
  persist(); renderApp();
  if (result.added.length) showToast(t('Μπήκαν στη λίστα (επαναλαμβανόμενα): {names}', { names: result.added.map((row) => row.name).join(', ') }));
}

function renderRecurringPanel() {
  const rules = [...(state.recurring || [])].sort((a, b) => String(a.nextDue).localeCompare(String(b.nextDue)));
  return `<section class="panel recurring-panel" id="recurring-panel"><div class="panel-heading"><div><h2>Επαναλαμβανόμενα</h2><p>Μπαίνουν μόνα τους στη λίστα όταν έρθει η ώρα.</p></div></div>
    <form id="recurring-form" class="shopping-add-form recurring-form" novalidate><input class="field-input" name="name" required maxlength="80" placeholder="π.χ. Γάλα" aria-label="Επαναλαμβανόμενο προϊόν"><input class="field-input" name="quantity" type="number" min="0.1" max="${MAX_QUANTITY}" step="0.1" value="1" aria-label="Ποσότητα"><select class="field-input unit-select" name="unit" aria-label="Μονάδα">${unitOptions()}</select><select class="field-input" name="everyDays" aria-label="Κάθε πότε">${RECURRING_INTERVALS.map((days) => `<option value="${days}">${escapeHtml(intervalLabel(days))}</option>`).join('')}</select><button class="button button-quiet" type="submit">＋ Προσθήκη</button></form>
    <p class="form-error" id="recurring-error" role="alert" hidden></p>
    <div class="recurring-list">${rules.length ? rules.map((rule) => `<div class="recurring-row"><div><strong class="product-name">${escapeHtml(rule.name)}</strong><div class="shopping-row-detail">${escapeHtml(rule.quantity)} ${escapeHtml(t(rule.unit))} · ${escapeHtml(intervalLabel(rule.everyDays))} · ${escapeHtml(t('Επόμενη: {date}', { date: formatDate(rule.nextDue) }))}</div></div><button class="icon-button danger" type="button" data-action="remove-recurring" data-id="${escapeHtml(rule.id)}" aria-label="${escapeHtml(t('Διαγραφή {name}', { name: rule.name }))}">×</button></div>`).join('') : '<p class="subtle-empty">Π.χ. γάλα κάθε εβδομάδα ή απορρυπαντικό κάθε μήνα.</p>'}</div></section>`;
}

// ---------- Voice add (Web Speech API) ----------
const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function startVoiceAdd(button) {
  if (!SpeechRecognitionApi) { showToast('Η φωνητική προσθήκη δεν υποστηρίζεται σε αυτόν τον browser.'); return; }
  if (recognition) { recognition.stop(); return; }
  recognition = new SpeechRecognitionApi();
  recognition.lang = getLang() === 'en' ? 'en-US' : 'el-GR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  button.classList.add('is-listening');
  showToast('Σε ακούω… πες π.χ. «ψωμί και αυγά».');
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || []).map((result) => result[0]?.transcript || '').join(' ');
    const parsed = parseVoiceItems(transcript);
    if (!parsed.length) { showToast('Δεν κατάλαβα κάποιο προϊόν. Δοκίμασε ξανά.'); return; }
    for (const entry of parsed) state.shopping.push(createShoppingItem({ name: entry.name, quantity: entry.quantity }));
    if (persist()) { renderApp(); showToast(t('Προστέθηκαν: {names}', { names: parsed.map((entry) => entry.name).join(', ') })); }
  };
  recognition.onerror = (event) => { showToast(event?.error === 'not-allowed' ? 'Δεν δόθηκε άδεια για το μικρόφωνο.' : 'Η φωνητική προσθήκη απέτυχε. Δοκίμασε ξανά.'); };
  recognition.onend = () => { recognition = null; document.querySelector('[data-action="voice-add"]')?.classList.remove('is-listening'); };
  try { recognition.start(); } catch { recognition = null; button.classList.remove('is-listening'); }
}

// ---------- Scan receipt (Greek e-receipts via the QR's provider link) ----------
const PROXY_KEY = 'spitothiki:receiptProxy';
const DEFAULT_PROXY = 'https://spitothiki-receipt-proxy.cornerstore553.workers.dev';
const storedProxy = () => { try { return localStorage.getItem(PROXY_KEY) || ''; } catch { return ''; } };
const receiptProxy = () => storedProxy() || DEFAULT_PROXY;
let receiptState = { step: 'start' };
let receiptTarget = '';
const photoButtons = () => `<div class="settings-actions receipt-photo-actions"><label class="button button-quiet file-button"><span>📸 Φωτογραφία απόδειξης</span><input type="file" accept="image/*" capture="environment" class="visually-hidden" data-receipt-photo id="receipt-photo-camera"></label><label class="button button-quiet file-button"><span>🖼️ Από τη συλλογή</span><input type="file" accept="image/*" class="visually-hidden" data-receipt-photo id="receipt-photo-file"></label></div>`;

async function loadReceiptPhoto(file) {
  if (!file) return;
  receiptState = { step: 'loading', photo: true, progress: '' };
  renderReceipt();
  let toll = null;
  try {
    // 1) A QR link or toll barcode in the photo beats OCR.
    const loading = document.querySelector('#receipt-loading');
    if (loading) loading.textContent = t('Αναζήτηση QR / barcode στη φωτογραφία…');
    const codes = await decodeImageCodes(file).catch(() => []);
    const link = codes.find(isUrlCode);
    if (link) { loadReceipt(link); return; }
    toll = codes.map(parseTollBarcode).find(Boolean) || null;
  } catch {}
  try {
    const { ocrReceipt } = await import('./receipt-photo.js');
    const result = await ocrReceipt(file, {
      recognizeImpl: window.__spitoOcrMock,
      onProgress: (m) => {
        const el = document.querySelector('#receipt-loading');
        if (!el) return;
        el.textContent = m.status === 'recognizing text' ? t('Αναγνώριση κειμένου… {pct}%', { pct: Math.round((m.progress || 0) * 100) })
          : m.status === 'orientation' ? t('Αναγνώριση κειμένου… (περιστροφή {angle}°)', { angle: m.angle }) : t('Φόρτωση αναγνώρισης κειμένου (μόνο την πρώτη φορά)…');
      }
    });
    // 2) Toll receipt: barcode data (if read) + amount from the OCR text, or everything from the text.
    if (toll) { tollToTransport({ ...toll, amount: tollAmountFromText(result?.text) }); return; }
    const tollText = parseTollText(result?.text);
    if (tollText && !result.parsed.lines.length) { tollToTransport(tollText); return; }
    const receipt = result.parsed;
    if (!receipt.lines.length && !receipt.total) throw new Error('Δεν βρέθηκαν είδη στη φωτογραφία. Δοκίμασε πιο καθαρή, ίσια λήψη με καλό φως.');
    const id = await receiptId(receipt, `photo:${receipt.issuerName}`);
    const duplicate = (state.receipts || []).find((entry) => entry.id === id);
    receiptState = { step: 'review', receipt, id, duplicate, photo: true, trip: tripForReceipt(state.trips || [], receipt), target: receiptTarget, guess: classifyReceipt(receipt, result.text) };
  } catch (error) {
    if (toll) { tollToTransport(toll); return; }
    receiptState = { step: 'start', error: t(error.message || 'Η αναγνώριση απέτυχε.') };
  }
  renderReceipt();
}

// A code read in receipt mode: provider/AADE link → fetch; known toll barcode → transport entry; else explain.
function receiptCode(code) {
  const value = String(code || '').trim();
  if (isUrlCode(value)) { loadReceipt(value); return; }
  const toll = parseTollBarcode(value);
  if (toll) { tollToTransport(toll); return; }
  receiptState = { step: 'start', error: t('Ο barcode αυτής της απόδειξης δεν περιέχει τα στοιχεία της. Σκάναρε το QR code (αν υπάρχει) ή βγάλε φωτογραφία την απόδειξη για αναγνώριση κειμένου.'), raw: value.slice(0, 120) };
  renderReceipt();
}

function tollToTransport(toll) {
  if ((state.receipts || []).some((r) => r.id === toll.id) || (state.transport || []).some((e) => e.receiptId === toll.id)) {
    receiptState = { step: 'start', error: t('Αυτή η απόδειξη διοδίων ({no}) έχει ήδη καταχωρηθεί.', { no: toll.receiptNo }) };
    renderReceipt();
    return;
  }
  transportDraft = { type: 'tolls', amount: toll.amount || lastTollAmount(state.transport || []), date: toll.date, note: `${toll.operator} · ${toll.time.slice(0, 5)} · #${toll.receiptNo}`, receiptId: toll.id, fromReceipt: true, tollBarcode: true, amountFromOcr: Boolean(toll.amount) };
  receiptState = { step: 'start' };
  renderReceipt();
  document.querySelector('#receipt-dialog')?.close();
  navigate('transport');
  requestAnimationFrame(() => { const el = document.querySelector('#transport-amount'); el?.focus(); el?.select?.(); document.querySelector('#transport-add')?.scrollIntoView({ block: 'center' }); });
}

function openReceiptDialog(target = '') {
  receiptTarget = target;
  receiptState = { step: 'start' };
  renderReceipt();
  document.querySelector('#receipt-dialog').showModal();
}

async function loadReceipt(link) {
  receiptState = { step: 'loading', link: String(link || '').trim() };
  renderReceipt();
  try {
    const receipt = await fetchReceipt(receiptState.link, { proxy: receiptProxy() });
    const id = await receiptId(receipt, receipt.sourceUrl);
    const duplicate = (state.receipts || []).find((entry) => entry.id === id);
    receiptState = { step: 'review', receipt, id, duplicate, trip: tripForReceipt(state.trips || [], receipt), target: receiptTarget, guess: classifyReceipt(receipt) };
  } catch (error) {
    receiptState = { step: 'start', link: receiptState.link, error: t(error.message || 'Η αναζήτηση απέτυχε.'), cors: Boolean(error.cors) };
  }
  renderReceipt();
}

function renderReceiptStart() {
  const { link = '', error = '', cors = false } = receiptState;
  return `<p class="field-hint">Σκάναρε το QR code της ηλεκτρονικής απόδειξης ή επικόλλησε τον σύνδεσμό του. Θα δεις τα είδη πριν μπουν οπουδήποτε.</p>
    <div class="settings-actions"><button class="button button-primary" type="button" data-action="receipt-scan">📷 Σάρωση QR</button></div>
    <p class="field-hint">Χωρίς QR παρόχου (π.χ. ταμειακή με QR της ΑΑΔΕ); Βγάλε φωτογραφία την απόδειξη και θα διαβαστούν τα είδη στη συσκευή σου.</p>${photoButtons()}
    <form id="receipt-link-form" class="store-form" novalidate><input class="field-input" name="link" type="url" inputmode="url" value="${escapeHtml(link)}" placeholder="https://… (σύνδεσμος απόδειξης)" aria-label="Σύνδεσμος απόδειξης" autocomplete="off"><button class="button button-quiet" type="submit">Άνοιγμα</button></form>
    ${error ? `<p class="form-error" id="receipt-error" role="alert">${escapeHtml(error)}</p>` : ''}${receiptState.raw ? `<p class="field-hint" id="receipt-raw-code"><small>${escapeHtml(t('Διαβάστηκε:'))} <code data-no-i18n>${escapeHtml(receiptState.raw)}</code> (${receiptState.raw.length})</small></p>` : ''}
    ${cors && !receiptProxy() ? '<p class="field-hint">Μπορείς να ορίσεις proxy αποδείξεων στις Ρυθμίσεις για παρόχους που μπλοκάρουν την απευθείας πρόσβαση.</p>' : ''}`;
}

function renderTripLink() {
  const { trip, receipt, duplicate } = receiptState;
  if (!trip || duplicate) return '';
  const diff = Math.round((receipt.total - trip.total) * 100) / 100;
  return `<div class="alert-banner receipt-trip" id="receipt-trip" role="status"><p>${escapeHtml(t('Ταιριάζει με το καλάθι «{store}» ({date}): εκτίμηση {estimate}, απόδειξη {total} ({diff}).', { store: trip.storeName || t('Καλάθι'), date: formatDate(trip.date), estimate: money(trip.total), total: money(receipt.total), diff: `${diff >= 0 ? '+' : ''}${money(diff)}` }))}</p>
    <label class="check-row"><input type="checkbox" name="linkTrip" checked form="receipt-review-form"> <span>${escapeHtml(t('Σύνδεση με το καλάθι: τα έξοδα της απόδειξης αντικαθιστούν την εκτίμηση (χωρίς διπλή καταμέτρηση)'))}</span></label></div>`;
}

function renderReceiptReview() {
  const { receipt, duplicate } = receiptState;
  const store = receipt.issuerName || (receipt.issuerVat ? t('ΑΦΜ {vat}', { vat: receipt.issuerVat }) : t('Άγνωστο κατάστημα'));
  const head = `<div class="receipt-summary"><div><strong class="product-name" id="receipt-store">${escapeHtml(store)}</strong><span class="field-hint">${escapeHtml(receipt.date ? formatDate(receipt.date) : '')}${receipt.lines.length ? ` · ${escapeHtml(t('{count} είδη', { count: receipt.lines.length }))}` : ''}</span></div><strong class="big-number" id="receipt-total">${escapeHtml(money(receipt.total))}</strong></div>`;
  const dup = duplicate ? `<p class="alert-banner" id="receipt-duplicate" role="status">${escapeHtml(t('Αυτή η απόδειξη έχει ήδη εισαχθεί ({date}).', { date: formatDate(String(duplicate.importedAt || '').slice(0, 10)) }))}</p>` : '';
  if (!receipt.lines.length) {
    return `${head}${dup}${renderTransportReceiptOffer()}${renderTripLink()}<p class="field-hint" id="receipt-aade-note">Οι αποδείξεις με QR της ΑΑΔΕ (ταμειακές) δεν περιέχουν τα είδη στο QR, μόνο το σύνολο. Για να περάσουν τα είδη, βγάλε φωτογραφία την απόδειξη — ή κατέγραψε μόνο το ποσό ως έξοδο.</p>${photoButtons()}
      <form id="receipt-review-form" novalidate><input type="hidden" name="mode" value="total"><div class="dialog-actions"><button class="button button-quiet" type="button" data-action="receipt-reset">Πίσω</button><button class="button button-primary" type="submit" ${duplicate ? 'disabled' : ''}>Καταγραφή εξόδου</button></div></form>`;
  }
  const rows = receipt.lines.map((line, index) => `<div class="receipt-line${line.doubtful ? ' is-doubtful' : ''}" data-line="${index}"${line.doubtful ? ` title="${escapeHtml(t('Έλεγξε αυτή τη γραμμή: ποσότητα × τιμή δεν ταιριάζει με το ποσό.'))}"` : ''}><input class="shopping-check" type="checkbox" name="use" checked aria-label="${escapeHtml(t('Εισαγωγή: {name}', { name: line.name }))}">
    <input class="field-input receipt-name" name="name" value="${escapeHtml(line.name)}" maxlength="80" aria-label="Όνομα προϊόντος">
    <input class="field-input receipt-qty" name="quantity" type="number" min="0" step="0.001" value="${escapeHtml(line.quantity)}" aria-label="Ποσότητα"><select class="field-input receipt-unit" name="unit" aria-label="Μονάδα">${unitOptions(line.unit)}</select>
    <input class="field-input receipt-price" name="price" type="number" min="0" step="0.01" value="${escapeHtml(line.price.toFixed(2))}" aria-label="Τιμή">
    <select class="field-input receipt-category" name="category" aria-label="Κατηγορία">${CATEGORIES.map((category) => `<option value="${escapeHtml(category)}" ${category === line.category ? 'selected' : ''}>${escapeHtml(categoryLabel(category))}</option>`).join('')}</select></div>`).join('');
  const doubtful = receipt.lines.filter((line) => line.doubtful).length;
  const photoNote = receiptState.photo ? `<p class="field-hint" id="receipt-photo-note">${escapeHtml(t('Διαβάστηκε από φωτογραφία — έλεγξε ονόματα και ποσά πριν την εισαγωγή.'))}${doubtful ? ` <strong class="doubtful-hint">${escapeHtml(t('{count} γραμμές θέλουν έλεγχο (σημειωμένες).', { count: doubtful }))}</strong>` : ''}${receipt.totalMismatch ? ` ${escapeHtml(t('Το άθροισμα των ειδών ({sum}) διαφέρει από το σύνολο.', { sum: money(receipt.linesTotal) }))}` : ''}</p>` : '';
  return `${head}${dup}${renderTransportReceiptOffer()}${renderTripLink()}${photoNote}<form id="receipt-review-form" novalidate><input type="hidden" name="mode" value="lines">
    <div class="receipt-lines" id="receipt-lines">${rows}</div>
    <label class="check-row"><input type="checkbox" name="toPantry" ${receiptState.trip && !duplicate ? '' : 'checked'}> <span>Πρόσθεσε στο απόθεμα (ενώνεται με ίδια προϊόντα)</span></label>${receiptState.trip && !duplicate ? `<p class="field-hint">${escapeHtml(t('Τα προϊόντα του καλαθιού έχουν ήδη μπει στο απόθεμα.'))}</p>` : ''}
    <label class="check-row"><input type="checkbox" name="toSpending" checked> <span>Κατέγραψε τα έξοδα στα Στατιστικά</span></label>
    <div class="dialog-actions"><button class="button button-quiet" type="button" data-action="receipt-reset">Πίσω</button><button class="button button-primary" type="submit" ${duplicate ? 'disabled' : ''}>Εισαγωγή</button></div></form>`;
}

function renderReceipt() {
  const body = document.querySelector('#receipt-body');
  if (!body) return;
  body.innerHTML = receiptState.step === 'loading' ? `<p class="field-hint" id="receipt-loading" role="status">${escapeHtml(t(receiptState.photo ? 'Φόρτωση αναγνώρισης κειμένου (μόνο την πρώτη φορά)…' : 'Φόρτωση απόδειξης…'))}</p>`
    : receiptState.step === 'review' ? renderReceiptReview() : renderReceiptStart();
  translateDom(body);
}

function importReceipt(form) {
  const { receipt, id, duplicate } = receiptState;
  if (!receipt || duplicate) return;
  const now = new Date().toISOString();
  const date = receipt.date || localDateKey();
  const storeName = receipt.issuerName || '';
  const knownStore = (state.stores || []).find((store) => storeName && normalizeSearch(store.name).trim() === normalizeSearch(storeName).trim());
  const extra = { receiptId: id, ...(storeName ? { storeName } : {}), ...(knownStore ? { storeId: knownStore.id } : {}) };
  state.purchases = [...(state.purchases || [])];
  let added = 0;
  let merged = 0;
  let spent = 0;
  if (form.elements.mode.value === 'total') {
    state.purchases.push({ id: `pur-${id}`, rowId: '', name: storeName || t('Απόδειξη'), category: 'Άλλο', price: receipt.total, date, ...extra, updatedAt: now });
    spent = receipt.total;
  } else {
    const toPantry = form.elements.toPantry.checked;
    const toSpending = form.elements.toSpending.checked;
    for (const row of form.querySelectorAll('[data-line]')) {
      const field = (name) => row.querySelector(`[name="${name}"]`);
      if (!field('use').checked) continue;
      const name = field('name').value.trim();
      if (!name) continue;
      const quantity = Math.max(0, Number(field('quantity').value) || 0);
      const unit = field('unit').value;
      const category = field('category').value;
      const price = Math.max(0, Math.round((Number(field('price').value) || 0) * 100) / 100);
      if (toPantry) {
        const existing = state.items.find((item) => normalizeSearch(item.name).trim() === normalizeSearch(name).trim() && normalizeUnit(item.unit) === unit);
        if (existing) { state.items = state.items.map((item) => item === existing ? { ...item, quantity: Math.min(MAX_QUANTITY, Math.round((Number(item.quantity) + quantity) * 1000) / 1000), updatedAt: now } : item); merged += 1; }
        else { state.items = [createPantryItem({ name, quantity, unit, category }), ...state.items]; added += 1; }
      }
      if (toSpending && price > 0) {
        state.purchases.push({ id: `pur-${id}-${row.dataset.line}`, rowId: '', name, category, price, date, ...extra, updatedAt: now });
        spent += price;
      }
    }
  }
  const linkTrip = receiptState.trip && form.elements.linkTrip?.checked ? receiptState.trip : null;
  if (linkTrip) {
    state.purchases = state.purchases.filter((purchase) => purchase.tripId !== linkTrip.id);
    state.trips = (state.trips || []).map((trip) => (trip.id === linkTrip.id ? { ...trip, receiptId: id, receiptTotal: receipt.total, updatedAt: now } : trip));
  }
  state.receipts = [...(state.receipts || []), { id, date, total: receipt.total, store: storeName, issuerVat: receipt.issuerVat || '', format: receipt.format, lines: receipt.lines.length, importedAt: now }];
  if (!persist()) return;
  document.querySelector('#receipt-dialog').close();
  renderApp();
  showToast(t('Απόδειξη: {added} νέα, {merged} ενημερώθηκαν, έξοδα {spent}.', { added, merged, spent: money(Math.round(spent * 100) / 100) }));
}

function renderReceiptSettingsCard() {
  return `<section class="panel settings-card" id="receipt-settings"><span class="stat-icon">🧾</span><h2>Σάρωση απόδειξης</h2><p>Οι ηλεκτρονικές αποδείξεις διαβάζονται απευθείας από τον πάροχο. Για παρόχους που δεν το επιτρέπουν, μπορείς να ορίσεις έναν δικό σου proxy (Cloudflare Worker, δες τον φάκελο proxy/).</p>
    <form id="proxy-form" class="store-form" novalidate><input class="field-input" name="proxy" type="url" value="${escapeHtml(storedProxy())}" placeholder="${DEFAULT_PROXY}" data-no-i18n aria-label="Διεύθυνση proxy"><button class="button button-quiet" type="submit">Αποθήκευση</button></form>
    <p class="field-hint">${escapeHtml((state.receipts || []).length ? t('Έχουν εισαχθεί {count} αποδείξεις.', { count: state.receipts.length }) : t('Δεν έχει εισαχθεί καμία απόδειξη ακόμα.'))}</p></section>`;
}

// ---------- What do I cook? ----------
let onlineRecipes = { key: '', state: 'idle', list: [] };
let shownRecipes = [];

const recipeKey = () => Object.entries(pantryIngredients(state.items, localDateKey())).map(([id, entry]) => `${id}:${entry.urgency}`).sort().join(',');

function loadOnlineRecipes() {
  const key = recipeKey();
  if (!key || onlineRecipes.key === key || navigator.onLine === false) return;
  onlineRecipes = { key, state: 'loading', list: [] };
  fetchMealDbSuggestions(state.items, localDateKey())
    .then((list) => { if (onlineRecipes.key === key) onlineRecipes = { key, state: 'done', list: list.filter((r) => r.matched.length).slice(0, 4) }; })
    .catch(() => { if (onlineRecipes.key === key) onlineRecipes = { key, state: 'error', list: [] }; })
    .finally(() => { if (activeView === 'cook') { viewRoot.innerHTML = renderCook(); translateDom(viewRoot); } });
}

function missingNames(recipe) {
  const lang = getLang();
  return [...recipe.missing.map((id) => ingredientName(id, lang)), ...(recipe.missingRaw || [])];
}

function addMissingToList(recipeId) {
  const recipe = shownRecipes.find((entry) => entry.id === recipeId);
  if (!recipe) return;
  const pendingNames = new Set(state.shopping.filter((row) => !row.checked).map((row) => normalizeSearch(row.name).trim()));
  const names = missingNames(recipe).filter((name) => !pendingNames.has(normalizeSearch(name).trim()));
  if (!names.length) { showToast('Όλα τα υλικά είναι ήδη στη λίστα.'); return; }
  for (const name of names) state.shopping.push(createShoppingItem({ name: name.charAt(0).toLocaleUpperCase() + name.slice(1) }));
  if (persist()) { renderApp(); showToast(t('Μπήκαν στη λίστα: {names}', { names: names.join(', ') })); }
}

function renderRecipeCard(recipe, pantry) {
  const lang = getLang();
  const chip = (id, kind) => {
    const urgent = kind === 'have' && pantry[id]?.urgency >= 1;
    return `<span class="ingredient-chip ${kind}${urgent ? ' urgent' : ''}">${kind === 'have' ? (urgent ? '◷' : '✓') : '+'} ${escapeHtml(ingredientName(id, lang))}</span>`;
  };
  const missingCount = recipe.missing.length + (recipe.missingRaw || []).length;
  return `<article class="panel recipe-card" data-recipe="${escapeHtml(recipe.id)}"><div class="recipe-head">${recipe.thumb ? `<img class="recipe-thumb" src="${escapeHtml(recipe.thumb)}/preview" alt="" loading="lazy">` : '<span class="stat-icon">🍲</span>'}<div><h3 class="recipe-name" data-no-i18n lang="${recipe.source === 'mealdb' ? 'en' : lang}">${escapeHtml(recipe.name[lang] || recipe.name.el)}</h3>
    <p class="field-hint">${recipe.source === 'mealdb' ? escapeHtml(t('Από TheMealDB (στα αγγλικά)')) : escapeHtml(t('Συνταγή της Σπιτοθήκης'))}${recipe.urgent.length ? ` · <strong class="recipe-urgent">${escapeHtml(t('χρησιμοποιεί ό,τι λήγει σύντομα'))}</strong>` : ''}</p></div></div>
    <p class="recipe-label">${escapeHtml(t('Έχεις ({count})', { count: recipe.matched.length }))}</p><div class="ingredient-chips">${recipe.matched.map((id) => chip(id, 'have')).join('')}</div>
    ${missingCount ? `<p class="recipe-label">${escapeHtml(t('Λείπουν ({count})', { count: missingCount }))}</p><div class="ingredient-chips" data-no-i18n>${recipe.missing.map((id) => chip(id, 'need')).join('')}${(recipe.missingRaw || []).map((name) => `<span class="ingredient-chip need" lang="en">+ ${escapeHtml(name)}</span>`).join('')}</div>` : `<p class="recipe-label ok">${escapeHtml(t('Τα έχεις όλα!'))}</p>`}
    ${recipe.steps ? `<details class="recipe-steps"><summary>${escapeHtml(t('Πώς γίνεται'))}</summary><p>${escapeHtml(recipe.steps[lang] || recipe.steps.el)}</p></details>` : ''}
    <div class="settings-actions">${missingCount ? `<button class="button button-primary" type="button" data-action="add-missing" data-recipe="${escapeHtml(recipe.id)}">${escapeHtml(t('＋ Τα υπόλοιπα στη λίστα'))}</button>` : ''}${recipe.url ? `<a class="button button-quiet" href="${escapeHtml(recipe.url)}" target="_blank" rel="noopener">${escapeHtml(t('Συνταγή ↗'))}</a>` : ''}</div></article>`;
}

let cookTab = 'ideas';
const cookTabs = () => `<div class="segmented cook-tabs" role="tablist"><button type="button" role="tab" class="filter-chip${cookTab === 'ideas' ? ' is-active' : ''}" aria-selected="${cookTab === 'ideas'}" data-action="cook-tab" data-tab="ideas">💡 Ιδέες</button><button type="button" role="tab" class="filter-chip${cookTab === 'plan' ? ' is-active' : ''}" aria-selected="${cookTab === 'plan'}" data-action="cook-tab" data-tab="plan" id="tab-plan">📅 Πρόγραμμα εβδομάδας</button></div>`;

// ---------- Weekly meal plan ----------
const SLOT_LABELS = { breakfast: 'Πρωινό', lunch: 'Μεσημεριανό', dinner: 'Βραδινό' };
let planWeek = weekStart(localDateKey());
let mealEdit = null; // { date, slot, results, state }
const mealTitle = (meal) => meal.title?.[getLang()] || meal.title?.el || '';
const dayLabel = (key, style = 'long') => new Intl.DateTimeFormat(locale(), { weekday: style, day: 'numeric', month: 'short' }).format(new Date(`${key}T12:00:00`));

function renderPlan() {
  const days = weekDays(planWeek);
  const meals = state.meals || [];
  const byId = new Map(meals.map((meal) => [meal.id, meal]));
  const today = localDateKey();
  const range = `${dayLabel(days[0], undefined)} – ${dayLabel(days[6], undefined)}`;
  const count = meals.filter((meal) => meal.date >= days[0] && meal.date <= days[6]).length;
  const cell = (date, slot) => {
    const meal = byId.get(`meal-${date}-${slot}`);
    return `<button type="button" class="plan-cell${meal ? ' has-meal' : ''}" data-action="plan-meal" data-date="${date}" data-slot="${slot}" aria-label="${escapeHtml(`${dayLabel(date)} · ${t(SLOT_LABELS[slot])}${meal ? `: ${mealTitle(meal)}` : ''}`)}" data-no-i18n><span class="plan-slot">${escapeHtml(t(SLOT_LABELS[slot]))}</span>${meal ? `<span class="plan-meal" ${meal.source === 'mealdb' ? 'lang="en"' : ''}>${escapeHtml(mealTitle(meal))}</span>` : '<span class="plan-add">＋</span>'}</button>`;
  };
  return `<div class="month-switch" role="group" aria-label="Εβδομάδα"><button class="icon-button" type="button" data-action="plan-week" data-delta="-7" aria-label="Προηγούμενη εβδομάδα">‹</button><strong id="plan-range" data-no-i18n>${escapeHtml(range)}</strong><button class="icon-button" type="button" data-action="plan-week" data-delta="7" aria-label="Επόμενη εβδομάδα">›</button>${planWeek !== weekStart(today) ? `<button class="text-button" type="button" data-action="plan-week" data-delta="0">Αυτή η εβδομάδα</button>` : ''}</div>
    <div class="settings-actions plan-actions"><button class="button button-primary" type="button" data-action="plan-shopping" ${count ? '' : 'disabled'}>🛒 Ό,τι λείπει στη λίστα</button><button class="button button-quiet" type="button" data-action="plan-copy">📋 Αντιγραφή προηγούμενης εβδομάδας</button></div>
    <div class="plan-grid" id="plan-grid">${days.map((date) => `<section class="plan-day${date === today ? ' is-today' : ''}" data-day="${date}"><h3 class="plan-day-name" data-no-i18n>${escapeHtml(dayLabel(date))}</h3>${MEAL_SLOTS.map((slot) => cell(date, slot)).join('')}</section>`).join('')}</div>
    <p class="field-hint">${escapeHtml(t('{count} γεύματα αυτή την εβδομάδα. Η λίστα αφαιρεί ό,τι έχεις ήδη στο απόθεμα ή στη λίστα.', { count }))}</p>`;
}

function openMealDialog(date, slot) {
  mealEdit = { date, slot, results: [], state: 'idle', query: '' };
  document.querySelector('#meal-when').textContent = `${dayLabel(date)} · ${t(SLOT_LABELS[slot])}`;
  renderMealDialog();
  document.querySelector('#meal-dialog').showModal();
}

function renderMealDialog() {
  const body = document.querySelector('#meal-body');
  if (!body || !mealEdit) return;
  const lang = getLang();
  const current = (state.meals || []).find((meal) => meal.id === `meal-${mealEdit.date}-${mealEdit.slot}`);
  const pantry = pantryIngredients(state.items, localDateKey());
  const builtin = suggestBuiltin(state.items, localDateKey(), 50);
  const order = [...builtin, ...BUILTIN_RECIPES.filter((recipe) => !builtin.some((entry) => entry.id === recipe.id))];
  const status = { loading: 'Αναζήτηση…', error: 'Το TheMealDB δεν απάντησε. Δοκίμασε ξανά.', empty: 'Δεν βρέθηκαν συνταγές.' }[mealEdit.state];
  body.innerHTML = `${current ? `<p class="field-hint" id="meal-current">${escapeHtml(t('Τώρα: {name}', { name: mealTitle(current) }))} <button class="text-button" type="button" data-action="plan-clear">Αφαίρεση</button></p>` : ''}
    <form id="meal-text-form" class="store-form" novalidate><input class="field-input" name="text" maxlength="80" placeholder="Γράψε ελεύθερα, π.χ. Φακές με ρύζι" aria-label="Γεύμα" value="${current?.source === 'text' ? escapeHtml(mealTitle(current)) : ''}"><button class="button button-primary" type="submit">Αποθήκευση</button></form>
    <h3 class="insights-subtitle">Συνταγές της Σπιτοθήκης</h3>
    <div class="meal-options" id="meal-builtin">${order.map((recipe) => `<button type="button" class="meal-option" data-action="plan-pick" data-recipe="${escapeHtml(recipe.id)}" data-no-i18n><span>${escapeHtml(recipe.name[lang] || recipe.name.el)}</span>${(recipe.matched || []).length ? `<small>${escapeHtml(t('έχεις {have}/{all}', { have: recipe.matched.length, all: recipe.matched.length + recipe.missing.length }))}</small>` : ''}</button>`).join('')}</div>
    <h3 class="insights-subtitle">Αναζήτηση στο TheMealDB</h3>
    <form id="meal-search-form" class="store-form" novalidate><input class="field-input" name="q" maxlength="60" placeholder="π.χ. chicken, pasta, soup" aria-label="Αναζήτηση συνταγής" value="${escapeHtml(mealEdit.query)}" lang="en"><button class="button button-quiet" type="submit">Αναζήτηση</button></form>
    ${status ? `<p class="field-hint" id="meal-search-status">${escapeHtml(t(status))}</p>` : ''}
    ${mealEdit.results.length ? `<div class="meal-options" id="meal-results">${mealEdit.results.map((recipe) => `<button type="button" class="meal-option" data-action="plan-pick" data-recipe="${escapeHtml(recipe.id)}" data-no-i18n lang="en"><span>${escapeHtml(recipe.name.en)}</span><small>${escapeHtml(t('έχεις {have}/{all}', { have: recipe.ingredients.filter((id) => pantry[id]).length, all: recipe.ingredients.length + recipe.extra.length }))}</small></button>`).join('')}</div>` : ''}`;
  translateDom(body);
}

async function searchMeals(query) {
  mealEdit = { ...mealEdit, query, state: 'loading', results: [] };
  renderMealDialog();
  try {
    const res = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('TheMealDB');
    const results = ((await res.json()).meals || []).slice(0, 12).map(recipeFromMealDb);
    mealEdit = { ...mealEdit, results, state: results.length ? 'done' : 'empty' };
  } catch { mealEdit = { ...mealEdit, state: 'error' }; }
  renderMealDialog();
}

function saveMeal(entry) {
  state.meals = [...(state.meals || []).filter((meal) => meal.id !== entry.id), entry];
  if (!persist()) return;
  document.querySelector('#meal-dialog').close();
  renderApp();
}

function planToShopping() {
  const needs = weekShoppingNeeds(state.meals || [], planWeek, { items: state.items, shopping: state.shopping, today: localDateKey(), lang: getLang() });
  if (!needs.length) { showToast('Έχεις ό,τι χρειάζεται η εβδομάδα (ή είναι ήδη στη λίστα).'); return; }
  for (const need of needs) state.shopping.push(createShoppingItem({ name: need.name.charAt(0).toLocaleUpperCase() + need.name.slice(1), quantity: need.count }));
  if (persist()) { renderApp(); showToast(t('Μπήκαν στη λίστα: {names}', { names: needs.map((need) => need.name).join(', ') })); }
}

function renderCook() {
  if (cookTab === 'plan') return `${renderHeader('Πρόγραμμα γευμάτων', 'Σχεδίασε την εβδομάδα και πάρε έτοιμη τη λίστα αγορών.')}${cookTabs()}${renderPlan()}`;
  const today = localDateKey();
  const pantry = pantryIngredients(state.items, today);
  const builtin = suggestBuiltin(state.items, today);
  const online = onlineRecipes.key === recipeKey() ? onlineRecipes : { state: navigator.onLine === false ? 'offline' : 'loading', list: [] };
  shownRecipes = [...builtin, ...online.list];
  const urgentNames = state.items.filter((item) => pantry[Object.keys(pantry).find((id) => pantry[id].items.includes(item))]?.urgency >= 1).map((item) => item.name);
  const onlineStatus = { loading: 'Ψάχνω κι άλλες ιδέες στο TheMealDB…', offline: 'Χωρίς σύνδεση: δείχνω μόνο τις συνταγές της εφαρμογής.', error: 'Το TheMealDB δεν απάντησε. Δείχνω τις συνταγές της εφαρμογής.', done: online.list.length ? '' : 'Το TheMealDB δεν βρήκε κάτι ταιριαστό.' }[online.state] || '';
  return `${renderHeader('Τι να μαγειρέψω;', 'Ιδέες με ό,τι έχεις στο σπίτι, πρώτα όσα λήγουν σύντομα.')}${cookTabs()}
    ${urgentNames.length ? `<div class="alert-banner" role="status">◷ ${escapeHtml(t('Λήγουν σύντομα: {names}', { names: urgentNames.join(', ') }))}</div>` : ''}
    ${builtin.length || online.list.length ? `<div class="recipe-grid" id="recipe-list">${builtin.map((recipe) => renderRecipeCard(recipe, pantry)).join('')}</div>` : renderEmpty('Δεν βρήκα συνταγές', 'Πρόσθεσε στο απόθεμα βασικά υλικά (π.χ. αυγά, ντομάτες, ρύζι) για να δεις ιδέες.', 'add-item', 'Προσθήκη προϊόντος', '🍳')}
    ${online.list.length ? `<h2 class="section-title">Περισσότερες ιδέες από TheMealDB</h2><div class="recipe-grid" id="recipe-online">${online.list.map((recipe) => renderRecipeCard(recipe, pantry)).join('')}</div>` : ''}
    ${onlineStatus ? `<p class="field-hint" id="recipe-online-status">${escapeHtml(t(onlineStatus))}${online.state === 'error' ? ` <button class="text-button" type="button" data-action="retry-recipes">${escapeHtml(t('Ξανά'))}</button>` : ''}</p>` : ''}`;
}

// ---------- In-store cart ----------
const activeTrip = () => (state.trips || []).find((trip) => trip.status === 'active') || null;
let cartScanning = false;

function saveTrip(trip) {
  state.trips = [...(state.trips || []).filter((entry) => entry.id !== trip.id), trip];
  return persist();
}

function renderCart() {
  const trip = activeTrip();
  if (!trip) {
    const stores = state.stores || [];
    const recent = (state.trips || []).filter((entry) => entry.status === 'done').sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt))).slice(0, 5);
    return `${renderHeader('Καλάθι', 'Σκάναρε ό,τι βάζεις στο καρότσι και δες το σύνολο πριν το ταμείο.')}
      <section class="panel settings-card" id="cart-start"><span class="stat-icon">🛒</span><h2>Νέα ψώνια</h2>
        <form id="cart-start-form" class="cart-start-form" novalidate>
          <label class="field-label" for="cart-store">Κατάστημα</label>
          <select class="field-input" id="cart-store" name="store">${stores.map((store) => `<option value="${escapeHtml(store.id)}" data-no-i18n ${activeStore()?.id === store.id ? 'selected' : ''}>${escapeHtml(store.name)}</option>`).join('')}<option value="__new" ${stores.length ? '' : 'selected'}>${escapeHtml(t('＋ Νέο κατάστημα…'))}</option><option value="">${escapeHtml(t('Άλλο / χωρίς κατάστημα'))}</option></select>
          <div id="cart-new-store-row" ${stores.length ? 'hidden' : ''}><input class="field-input" id="cart-new-store" name="storeName" maxlength="40" placeholder="π.χ. Σκλαβενίτης Παγκρατίου" aria-label="Όνομα νέου καταστήματος" autocomplete="off"><p class="field-hint">${escapeHtml(t('Θα αποθηκευτεί στα καταστήματά σου για την επόμενη φορά.'))}</p></div>
          <label class="field-label" for="cart-budget">Προϋπολογισμός (€, προαιρετικά)</label>
          <input class="field-input" id="cart-budget" name="budget" type="number" min="0" step="1" inputmode="decimal" placeholder="π.χ. 50">
          <button class="button button-primary" type="submit">Ξεκίνα</button>
        </form></section>
      ${recent.length ? `<section class="panel"><div class="panel-heading"><div><h2>Πρόσφατα καλάθια</h2><p>Εκτίμηση και απόδειξη</p></div></div><ul class="trip-list" id="cart-recent">${recent.map((entry) => `<li><span data-no-i18n>${escapeHtml(entry.storeName || t('Κατάστημα'))} · ${escapeHtml(formatDate(entry.date))}</span><strong>${escapeHtml(money(entry.total))}</strong>${entry.receiptTotal != null ? `<small>${escapeHtml(t('απόδειξη {total} ({diff})', { total: money(entry.receiptTotal), diff: `${entry.receiptTotal - entry.total >= 0 ? '+' : ''}${money(entry.receiptTotal - entry.total)}` }))}</small>` : ''}</li>`).join('')}</ul></section>` : ''}`;
  }
  const remaining = remainingShopping(state.shopping, trip);
  const budget = budgetState(trip);
  const left = trip.budget ? trip.budget - trip.total : 0;
  return `<header class="page-heading"><div><p class="eyebrow">ΚΑΛΑΘΙ</p><h1 data-no-i18n>${escapeHtml(trip.storeName || t('Καλάθι'))}</h1><p>${escapeHtml(t('{count} προϊόντα στο καλάθι', { count: trip.items.length }))}</p></div></header>
    <section class="panel cart-total-panel is-${budget}"><p class="eyebrow">Σύνολο</p><p class="cart-total" id="cart-total">${escapeHtml(money(trip.total))}</p>
      ${trip.budget ? `<div class="budget-track"><span style="width:${Math.min(100, Math.round((trip.total / trip.budget) * 100))}%"></span></div><p class="field-hint" id="cart-budget-state">${escapeHtml(budget === 'over' ? t('Ξεπέρασες τον προϋπολογισμό κατά {amount}!', { amount: money(-left) }) : t('Απομένουν {amount} από {budget}', { amount: money(left), budget: money(trip.budget) }))}</p>` : ''}
      ${budget === 'over' ? `<p class="alert-banner is-danger" id="cart-budget-warning" role="alert">${escapeHtml(t('Πάνω από τον προϋπολογισμό'))}</p>` : ''}
      <div class="settings-actions cart-actions"><button class="button button-primary" type="button" data-action="cart-scan">📷 Σάρωση</button><button class="button button-quiet" type="button" data-action="cart-add-manual">＋ Χωρίς barcode</button></div></section>
    <section class="panel"><div class="panel-heading"><div><h2>Στο καλάθι</h2></div></div><div class="cart-lines" id="cart-lines">${trip.items.length ? trip.items.map((item) => `<div class="cart-line" data-key="${escapeHtml(item.key)}"><div class="cart-line-main"><strong class="product-name" data-no-i18n>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.unit === 'κιλά' ? t('{qty} κιλά × {price}/κιλό', { qty: String(item.qty).replace('.', ','), price: money(item.price) }) : t('{qty} × {price}', { qty: item.qty, price: money(item.price) }))}</small></div>
      ${item.unit === 'κιλά' ? '' : `<div class="qty-stepper small"><button class="icon-button" type="button" data-action="cart-line-step" data-key="${escapeHtml(item.key)}" data-delta="-1" aria-label="${escapeHtml(t('Λιγότερα {name}', { name: item.name }))}">−</button><span class="cart-qty">${item.qty}</span><button class="icon-button" type="button" data-action="cart-line-step" data-key="${escapeHtml(item.key)}" data-delta="1" aria-label="${escapeHtml(t('Περισσότερα {name}', { name: item.name }))}">＋</button></div>`}
      <button class="text-button cart-line-total" type="button" data-action="cart-edit" data-key="${escapeHtml(item.key)}" aria-label="${escapeHtml(t('Επεξεργασία {name}', { name: item.name }))}">${escapeHtml(money(lineTotal(item)))}</button><button class="icon-button" type="button" data-action="cart-remove" data-key="${escapeHtml(item.key)}" aria-label="${escapeHtml(t('Διαγραφή {name}', { name: item.name }))}">×</button></div>`).join('') : '<p class="subtle-empty">Σκάναρε το πρώτο προϊόν ή διάλεξε από τη λίστα.</p>'}</div></section>
    ${remaining.length ? `<section class="panel"><div class="panel-heading"><div><h2>Από τη λίστα (λείπουν)</h2><p>${escapeHtml(t('{count} ακόμη', { count: remaining.length }))}</p></div></div><div class="cart-remaining" id="cart-remaining">${remaining.map((row) => `<button type="button" class="meal-option" data-action="cart-from-list" data-id="${escapeHtml(row.id)}"><span data-no-i18n>${escapeHtml(row.name)}</span><small>＋ ${escapeHtml(t('στο καλάθι'))}</small></button>`).join('')}</div></section>` : ''}
    <div class="settings-actions cart-finish"><button class="button button-quiet" type="button" data-action="cart-cancel">Ακύρωση καλαθιού</button><button class="button button-primary" type="button" data-action="cart-finish" ${trip.items.length ? '' : 'disabled'}>✓ Τέλος ψωνίσματος</button></div>`;
}

function openCartItem(prefill = {}) {
  const trip = activeTrip();
  if (!trip) return;
  const form = document.querySelector('#cart-item-form');
  form.reset();
  const existing = prefill.key ? trip.items.find((item) => item.key === prefill.key) : null;
  const data = { ...existing, ...prefill };
  form.elements.key.value = existing?.key || '';
  form.elements.barcode.value = data.barcode || '';
  form.elements.shoppingId.value = data.shoppingId || '';
  form.elements.category.value = data.category || 'Άλλο';
  form.elements.name.value = data.name || '';
  form.elements.unit.value = data.unit === 'κιλά' ? 'κιλά' : 'τεμ.';
  form.elements.qty.value = String(data.qty ?? (data.unit === 'κιλά' ? '' : 1));
  const memory = existing ? null : lastPrice(state.prices || [], trip, { barcode: data.barcode, name: data.name || '' });
  const price = existing?.price ?? memory?.price;
  form.elements.raw.value = data.raw || '';
  form.elements.fixed.value = data.fixed || '';
  const priceValue = data.price ?? price;
  form.elements.price.value = priceValue ? String(priceValue.toFixed(2)).replace('.', ',') : '';
  const info = data.info;
  const note = document.querySelector('#cart-code-info');
  note.hidden = !info || info.kind === 'plain';
  if (info && info.kind !== 'plain') {
    const other = info.mode === 'weight' ? 'price' : 'weight';
    note.innerHTML = `${escapeHtml(cartCodeNote(info))}${info.prefix && info.mode ? ` <button class="panel-link" type="button" data-action="vm-switch" data-prefix="${info.prefix}" data-mode="${other}">${escapeHtml(t(other === 'price' ? 'Είναι τιμή, όχι βάρος' : 'Είναι βάρος, όχι τιμή'))}</button>` : ''}`;
  }
  if (memory && !existing && !data.unit && !data.fixed) form.elements.unit.value = memory.unit === 'κιλά' ? 'κιλά' : 'τεμ.';
  document.querySelector('#cart-price-hint').textContent = memory ? (memory.sameStore ? t('Τελευταία τιμή εδώ: {price} ({date})', { price: money(memory.price), date: formatDate(memory.date) }) : t('Τελευταία τιμή σε {store}: {price}', { store: memory.store || t('άλλο κατάστημα'), price: money(memory.price) })) : '';
  document.querySelector('#cart-item-lookup').textContent = data.lookup || '';
  document.querySelector('#cart-item-error').hidden = true;
  document.querySelector('#cart-item-title').textContent = t(existing ? 'Επεξεργασία' : 'Προϊόν στο καλάθι');
  updateCartQtyLabel();
  document.querySelector('#cart-item-dialog').showModal();
  (data.name ? form.elements.price : form.elements.name).focus();
}

function updateCartQtyLabel() {
  const form = document.querySelector('#cart-item-form');
  const kg = form.elements.unit.value === 'κιλά';
  document.querySelector('#cart-qty-label').textContent = t(kg ? 'Βάρος (κιλά)' : 'Ποσότητα');
  form.elements.qty.step = kg ? '0.005' : '1';
}

function cartCodeNote(info) {
  if (info.kind === 'plain') return '';
  const parts = [];
  if (info.kind === 'vm' || info.plu) parts.push(t('Ζυγιζόμενο (πρόθεμα {prefix}, κωδικός {plu})', { prefix: info.prefix, plu: info.plu }));
  if (info.price != null && info.mode !== 'weight') parts.push(t('Τιμή από τον κωδικό: {price}', { price: money(info.price) }));
  if (info.weightKg) parts.push(t('Βάρος από τον κωδικό: {kg} κιλά', { kg: kgText(info.weightKg) }));
  if (info.expiry || info.bestBefore) parts.push(t('Λήξη {date}', { date: formatDate(info.expiry || info.bestBefore) }));
  if (info.batch) parts.push(t('Παρτίδα {batch}', { batch: info.batch }));
  return parts.join(' · ');
}

async function cartBarcode(code) {
  const trip = activeTrip();
  const store = (state.stores || []).find((entry) => entry.id === trip?.storeId) || null;
  const info = codeInfo(code, store);
  const barcode = info.barcode || normalizeBarcode(code);
  if (!trip || !barcode) return;
  const embedded = info.price != null || info.weightKg != null;
  const inCart = trip.items.find((item) => item.barcode === barcode);
  if (!embedded && inCart && inCart.unit === 'τεμ.') {
    if (saveTrip(updateCartItem(trip, inCart.key, { qty: inCart.qty + 1 }))) { renderApp(); showToast(t('+1 {name}', { name: inCart.name })); }
    if (cartScanning) setTimeout(() => startCartScan(), 600);
    return;
  }
  const weight = info.weightKg != null;
  const prefill = { barcode, raw: String(code), fixed: embedded ? '1' : '', info, ...(weight ? { unit: 'κιλά', qty: info.weightKg } : info.price != null ? { unit: 'τεμ.', qty: 1, price: info.price } : {}) };
  const known = state.items.find((item) => item.barcode === barcode) || (state.prices || []).find((p) => p.barcode === barcode);
  if (known) { openCartItem({ ...prefill, name: known.name, category: known.category, lookup: t('Γνωστό προϊόν') }); return; }
  if (info.kind === 'vm') { openCartItem({ ...prefill, name: '', lookup: t('Ζυγιζόμενο προϊόν καταστήματος: γράψε το όνομα μία φορά, θα το θυμάμαι.') }); return; }
  openCartItem({ ...prefill, name: '', lookup: t('Αναζήτηση στο Open Food Facts…') });
  try {
    const product = navigator.onLine === false ? null : await lookupBarcode(barcode);
    const form = document.querySelector('#cart-item-form');
    if (form.elements.barcode.value !== barcode) return;
    if (product?.name && !form.elements.name.value) { form.elements.name.value = product.name; if (product.category) form.elements.category.value = product.category; }
    document.querySelector('#cart-item-lookup').textContent = product?.name ? t('Βρέθηκε στο Open Food Facts.') : t('Δεν βρέθηκε όνομα. Γράψ’ το εσύ.');
    if (product?.name && info.price == null) {
      const memory = lastPrice(state.prices || [], trip, { barcode, name: product.name });
      if (memory && !form.elements.price.value) form.elements.price.value = String(memory.price.toFixed(2)).replace('.', ',');
    }
  } catch { document.querySelector('#cart-item-lookup').textContent = t('Χωρίς σύνδεση: γράψε το όνομα.'); }
}

function startCartScan() {
  cartScanning = true;
  openScanner({ onCode: cartBarcode });
}

function saveCartItem(form) {
  const trip = activeTrip();
  if (!trip) return;
  const error = document.querySelector('#cart-item-error');
  const price = Number(String(form.elements.price.value).replace(/\s/g, '').replace(',', '.'));
  const qty = Number(String(form.elements.qty.value).replace(',', '.'));
  const unit = form.elements.unit.value;
  if (!form.elements.name.value.trim()) { error.textContent = t('Γράψε όνομα προϊόντος.'); error.hidden = false; return; }
  if (!Number.isFinite(price) || price < 0 || price > 10000) { error.textContent = t('Γράψε μια έγκυρη τιμή.'); error.hidden = false; return; }
  if (!(qty > 0)) { error.textContent = t(unit === 'κιλά' ? 'Γράψε το βάρος σε κιλά.' : 'Η ποσότητα πρέπει να είναι πάνω από 0.'); error.hidden = false; return; }
  const key = form.elements.key.value;
  const next = key ? updateCartItem(trip, key, { name: form.elements.name.value.trim(), unit, qty, price })
    : addCartItem(trip, { barcode: form.elements.barcode.value, shoppingId: form.elements.shoppingId.value, category: form.elements.category.value, name: form.elements.name.value, unit, qty, price, noMerge: Boolean(form.elements.fixed.value) });
  if (!saveTrip(next)) return;
  document.querySelector('#cart-item-dialog').close();
  renderApp();
  if (cartScanning && !key && form.elements.barcode.value) setTimeout(() => startCartScan(), 400);
}

function finishCart() {
  const trip = activeTrip();
  if (!trip) return;
  showConfirm(t('Σύνολο {total}. Θα σημειωθούν ως αγορασμένα όσα είναι στη λίστα, θα μπουν στο απόθεμα και θα καταγραφούν τα έξοδα.', { total: money(trip.total) }), () => {
    const out = finishTrip(state, trip);
    state.items = out.items; state.shopping = out.shopping; state.purchases = out.purchases; state.prices = out.prices;
    state.trips = [...(state.trips || []).filter((entry) => entry.id !== trip.id), out.trip];
    if (!persist()) return;
    cartScanning = false;
    navigate('shopping');
    showToast(t('Τέλος! {total} · {bought} από τη λίστα. Αν σκανάρεις την απόδειξη, θα συνδεθεί με αυτό το καλάθι.', { total: money(out.trip.total), bought: out.bought }));
  }, 'Τέλος ψωνίσματος;');
}


// ---------- Transport (fuel, tolls, public transport…) ----------
const TRANSPORT_LABELS = { fuel: 'Βενζίνη / καύσιμα', tolls: 'Διόδια', transit: 'ΜΜΜ (μετρό/λεωφορείο/τρένο)', taxi: 'Ταξί', parking: 'Στάθμευση', other: 'Άλλο' };
let transportMonthKey = monthKey(localDateKey());
let transportDraft = null;
const vehicleName = (id) => (state.vehicles || []).find((v) => v.id === id)?.name || '';
const transportTypeOptions = (selected) => TRANSPORT_TYPES.map((type) => `<option value="${type}" ${type === selected ? 'selected' : ''}>${TRANSPORT_ICONS[type]} ${escapeHtml(t(TRANSPORT_LABELS[type]))}</option>`).join('');
const fmtNum = (n, digits) => new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(n);

function runTransportRecurring() {
  const result = applyTransportRecurring(state.transportRecurring || [], state.transport || [], localDateKey());
  if (!result.changed) return;
  state.transportRecurring = result.rules;
  state.transport = result.entries;
  persist();
}

function renderTransportEntry(entry) {
  const ppl = pricePerLiter(entry);
  const cons = entry.type === 'fuel' ? consumptionFor(state.transport || [], entry) : null;
  const meta = [formatDate(entry.date)];
  if (entry.liters) meta.push(`${fmtNum(entry.liters, 2)} l`);
  if (ppl) meta.push(`${fmtNum(ppl, 3)} €/l`);
  if (cons) meta.push(`${fmtNum(cons.l100, 1)} l/100km`);
  if (entry.odometer) meta.push(`${fmtNum(entry.odometer, 0)} km`);
  const vname = vehicleName(entry.vehicle);
  return `<article class="product-card bill-row transport-row" data-transport="${escapeHtml(entry.id)}"><span class="product-emoji" aria-hidden="true">${TRANSPORT_ICONS[entry.type] || '🚗'}</span>
    <div class="bill-main"><h3 class="product-name">${escapeHtml(t(TRANSPORT_LABELS[entry.type]))}</h3><p class="bill-meta" data-no-i18n>${escapeHtml(meta.join(' · '))}${vname ? ` · ${escapeHtml(vname)}` : ''}${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}${entry.recurringId ? ' · ↻' : ''}</p></div>
    <strong class="bill-amount">${escapeHtml(money(entry.amount))}</strong>
    <div class="bill-actions"><button class="icon-button" type="button" data-action="transport-edit" data-id="${escapeHtml(entry.id)}" aria-label="${escapeHtml(t('Επεξεργασία'))}">✎</button><button class="icon-button" type="button" data-action="transport-delete" data-id="${escapeHtml(entry.id)}" aria-label="${escapeHtml(t('Διαγραφή'))}">🗑️</button></div></article>`;
}

function renderTransportForm() {
  const d = transportDraft || {};
  const type = d.type || 'fuel';
  const vehicles = state.vehicles || [];
  return `<section class="panel" id="transport-add"><div class="panel-heading"><div><h2>${escapeHtml(t(d.id ? 'Επεξεργασία εξόδου' : 'Νέο έξοδο μετακίνησης'))}</h2>${d.fromReceipt ? `<p id="transport-from-receipt">${escapeHtml(t(d.tollBarcode ? (d.amountFromOcr ? 'Απόδειξη διοδίων — το ποσό διαβάστηκε από τη φωτογραφία: έλεγξέ το και πάτα Αποθήκευση.' : 'Απόδειξη διοδίων από barcode — το ποσό δεν υπάρχει στον barcode: γράψε το ποσό και πάτα Αποθήκευση.') : 'Από απόδειξη — έλεγξε τα στοιχεία και πάτα Αποθήκευση.'))}</p>` : ''}</div></div>
    <form id="transport-form" novalidate><input type="hidden" name="entryId" value="${escapeHtml(d.id || '')}"><input type="hidden" name="receiptId" value="${escapeHtml(d.receiptId || '')}">
      <div class="field-row field-row-three">
        <div><label class="field-label" for="transport-type">Κατηγορία</label><select class="field-input" id="transport-type" name="type">${transportTypeOptions(type)}</select></div>
        <div><label class="field-label" for="transport-amount">Ποσό (€)</label><input class="field-input" id="transport-amount" name="amount" type="number" min="0" max="100000" step="0.01" inputmode="decimal" required value="${escapeHtml(d.amount ?? '')}"></div>
        <div><label class="field-label" for="transport-date">Ημερομηνία</label><input class="field-input" id="transport-date" name="date" type="date" required value="${escapeHtml(d.date || localDateKey())}"></div>
      </div>
      <div class="field-row field-row-three transport-fuel" id="transport-fuel" ${type === 'fuel' ? '' : 'hidden'}>
        <div><label class="field-label" for="transport-liters">Λίτρα</label><input class="field-input" id="transport-liters" name="liters" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(d.liters ?? '')}"></div>
        <div><label class="field-label" for="transport-odometer">Χιλιόμετρα οδόμετρου</label><input class="field-input" id="transport-odometer" name="odometer" type="number" min="0" step="1" inputmode="numeric" value="${escapeHtml(d.odometer ?? '')}"></div>
        <div><label class="field-label" for="transport-vehicle">Όχημα</label><select class="field-input" id="transport-vehicle" name="vehicle"><option value="">${escapeHtml(t('Κύριο όχημα'))}</option>${vehicles.map((v) => `<option value="${escapeHtml(v.id)}" data-no-i18n ${v.id === d.vehicle ? 'selected' : ''}>${escapeHtml(v.name)}</option>`).join('')}</select></div>
      </div>
      <p class="field-hint" id="transport-ppl" ${type === 'fuel' ? '' : 'hidden'}>${d.ppl ? escapeHtml(t('Τιμή απόδειξης: {ppl} €/λίτρο', { ppl: fmtNum(d.ppl, 3) })) : escapeHtml(t('Με λίτρα υπολογίζεται η τιμή ανά λίτρο· με τα χιλιόμετρα κάθε γεμίσματος και η κατανάλωση (l/100km).'))}</p>
      <label class="field-label" for="transport-note">Σημείωση</label><input class="field-input" id="transport-note" name="note" maxlength="80" placeholder="π.χ. Αθήνα – Κόρινθος" value="${escapeHtml(d.note || '')}">
      <p class="form-error" id="transport-error" role="alert" hidden></p>
      <div class="dialog-actions">${d.id || d.fromReceipt ? '<button class="button button-quiet" type="button" data-action="transport-cancel">Άκυρο</button>' : ''}<button class="button button-quiet" type="button" data-action="transport-receipt">🧾 Σάρωση απόδειξης</button><button class="button button-primary" type="submit" id="transport-save">Αποθήκευση</button></div>
    </form></section>`;
}

function renderTransport() {
  const entries = state.transport || [];
  const month = transportMonth(entries, transportMonthKey);
  const list = entries.filter((e) => e.date.startsWith(`${transportMonthKey}-`)).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const isCurrent = transportMonthKey >= monthKey(localDateKey());
  const vehicles = state.vehicles || [];
  const fuelAvg = [{ id: '', name: t('Κύριο όχημα') }, ...vehicles].map((v) => ({ v, s: fuelStats(entries, v.id) })).filter((x) => x.s.average);
  const rules = state.transportRecurring || [];
  return `${renderHeader('Μετακινήσεις', 'Βενζίνη, διόδια, ΜΜΜ, ταξί και στάθμευση — πόσα ξοδεύεις κάθε μήνα.')}
    ${renderTransportForm()}
    <div class="month-switch" role="group" aria-label="Μήνας"><button class="icon-button" type="button" data-action="transport-month" data-delta="-1" aria-label="Προηγούμενος μήνας">‹</button><strong id="transport-month" data-no-i18n>${escapeHtml(monthLabel(transportMonthKey))}</strong><button class="icon-button" type="button" data-action="transport-month" data-delta="1" aria-label="Επόμενος μήνας" ${isCurrent ? 'disabled' : ''}>›</button></div>
    <section class="panel"><div class="panel-heading"><div><h2>Σύνολο μήνα</h2><p class="big-number" id="transport-total">${escapeHtml(money(month.total))}</p></div></div>
      ${month.count ? renderBars(month.byType.map((row) => ({ label: `${TRANSPORT_ICONS[row.type]} ${t(TRANSPORT_LABELS[row.type])}`, value: row.total })), money) : '<p class="subtle-empty">Κανένα έξοδο μετακίνησης αυτόν τον μήνα.</p>'}
      ${fuelAvg.length ? `<p class="field-hint" id="transport-consumption" data-no-i18n>${fuelAvg.map((x) => `⛽ ${escapeHtml(x.v.name)}: ${escapeHtml(t('μέση κατανάλωση {l} l/100km', { l: fmtNum(x.s.average, 1) }))}`).join(' · ')}</p>` : ''}
      <button class="button button-quiet history-open" type="button" data-action="transport-history" id="transport-history-open" aria-haspopup="dialog">📋 ${escapeHtml(t('Ιστορικό ({count})', { count: list.length }))}</button></section>
    <details class="panel collapsible" id="transport-recurring" ${openAttr('transport-recurring')}><summary><h2>Μηνιαία πάγια</h2><span class="field-hint">${escapeHtml(t('{count} ενεργά', { count: rules.length }))}</span></summary><p class="field-hint">π.χ. κάρτα απεριορίστων διαδρομών ή μηνιαία στάθμευση· καταχωρούνται μόνα τους κάθε μήνα.</p>
      <form id="transport-recurring-form" class="shopping-add-form recurring-form" novalidate><select class="field-input" name="type" aria-label="Κατηγορία">${transportTypeOptions('transit')}</select><input class="field-input" name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="€" aria-label="Ποσό (€)"><input class="field-input" name="day" type="number" min="1" max="28" value="1" aria-label="Ημέρα του μήνα"><input class="field-input" name="note" maxlength="80" placeholder="π.χ. Κάρτα ΜΜΜ" aria-label="Σημείωση"><button class="button button-quiet" type="submit">＋ Προσθήκη</button></form>
      <p class="form-error" id="transport-recurring-error" role="alert" hidden></p>
      <ul class="waste-top" id="transport-rules">${rules.map((r) => `<li><span class="product-name">${TRANSPORT_ICONS[r.type]} ${escapeHtml(t(TRANSPORT_LABELS[r.type]))}${r.note ? ` · <span data-no-i18n>${escapeHtml(r.note)}</span>` : ''} · <span>${escapeHtml(t('κάθε μήνα στις {day}', { day: r.day }))}</span></span><strong>${escapeHtml(money(r.amount))}</strong><button class="icon-button" type="button" data-action="transport-rule-delete" data-id="${escapeHtml(r.id)}" aria-label="${escapeHtml(t('Διαγραφή'))}">🗑️</button></li>`).join('')}</ul></details>
    <details class="panel collapsible" id="transport-vehicles" ${openAttr('transport-vehicles')}><summary><h2>Οχήματα</h2><span class="field-hint">${escapeHtml(t('{count} οχήματα', { count: vehicles.length }))}</span></summary><p class="field-hint">Προαιρετικά, αν έχεις πάνω από ένα όχημα (για χωριστή κατανάλωση).</p>
      <form id="vehicle-form" class="store-form" novalidate><input class="field-input" name="name" maxlength="40" placeholder="π.χ. Αυτοκίνητο, Μηχανάκι" aria-label="Όνομα οχήματος"><button class="button button-quiet" type="submit">＋ Προσθήκη</button></form>
      <ul class="waste-top" id="vehicle-list">${vehicles.map((v) => `<li><span class="product-name" data-no-i18n>${escapeHtml(v.name)}</span><button class="icon-button" type="button" data-action="vehicle-delete" data-id="${escapeHtml(v.id)}" aria-label="${escapeHtml(t('Διαγραφή'))}">🗑️</button></li>`).join('')}</ul></details>`;
}

// Entries of the selected month, in a modal (same month as the summary; its own month switch stays in sync).
function renderTransportHistory() {
  const body = document.querySelector('#transport-history-body');
  if (!body) return;
  const list = (state.transport || []).filter((e) => e.date.startsWith(`${transportMonthKey}-`)).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const isCurrent = transportMonthKey >= monthKey(localDateKey());
  const total = list.reduce((sum, e) => sum + e.amount, 0);
  body.innerHTML = `<div class="month-switch" role="group" aria-label="${escapeHtml(t('Μήνας'))}"><button class="icon-button" type="button" data-action="transport-month" data-delta="-1" aria-label="${escapeHtml(t('Προηγούμενος μήνας'))}">‹</button><strong id="transport-history-month" data-no-i18n>${escapeHtml(monthLabel(transportMonthKey))}</strong><button class="icon-button" type="button" data-action="transport-month" data-delta="1" aria-label="${escapeHtml(t('Επόμενος μήνας'))}" ${isCurrent ? 'disabled' : ''}>›</button></div>
    ${list.length ? `<p class="field-hint" id="transport-history-total">${escapeHtml(t('{count} έξοδα · σύνολο {total}', { count: list.length, total: money(Math.round(total * 100) / 100) }))}</p><div class="product-list" id="transport-list">${list.map(renderTransportEntry).join('')}</div>` : `<p class="subtle-empty">${escapeHtml(t('Κανένα έξοδο μετακίνησης αυτόν τον μήνα.'))}</p>`}`;
}

const transportHistoryDialog = () => document.querySelector('#transport-history-dialog');
function openTransportHistory() {
  const dialog = transportHistoryDialog();
  renderTransportHistory();
  if (dialog.open) return;
  dialog.showModal();
  // Android back button: an extra history entry that closes the modal instead of leaving the screen.
  history.pushState({ ...(history.state || {}), transportHistory: true }, '', location.href);
}
function closeTransportHistory() { const dialog = transportHistoryDialog(); if (dialog?.open) dialog.close(); }

function saveTransportForm(form) {
  const error = document.querySelector('#transport-error');
  const id = form.elements.entryId.value;
  const existing = (state.transport || []).find((e) => e.id === id);
  const receiptRef = form.elements.receiptId.value;
  try {
    const entry = createTransport({ ...(existing || {}), id: id || undefined, type: form.elements.type.value, amount: form.elements.amount.value, date: form.elements.date.value, note: form.elements.note.value, liters: form.elements.liters.value, odometer: form.elements.odometer.value, vehicle: form.elements.vehicle.value, ...(receiptRef ? { receiptId: receiptRef } : {}) });
    if (receiptRef) entry.receiptId = receiptRef;
    state.transport = existing ? state.transport.map((e) => (e.id === id ? entry : e)) : [...(state.transport || []), entry];
    if (receiptRef && !(state.receipts || []).some((r) => r.id === receiptRef)) state.receipts = [...(state.receipts || []), { id: receiptRef, date: entry.date, total: entry.amount, store: entry.note, format: 'transport', lines: 0, importedAt: new Date().toISOString() }];
    transportMonthKey = monthKey(entry.date);
  } catch (err) { error.textContent = t(err.message); error.hidden = false; return; }
  if (!persist()) return;
  transportDraft = null;
  renderApp();
  showToast(existing ? 'Το έξοδο ενημερώθηκε.' : 'Το έξοδο μετακίνησης καταχωρήθηκε.');
}

function receiptToTransport() {
  const { receipt, id, guess } = receiptState;
  if (!receipt) return;
  const g = guess || { type: 'other', amount: receipt.total, date: receipt.date, note: receipt.issuerName };
  transportDraft = { ...g, amount: g.amount || '', date: g.date || localDateKey(), receiptId: id, fromReceipt: true };
  receiptState = { step: 'start' };
  renderReceipt();
  document.querySelector('#receipt-dialog').close();
  navigate('transport');
}

function renderTransportReceiptOffer() {
  const { guess, target, duplicate } = receiptState;
  if (duplicate || (!guess && target !== 'transport')) return '';
  const label = guess?.type === 'tolls' ? t('Μοιάζει με απόδειξη διοδίων.') : guess?.type === 'fuel' ? t('Μοιάζει με απόδειξη καυσίμων.') : '';
  return `<div class="alert-banner receipt-transport" id="receipt-transport" role="status"><p>${escapeHtml(label)} ${escapeHtml(t('Θες να την καταχωρίσεις ως έξοδο μετακίνησης αντί για προϊόντα;'))}</p><div class="settings-actions"><button class="button button-primary" type="button" data-action="receipt-to-transport">🚗 ${escapeHtml(t('Καταχώριση στις Μετακινήσεις'))}</button></div></div>`;
}

function renderTransportCard() {
  const month = transportMonth(state.transport || [], insightsMonth);
  return `<section class="panel settings-card" id="transport-card"><span class="stat-icon">🚗</span><h2>Μετακινήσεις</h2>
    <p class="big-number" id="transport-insights-total">${escapeHtml(money(month.total))}</p>
    ${month.count ? renderBars(month.byType.map((row) => ({ label: `${TRANSPORT_ICONS[row.type]} ${t(TRANSPORT_LABELS[row.type])}`, value: row.total })), money) : '<p class="subtle-empty">Κανένα έξοδο μετακίνησης αυτόν τον μήνα.</p>'}</section>`;
}

// Everything spent in a month: purchases + bills due + transport + small expenses (separate data, no overlap).
function monthTotals(month) {
  const shopping = monthlySpending(state.purchases || [], month).total;
  const transport = transportMonth(state.transport || [], month).total;
  const extras = extrasMonth(state.extras || [], month).total;
  const bills = Math.round((state.bills || []).filter((b) => String(b.due).startsWith(`${month}-`)).reduce((s, b) => s + b.amount, 0) * 100) / 100;
  const rows = [{ label: `🛒 ${t('Αγορές')}`, value: shopping }, { label: `📄 ${t('Λογαριασμοί')}`, value: bills }, { label: `🚗 ${t('Μετακινήσεις')}`, value: transport }, { label: `☕ ${t('Μικροέξοδα')}`, value: extras }];
  return { rows, total: Math.round((shopping + transport + extras + bills) * 100) / 100 };
}
function renderMonthTotals() {
  const { rows, total } = monthTotals(insightsMonth);
  return `<section class="panel settings-card" id="month-totals-card"><span class="stat-icon blue">∑</span><h2>Σύνολο εξόδων μήνα</h2><p class="big-number" id="month-grand-total">${escapeHtml(money(total))}</p>
    ${renderBars(rows, money)}</section>`;
}

// ---------- Small daily expenses (coffee, snacks, tobacco…) ----------
let extrasMonthKey = monthKey(localDateKey());
let extrasDraft = null; // manual form prefill / edit
let extrasAsk = null; // category id (or 'suggest:<id>') waiting for its first price
let extrasLast = null; // id of the entry just added with a quick button (undo / change)
let extrasCatEdit = null; // category being renamed
const extraCats = () => extraCategories(state.extraCategories || [], state.extras || []);
const extraCatLabel = (c) => (c.legacy ? t(c.name) : c.name);
const SUGGEST_OFF_KEY = 'spitothiki:extras-suggestions-off';
const suggestionsOff = () => { try { return localStorage.getItem(SUGGEST_OFF_KEY) === '1'; } catch { return false; } };
function extraCatOf(id) {
  const c = extraCats().find((x) => x.id === id);
  if (c) return { emoji: c.emoji || EXTRA_DEFAULT_EMOJI, label: extraCatLabel(c) };
  const sug = String(id).startsWith('suggest:') && EXTRA_SUGGESTIONS.find((x) => `suggest:${x.id}` === id);
  if (sug) return { emoji: sug.emoji, label: t(sug.name) };
  const d = LEGACY_EXTRA_CATEGORIES.find((x) => x.id === id);
  const stored = (state.extraCategories || []).find((x) => x.id === id);
  if (d || stored?.name) return { emoji: stored?.emoji || d?.emoji || EXTRA_DEFAULT_EMOJI, label: stored?.name || t(d.name) };
  return { emoji: EXTRA_DEFAULT_EMOJI, label: t('Κατηγορία που διαγράφηκε') };
}
const extraMonthList = (month) => (state.extras || []).filter((e) => e.date.startsWith(`${month}-`)).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));

function renderExtraEntry(entry) {
  const c = extraCatOf(entry.category);
  const meta = [formatDate(entry.date)];
  if (entry.qty > 1) meta.push(`× ${entry.qty} (${money(unitPrice(entry))})`);
  return `<article class="product-card bill-row extras-row" data-extra="${escapeHtml(entry.id)}"><span class="product-emoji" aria-hidden="true">${escapeHtml(c.emoji)}</span>
    <div class="bill-main"><h3 class="product-name">${escapeHtml(c.label)}</h3><p class="bill-meta" data-no-i18n>${escapeHtml(meta.join(' · '))}${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}</p></div>
    <strong class="bill-amount">${escapeHtml(money(entry.amount))}</strong>
    <div class="bill-actions"><button class="icon-button" type="button" data-action="extras-edit" data-id="${escapeHtml(entry.id)}" aria-label="${escapeHtml(t('Επεξεργασία'))}">✎</button><button class="icon-button" type="button" data-action="extras-delete" data-id="${escapeHtml(entry.id)}" aria-label="${escapeHtml(t('Διαγραφή'))}">🗑️</button></div></article>`;
}

function renderExtrasAsk() {
  if (!extrasAsk) return '';
  const c = extraCatOf(extrasAsk);
  return `<form class="extras-ask" id="extras-price-form" novalidate><input type="hidden" name="category" value="${escapeHtml(extrasAsk)}">
    <label class="field-label" for="extras-ask-amount">${escapeHtml(t('Πόσο κοστίζει: {name};', { name: `${c.emoji} ${c.label}` }))}</label>
    <div class="extras-ask-row"><input class="field-input" id="extras-ask-amount" name="amount" type="number" min="0" max="10000" step="0.01" inputmode="decimal" placeholder="€" aria-label="${escapeHtml(t('Ποσό (€)'))}"><button class="button button-primary" type="submit" id="extras-ask-save">${escapeHtml(t('Καταχώριση'))}</button><button class="button button-quiet" type="button" data-action="extras-ask-cancel">${escapeHtml(t('Άκυρο'))}</button></div>
    <p class="field-hint">${escapeHtml(t('Την επόμενη φορά αρκεί ένα πάτημα — θα μπαίνει αυτή η τιμή.'))}</p>
    <p class="form-error" id="extras-ask-error" role="alert" hidden></p></form>`;
}

function renderExtrasLast() {
  const e = extrasLast && (state.extras || []).find((x) => x.id === extrasLast);
  if (!e) return '';
  const c = extraCatOf(e.category);
  return `<div class="alert-banner extras-last" id="extras-last" role="status"><p>✓ ${escapeHtml(t('Καταχωρήθηκε: {name} · {amount}', { name: `${c.emoji} ${c.label}`, amount: money(e.amount) }))}</p>
    <div class="extras-last-actions"><div class="qty-stepper" role="group" aria-label="${escapeHtml(t('Ποσότητα'))}"><button class="icon-button" type="button" data-action="extras-qty" data-delta="-1" aria-label="${escapeHtml(t('Λιγότερα'))}" ${e.qty <= 1 ? 'disabled' : ''}>−</button><strong id="extras-last-qty" data-no-i18n>× ${e.qty}</strong><button class="icon-button" type="button" data-action="extras-qty" data-delta="1" aria-label="${escapeHtml(t('Περισσότερα'))}">+</button></div>
    <button class="button button-quiet" type="button" data-action="extras-last-edit">✎ ${escapeHtml(t('Αλλαγή ποσού'))}</button><button class="button button-quiet" type="button" data-action="extras-undo" id="extras-undo">↶ ${escapeHtml(t('Αναίρεση'))}</button></div></div>`;
}

// Faint chips while the user has no buttons of their own; a chip becomes a real button only when used.
function renderExtrasSuggestions() {
  if (suggestionsOff()) return `<p class="field-hint" id="extras-empty">${escapeHtml(t('Γράψε παρακάτω κάτι που αγοράζεις συχνά — γίνεται κουμπί.'))}</p>`;
  return `<div class="extras-suggest" id="extras-suggest"><p class="field-hint">${escapeHtml(t('Δεν έχεις ακόμα κουμπιά. Γράψε παρακάτω κάτι που αγοράζεις συχνά ή πάτα μια πρόταση:'))}</p>
    <div class="extras-suggest-row">${EXTRA_SUGGESTIONS.map((x) => `<button class="extras-chip" type="button" data-action="extras-suggest" data-id="${escapeHtml(x.id)}"><span aria-hidden="true">${x.emoji}</span> ${escapeHtml(t(x.name))}</button>`).join('')}<button class="icon-button extras-chip-off" type="button" data-action="extras-suggest-off" aria-label="${escapeHtml(t('Απόκρυψη προτάσεων'))}" title="${escapeHtml(t('Απόκρυψη προτάσεων'))}">×</button></div></div>`;
}
// Typing an item once (name + price) records it today and turns it into a quick button.
function renderExtrasNewForm(first) {
  return `<form class="extras-new" id="extras-new-form" novalidate><label class="field-label" for="extras-new-name">${escapeHtml(t(first ? 'Το πρώτο σου κουμπί' : '＋ Νέο κουμπί'))}</label>
    <div class="extras-new-row"><input class="field-input extras-emoji-input" id="extras-new-emoji" name="emoji" maxlength="16" placeholder="${EXTRA_DEFAULT_EMOJI}" aria-label="${escapeHtml(t('Εικονίδιο (προαιρετικό)'))}"><input class="field-input" id="extras-new-name" name="name" maxlength="40" placeholder="${escapeHtml(t('π.χ. Φρέντο'))}" aria-label="${escapeHtml(t('Τι αγόρασες;'))}" autocomplete="off"><input class="field-input" id="extras-new-amount" name="amount" type="number" min="0" max="10000" step="0.01" inputmode="decimal" placeholder="€" aria-label="${escapeHtml(t('Ποσό (€)'))}"><button class="button button-primary" type="submit" id="extras-new-save">${escapeHtml(t('Καταχώριση'))}</button></div>
    <p class="field-hint">${escapeHtml(t('Καταχωρείται σήμερα και γίνεται κουμπί· την επόμενη φορά αρκεί ένα πάτημα.'))}</p>
    <p class="form-error" id="extras-new-error" role="alert" hidden></p></form>`;
}
function saveExtrasNew(form) {
  const error = document.querySelector('#extras-new-error');
  const name = form.elements.name.value;
  try {
    const amountCheck = createExtra({ category: 'x', amount: form.elements.amount.value, date: localDateKey() });
    let cat = findExtraCategory(extraCats(), name);
    if (!cat) {
      const stored = state.extraCategories || [];
      cat = createExtraCategory({ name, emoji: form.elements.emoji.value }, stored, undefined, state.extras || []);
      state.extraCategories = [...stored, cat];
    }
    addExtra({ ...amountCheck, category: cat.id }, true);
  } catch (err) { error.textContent = t(err.message); error.hidden = false; }
}

function renderExtrasForm() {
  const d = extrasDraft || {};
  const cats = extraCats();
  const sel = d.category || cats[0]?.id || '';
  const opts = cats.map((c) => `<option value="${escapeHtml(c.id)}" data-no-i18n ${c.id === sel ? 'selected' : ''}>${escapeHtml(`${c.emoji || EXTRA_DEFAULT_EMOJI} ${extraCatLabel(c)}`)}</option>`).join('')
    + (d.category && !cats.some((c) => c.id === d.category) ? `<option value="${escapeHtml(d.category)}" selected data-no-i18n>${escapeHtml(extraCatOf(d.category).label)}</option>` : '');
  if (!cats.length && !d.id) return '';
  return `<details class="panel collapsible" id="extras-add" ${d.id || openPanels.has('extras-add') ? 'open' : ''}><summary><h2>${escapeHtml(t(d.id ? 'Επεξεργασία εξόδου' : 'Καταχώριση με το χέρι'))}</h2>${d.id ? '' : `<span class="field-hint">${escapeHtml(t('Για άλλη μέρα, άλλη τιμή ή σημείωση.'))}</span>`}</summary>
    <form id="extras-form" novalidate><input type="hidden" name="entryId" value="${escapeHtml(d.id || '')}">
      <div class="field-row"><div><label class="field-label" for="extras-category">${escapeHtml(t('Κατηγορία'))}</label><select class="field-input" id="extras-category" name="category">${opts}</select></div>
        <div><label class="field-label" for="extras-amount">${escapeHtml(t('Ποσό (€)'))}</label><input class="field-input" id="extras-amount" name="amount" type="number" min="0" max="10000" step="0.01" inputmode="decimal" required value="${escapeHtml(d.amount ?? '')}"></div></div>
      <div class="field-row"><div><label class="field-label" for="extras-qty">${escapeHtml(t('Τεμάχια'))}</label><input class="field-input" id="extras-qty" name="qty" type="number" min="1" max="99" step="1" inputmode="numeric" value="${escapeHtml(d.qty ?? 1)}"></div>
        <div><label class="field-label" for="extras-date">${escapeHtml(t('Ημερομηνία'))}</label><input class="field-input" id="extras-date" name="date" type="date" required value="${escapeHtml(d.date || localDateKey())}"></div></div>
      <label class="field-label" for="extras-note">${escapeHtml(t('Σημείωση'))}</label><input class="field-input" id="extras-note" name="note" maxlength="80" placeholder="${escapeHtml(t('π.χ. καφές με συνάδελφο'))}" value="${escapeHtml(d.note || '')}">
      <p class="field-hint">${escapeHtml(t('Το ποσό είναι το σύνολο για όλα τα τεμάχια.'))}</p>
      <p class="form-error" id="extras-error" role="alert" hidden></p>
      <div class="dialog-actions">${d.id ? `<button class="button button-quiet" type="button" data-action="extras-cancel">${escapeHtml(t('Άκυρο'))}</button>` : ''}<button class="button button-primary" type="submit" id="extras-save">${escapeHtml(t('Αποθήκευση'))}</button></div>
    </form></details>`;
}

function renderExtrasCategories() {
  const cats = extraCats();
  if (!cats.length) return '';
  const row = (c) => (extrasCatEdit === c.id
    ? `<li><form class="extras-cat-form" id="extras-cat-edit-form" novalidate><input type="hidden" name="catId" value="${escapeHtml(c.id)}"><input class="field-input extras-emoji-input" name="emoji" maxlength="16" value="${escapeHtml(c.emoji)}" aria-label="${escapeHtml(t('Εικονίδιο (προαιρετικό)'))}"><input class="field-input" name="name" maxlength="40" value="${escapeHtml(extraCatLabel(c))}" aria-label="${escapeHtml(t('Όνομα κατηγορίας'))}" data-no-i18n><button class="button button-primary" type="submit">${escapeHtml(t('Αποθήκευση'))}</button><button class="button button-quiet" type="button" data-action="extras-cat-cancel">${escapeHtml(t('Άκυρο'))}</button></form></li>`
    : `<li><span class="product-name">${escapeHtml(c.emoji || EXTRA_DEFAULT_EMOJI)} ${escapeHtml(extraCatLabel(c))}</span><span class="extras-cat-actions"><button class="icon-button" type="button" data-action="extras-cat-edit" data-id="${escapeHtml(c.id)}" aria-label="${escapeHtml(t('Μετονομασία'))}">✎</button><button class="icon-button" type="button" data-action="extras-cat-delete" data-id="${escapeHtml(c.id)}" aria-label="${escapeHtml(t('Διαγραφή'))}">🗑️</button></span></li>`);
  return `<details class="panel collapsible extras-cats" id="extras-categories" ${extrasCatEdit || openPanels.has('extras-categories') ? 'open' : ''}><summary><h2>${escapeHtml(t('Τα κουμπιά μου'))}</h2><span class="field-hint">${escapeHtml(t('Μετονόμασε ή αφαίρεσε κουμπιά. Τα πιο συχνά μπαίνουν πρώτα.'))}</span></summary>
    <ul class="waste-top" id="extras-cat-list">${cats.map(row).join('')}</ul>
    <p class="form-error" id="extras-cat-error" role="alert" hidden></p></details>`;
}

function renderExtras() {
  const entries = state.extras || [];
  const cats = extraCats();
  const today = localDateKey();
  const sum = extrasSummary(entries, today);
  const month = extrasMonth(entries, extrasMonthKey, cats);
  const list = extraMonthList(extrasMonthKey);
  const isCurrent = extrasMonthKey >= monthKey(today);
  const todayCount = (id) => entries.filter((e) => e.date === today && e.category === id).reduce((s, e) => s + (e.qty || 1), 0);
  const quick = cats.map((c) => {
    const price = lastUnitPrice(entries, c.id);
    const n = todayCount(c.id);
    return `<button class="extras-quick-button" type="button" data-action="extras-quick" data-id="${escapeHtml(c.id)}"><span class="extras-emoji" aria-hidden="true">${escapeHtml(c.emoji || EXTRA_DEFAULT_EMOJI)}</span><span class="extras-name" data-no-i18n>${escapeHtml(extraCatLabel(c))}</span><span class="extras-price" data-no-i18n>${escapeHtml(price ? money(price) : t('όρισε τιμή'))}</span>${n ? `<span class="extras-badge" data-no-i18n>${escapeHtml(t('{count} σήμερα', { count: n }))}</span>` : ''}</button>`;
  }).join('');
  const top = month.byCategory[0];
  return `${renderHeader('Μικροέξοδα', 'Καφές, σάντουιτς, καπνός και ό,τι μικρό πληρώνεις κάθε μέρα — με ένα πάτημα.')}
    <section class="panel" id="extras-quick-panel"><div class="panel-heading"><div><h2>Γρήγορη καταχώριση</h2><p>Ένα πάτημα = ένα έξοδο σήμερα, με την τελευταία τιμή.</p></div></div>
      ${renderExtrasAsk()}${renderExtrasLast()}
      ${cats.length ? `<div class="extras-quick" id="extras-quick">${quick}</div>` : renderExtrasSuggestions()}
      ${renderExtrasNewForm(!cats.length)}</section>
    <section class="stats-grid extras-stats" aria-label="${escapeHtml(t('Σύνοψη μικροεξόδων'))}">
      <article class="stat-card"><span class="stat-icon">☀️</span><div><strong id="extras-today">${escapeHtml(money(sum.today))}</strong><span>${escapeHtml(t('σήμερα'))}</span></div></article>
      <article class="stat-card"><span class="stat-icon amber">7</span><div><strong id="extras-week">${escapeHtml(money(sum.week))}</strong><span>${escapeHtml(t('αυτή την εβδομάδα'))}</span></div></article>
      <article class="stat-card"><span class="stat-icon blue">€</span><div><strong id="extras-month-now">${escapeHtml(money(sum.month))}</strong><span>${escapeHtml(t('αυτόν τον μήνα'))}</span></div></article></section>
    <div class="month-switch" role="group" aria-label="${escapeHtml(t('Μήνας'))}"><button class="icon-button" type="button" data-action="extras-month" data-delta="-1" aria-label="${escapeHtml(t('Προηγούμενος μήνας'))}">‹</button><strong id="extras-month" data-no-i18n>${escapeHtml(monthLabel(extrasMonthKey))}</strong><button class="icon-button" type="button" data-action="extras-month" data-delta="1" aria-label="${escapeHtml(t('Επόμενος μήνας'))}" ${isCurrent ? 'disabled' : ''}>›</button></div>
    <section class="panel" id="extras-month-panel"><div class="panel-heading"><div><h2>Σύνολο μήνα</h2><p class="big-number" id="extras-total">${escapeHtml(money(month.total))}</p></div></div>
      ${top ? `<p class="field-hint" id="extras-top" data-no-i18n>${escapeHtml(t('{name}: {total} τον μήνα', { name: `${extraCatOf(top.category).emoji} ${extraCatOf(top.category).label}`, total: money(top.total) }))}</p>${renderBars(month.byCategory.map((r) => ({ label: `${extraCatOf(r.category).emoji} ${extraCatOf(r.category).label} × ${r.count}`, value: r.total })), money)}` : `<p class="subtle-empty">${escapeHtml(t('Κανένα μικροέξοδο αυτόν τον μήνα.'))}</p>`}
      <button class="button button-quiet history-open" type="button" data-action="extras-history" id="extras-history-open" aria-haspopup="dialog">📋 ${escapeHtml(t('Ιστορικό ({count})', { count: list.length }))}</button></section>
    ${renderExtrasForm()}
    ${renderExtrasCategories()}`;
}

function renderExtrasHistory() {
  const body = document.querySelector('#extras-history-body');
  if (!body) return;
  const list = extraMonthList(extrasMonthKey);
  const isCurrent = extrasMonthKey >= monthKey(localDateKey());
  const total = list.reduce((sum, e) => sum + e.amount, 0);
  body.innerHTML = `<div class="month-switch" role="group" aria-label="${escapeHtml(t('Μήνας'))}"><button class="icon-button" type="button" data-action="extras-month" data-delta="-1" aria-label="${escapeHtml(t('Προηγούμενος μήνας'))}">‹</button><strong id="extras-history-month" data-no-i18n>${escapeHtml(monthLabel(extrasMonthKey))}</strong><button class="icon-button" type="button" data-action="extras-month" data-delta="1" aria-label="${escapeHtml(t('Επόμενος μήνας'))}" ${isCurrent ? 'disabled' : ''}>›</button></div>
    ${list.length ? `<p class="field-hint" id="extras-history-total">${escapeHtml(t('{count} έξοδα · σύνολο {total}', { count: list.length, total: money(Math.round(total * 100) / 100) }))}</p><div class="product-list" id="extras-list">${list.map(renderExtraEntry).join('')}</div>` : `<p class="subtle-empty">${escapeHtml(t('Κανένα μικροέξοδο αυτόν τον μήνα.'))}</p>`}`;
  translateDom(body);
}
const extrasHistoryDialog = () => document.querySelector('#extras-history-dialog');
function openExtrasHistory() {
  const dialog = extrasHistoryDialog();
  renderExtrasHistory();
  if (dialog.open) return;
  dialog.showModal();
  history.pushState({ ...(history.state || {}), extrasHistory: true }, '', location.href);
}
function closeExtrasHistory() { const dialog = extrasHistoryDialog(); if (dialog?.open) dialog.close(); }

function addExtra(entry, quick) {
  state.extras = [...(state.extras || []), entry];
  extrasMonthKey = monthKey(entry.date);
  extrasLast = quick ? entry.id : null;
  extrasAsk = null;
  if (!persist()) return;
  renderApp();
  const c = extraCatOf(entry.category);
  showToast(t('Καταχωρήθηκε: {name} · {amount}', { name: `${c.emoji} ${c.label}`, amount: money(entry.amount) }));
}
function extrasQuick(id) {
  const entry = quickExtra(state.extras || [], id, localDateKey());
  if (!entry) { extrasAsk = id; extrasLast = null; renderApp(); requestAnimationFrame(() => { const el = document.querySelector('#extras-ask-amount'); el?.focus(); el?.scrollIntoView({ block: 'center' }); }); return; }
  addExtra(entry, true);
}
function saveExtrasForm(form) {
  const error = document.querySelector('#extras-error');
  const id = form.elements.entryId.value;
  const existing = (state.extras || []).find((e) => e.id === id);
  let entry;
  try { entry = createExtra({ ...(existing || {}), id: id || undefined, category: form.elements.category.value, amount: form.elements.amount.value, qty: form.elements.qty.value, date: form.elements.date.value, note: form.elements.note.value }); }
  catch (err) { error.textContent = t(err.message); error.hidden = false; return; }
  extrasDraft = null;
  if (!existing) { addExtra(entry, false); return; }
  state.extras = state.extras.map((e) => (e.id === id ? entry : e));
  extrasMonthKey = monthKey(entry.date);
  if (persist()) { renderApp(); showToast('Το έξοδο ενημερώθηκε.'); }
}
function saveExtraCategory(form, isEdit) {
  const error = document.querySelector('#extras-cat-error');
  const stored = state.extraCategories || [];
  try {
    const rec = createExtraCategory({ id: isEdit ? form.elements.catId.value : undefined, name: form.elements.name.value, emoji: form.elements.emoji.value }, stored, undefined, state.extras || []);
    state.extraCategories = stored.some((c) => c.id === rec.id) ? stored.map((c) => (c.id === rec.id ? rec : c)) : [...stored, rec];
  } catch (err) { if (error) { error.textContent = t(err.message); error.hidden = false; } return; }
  extrasCatEdit = null;
  if (persist()) { renderApp(); showToast(isEdit ? 'Η κατηγορία ενημερώθηκε.' : 'Η κατηγορία προστέθηκε.'); }
}
function renderExtrasCard() {
  const cats = extraCats();
  const month = extrasMonth(state.extras || [], insightsMonth, cats);
  return `<section class="panel settings-card" id="extras-card"><span class="stat-icon">☕</span><h2>Μικροέξοδα</h2>
    <p class="big-number" id="extras-insights-total">${escapeHtml(money(month.total))}</p>
    ${month.count ? renderBars(month.byCategory.map((r) => ({ label: `${extraCatOf(r.category).emoji} ${extraCatOf(r.category).label}`, value: r.total })), money) : `<p class="subtle-empty">${escapeHtml(t('Κανένα μικροέξοδο αυτόν τον μήνα.'))}</p>`}</section>`;
}

// ---------- Household bills ----------
const BILL_TYPE_LABELS = { electricity: 'Ρεύμα', water: 'Νερό', gas: 'Φυσικό αέριο / θέρμανση', rent: 'Ενοίκιο / κοινόχρηστα', phone: 'Τηλέφωνο', internet: 'Internet', subscription: 'Συνδρομή', insurance: 'Ασφάλεια', tax: 'Φόροι / τέλη', other: 'Άλλο' };
const BILL_PERIOD_LABELS = { 0: 'Μία φορά', 1: 'Κάθε μήνα', 2: 'Κάθε 2 μήνες', 3: 'Κάθε 3 μήνες', 4: 'Κάθε 4 μήνες', 6: 'Κάθε 6 μήνες', 12: 'Κάθε χρόνο' };
let billsYear = Number(localDateKey().slice(0, 4));

function billDueLabel(bill) {
  if (bill.paid) return t('Πληρώθηκε {date}', { date: formatDate(bill.paidAt || bill.due) });
  const days = Math.round((Date.parse(`${bill.due}T00:00:00Z`) - Date.parse(`${localDateKey()}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return t('Έληξε πριν {days} ημ. ({date})', { days: -days, date: formatDate(bill.due) });
  if (days === 0) return t('Λήγει σήμερα');
  if (days === 1) return t('Λήγει αύριο');
  return t('Λήγει σε {days} ημέρες ({date})', { days, date: formatDate(bill.due) });
}

function renderBillRow(bill) {
  const today = localDateKey();
  const state_ = bill.paid ? 'paid' : bill.due < today ? 'overdue' : billsDue([bill], today).length ? 'soon' : 'later';
  return `<article class="product-card bill-row is-${state_}" data-bill="${escapeHtml(bill.id)}"><span class="product-emoji" aria-hidden="true">${BILL_ICONS[bill.type] || '📄'}</span>
    <div class="bill-main"><h3 class="product-name" data-no-i18n>${escapeHtml(bill.name)}</h3><p class="bill-meta"><span class="bill-due">${escapeHtml(billDueLabel(bill))}</span>${bill.period ? ` · <span>${escapeHtml(t(BILL_PERIOD_LABELS[bill.period]))}</span>` : ''}${bill.billingFrom && bill.billingTo ? ` · <span class="bill-billing">${escapeHtml(t('περίοδος {from} – {to}', { from: formatDate(bill.billingFrom), to: formatDate(bill.billingTo) }))}</span>` : ''}${bill.reference ? ` · <code class="bill-ref" data-no-i18n>${escapeHtml(bill.reference)}</code>` : ''}</p></div>
    <strong class="bill-amount">${escapeHtml(money(bill.amount))}</strong>
    <div class="bill-actions">${bill.paid ? `<button class="button button-quiet" type="button" data-action="bill-unpay" data-id="${escapeHtml(bill.id)}">Αναίρεση</button>` : `<button class="button button-primary" type="button" data-action="bill-pay" data-id="${escapeHtml(bill.id)}">✓ Πληρώθηκε</button>`}
    ${bill.reference ? `<button class="icon-button" type="button" data-action="bill-copy" data-id="${escapeHtml(bill.id)}" aria-label="${escapeHtml(t('Αντιγραφή κωδικού {name}', { name: bill.name }))}">📋</button>` : ''}
    <button class="icon-button" type="button" data-action="bill-edit" data-id="${escapeHtml(bill.id)}" aria-label="${escapeHtml(t('Επεξεργασία {name}', { name: bill.name }))}">✎</button><button class="icon-button" type="button" data-action="bill-delete" data-id="${escapeHtml(bill.id)}" aria-label="${escapeHtml(t('Διαγραφή {name}', { name: bill.name }))}">🗑️</button></div></article>`;
}

const billsHistory = { open: false, filter: '', limit: 10 };
function renderBillsHistory(history) {
  if (!history.count) return '';
  const label = t('Ιστορικό πληρωμένων ({count})', { count: history.count });
  if (!billsHistory.open) return `<section class="panel bills-history" id="bills-history"><button class="history-toggle" type="button" data-action="bills-history-toggle" aria-expanded="false"><span>${escapeHtml(label)}</span><span aria-hidden="true">▸</span></button></section>`;
  const options = [`<option value="">${escapeHtml(t('Όλοι'))}</option>`,
    ...history.types.map((type) => `<option value="type:${escapeHtml(type)}" ${billsHistory.filter === `type:${type}` ? 'selected' : ''}>${BILL_ICONS[type] || ''} ${escapeHtml(t(BILL_TYPE_LABELS[type] || 'Άλλο'))}</option>`),
    ...history.names.map((name) => `<option value="name:${escapeHtml(name)}" data-no-i18n ${billsHistory.filter.toLocaleLowerCase('el-GR') === `name:${name}`.toLocaleLowerCase('el-GR') ? 'selected' : ''}>${escapeHtml(name)}</option>`)];
  return `<section class="panel bills-history" id="bills-history"><button class="history-toggle" type="button" data-action="bills-history-toggle" aria-expanded="true"><span>${escapeHtml(label)}</span><span aria-hidden="true">▾</span></button>
    <label class="history-filter"><span>Φίλτρο</span> <select class="field-input" id="bills-history-filter">${options.join('')}</select></label>
    <div id="bills-paid">${history.groups.length ? history.groups.map((group) => `<div class="history-month"><h3><span data-no-i18n>${escapeHtml(monthLabel(group.month))}</span> <small data-no-i18n>${escapeHtml(money(group.total))}</small></h3><div class="product-list">${group.bills.map(renderBillRow).join('')}</div></div>`).join('') : `<p class="subtle-empty">${escapeHtml(t('Κανένας πληρωμένος με αυτό το φίλτρο.'))}</p>`}</div>
    ${history.more > 0 ? `<button class="button button-quiet history-more" type="button" data-action="bills-history-more">${escapeHtml(t('Δείξε περισσότερα ({count})', { count: history.more }))}</button>` : ''}</section>`;
}

function renderBills() {
  const bills = state.bills || [];
  const today = localDateKey();
  const unpaid = unpaidBills(bills);
  const history = paidHistory(bills, { filter: billsHistory.filter, limit: billsHistory.limit });
  const due = billsDue(bills, today);
  const overdue = due.filter((bill) => bill.overdue);
  const toPay = unpaid.reduce((sum, bill) => sum + bill.amount, 0);
  return `<header class="page-heading"><div>${renderCrumbs()}<h1>Λογαριασμοί</h1><p>ΔΕΗ, νερό, ενοίκιο, συνδρομές: τι πληρώνεις και πότε.</p></div><div class="page-actions"><label class="button button-quiet file-button" id="bill-import"><span>📥 Εισαγωγή PDF</span><input type="file" accept="application/pdf,.pdf,image/*" class="visually-hidden" data-bill-file id="bill-file"></label><button class="button button-primary" type="button" data-action="add-bill"><span aria-hidden="true">＋</span>Προσθήκη λογαριασμού</button></div></header>
    ${due.length ? `<div class="alert-banner${overdue.length ? ' is-danger' : ''}" role="status" id="bills-alert">${escapeHtml(overdue.length ? t(overdue.length === 1 ? '1 ληξιπρόθεσμος λογαριασμός · σύνολο {sum}' : '{count} ληξιπρόθεσμοι λογαριασμοί · σύνολο {sum}', { count: overdue.length, sum: money(overdue.reduce((s, b) => s + b.amount, 0)) }) : t(due.length === 1 ? '1 λογαριασμός λήγει σύντομα · σύνολο {sum}' : '{count} λογαριασμοί λήγουν σύντομα · σύνολο {sum}', { count: due.length, sum: money(due.reduce((s, b) => s + b.amount, 0)) }))}</div>` : ''}
    ${bills.length ? `<section class="panel"><div class="panel-heading"><div><h2>Προς πληρωμή</h2><p>${escapeHtml(t('{count} απλήρωτοι · {sum}', { count: unpaid.length, sum: money(toPay) }))}</p></div></div><div class="product-list" id="bills-unpaid">${unpaid.length ? unpaid.map(renderBillRow).join('') : '<p class="subtle-empty">Όλα πληρωμένα! 🎉</p>'}</div></section>
    ${renderBillsHistory(history)}
    <p class="field-hint">${escapeHtml(t('Οι υπενθυμίσεις έρχονται με τις ειδοποιήσεις της εφαρμογής (Ρυθμίσεις). Στατιστικά ανά μήνα και έτος στα Στατιστικά.'))}</p>`
    : renderEmpty('Κανένας λογαριασμός ακόμη', 'Πρόσθεσε ΔΕΗ, νερό, ενοίκιο ή συνδρομές για να θυμάσαι πότε λήγουν.', 'add-bill', 'Προσθήκη λογαριασμού', '📄')}`;
}

function openBillDialog(id = '') {
  const form = document.querySelector('#bill-form');
  form.reset();
  const bill = (state.bills || []).find((entry) => entry.id === id);
  form.elements.type.innerHTML = BILL_TYPES.map((type) => `<option value="${type}">${BILL_ICONS[type]} ${escapeHtml(t(BILL_TYPE_LABELS[type]))}</option>`).join('');
  form.elements.period.innerHTML = BILL_PERIODS.map((period) => `<option value="${period}">${escapeHtml(t(BILL_PERIOD_LABELS[period]))}</option>`).join('');
  form.elements.billId.value = bill?.id || '';
  form.elements.name.value = bill?.name || '';
  form.elements.type.value = bill?.type || 'other';
  form.elements.amount.value = bill ? bill.amount : '';
  form.elements.due.value = bill?.due || '';
  form.elements.period.value = String(bill?.period ?? 1);
  form.elements.remind.value = String(bill?.remind ?? 3);
  form.elements.reference.value = bill?.reference || '';
  form.dataset.typeTouched = bill ? '1' : '';
  form.elements.billingFrom.value = bill?.billingFrom || '';
  form.elements.billingTo.value = bill?.billingTo || '';
  setBillDuplicate(null);
  document.querySelector('#bill-error').hidden = true;
  document.querySelector('#bill-scan-status').textContent = t('Σκάναρε το QR ή τον barcode του λογαριασμού για να συμπληρωθεί ο κωδικός πληρωμής (RF) και, αν υπάρχει, το ποσό.');
  document.querySelector('#bill-title').textContent = t(bill ? 'Επεξεργασία λογαριασμού' : 'Προσθήκη λογαριασμού');
  document.querySelector('#bill-dialog').showModal();
}

function applyBillCode(code) {
  const dialog = document.querySelector('#bill-dialog');
  if (!dialog.open) dialog.showModal();
  const form = document.querySelector('#bill-form');
  const status = document.querySelector('#bill-scan-status');
  const parsed = parseBillCode(code);
  if (!parsed || (!parsed.reference && !parsed.amount)) { status.textContent = t('Ο κωδικός δεν αναγνωρίστηκε. Συμπλήρωσε τα στοιχεία με το χέρι.'); return; }
  if (parsed.reference) form.elements.reference.value = parsed.reference;
  if (parsed.amount) form.elements.amount.value = parsed.amount;
  if (parsed.name && !form.elements.name.value) { form.elements.name.value = parsed.name; if (!form.dataset.typeTouched) form.elements.type.value = guessBillType(parsed.name); }
  status.textContent = parsed.kind === 'epc' ? t('Βρέθηκε QR πληρωμής SEPA: συμπληρώθηκαν δικαιούχος, ποσό και κωδικός.')
    : parsed.rfValid ? t('Βρέθηκε έγκυρος κωδικός πληρωμής RF.')
    : parsed.kind === 'rf' ? t('Βρέθηκε κωδικός RF, αλλά το ψηφίο ελέγχου δεν ταιριάζει. Έλεγξέ τον.')
    : t('Ο κωδικός αποθηκεύτηκε ως αναφορά πληρωμής. Συμπλήρωσε ποσό και λήξη.');
}

function setBillDuplicate(duplicate) {
  const banner = document.querySelector('#bill-duplicate');
  banner.hidden = !duplicate;
  banner.textContent = duplicate ? t('Αυτός ο λογαριασμός υπάρχει ήδη ({name}, {amount}, λήξη {date}).', { name: duplicate.name, amount: money(duplicate.amount), date: formatDate(duplicate.due) }) : '';
  document.querySelector('#bill-save').disabled = Boolean(duplicate);
}

// PDF / photo of a bill -> prefilled dialog for review (nothing is saved until the user presses Save).
async function importBillFile(file) {
  if (!file) return;
  openBillDialog();
  const form = document.querySelector('#bill-form');
  const status = document.querySelector('#bill-scan-status');
  status.textContent = t('Ανάγνωση λογαριασμού…');
  try {
    const { parsed, source } = await readBillFile(file, {
      recognizeImpl: window.__spitoOcrMock,
      onProgress: (m) => { status.textContent = m.status === 'recognizing text' ? t('Αναγνώριση κειμένου… {pct}%', { pct: Math.round((m.progress || 0) * 100) }) : m.status === 'ocr' ? t('Το PDF δεν έχει κείμενο· αναγνώριση από εικόνα…') : t('Ανάγνωση λογαριασμού…'); }
    });
    if (parsed.name) { form.elements.name.value = parsed.name; form.elements.type.value = parsed.type; form.dataset.typeTouched = '1'; }
    if (parsed.amount != null) form.elements.amount.value = parsed.amount;
    if (parsed.due) form.elements.due.value = parsed.due;
    if (parsed.reference) form.elements.reference.value = parsed.reference;
    form.elements.period.value = parsed.type === 'water' ? '4' : parsed.type === 'electricity' ? '1' : form.elements.period.value;
    form.elements.billingFrom.value = parsed.period?.from || '';
    form.elements.billingTo.value = parsed.period?.to || '';
    const found = [parsed.name && t('πάροχος'), parsed.amount != null && t('ποσό'), parsed.due && t('λήξη'), parsed.reference && (parsed.rfValid ? t('κωδικός RF ✓') : t('κωδικός RF (έλεγξέ τον)')), parsed.period && t('περίοδος {from} – {to}', { from: formatDate(parsed.period.from), to: formatDate(parsed.period.to) })].filter(Boolean);
    const missing = [!parsed.name && t('πάροχος'), parsed.amount == null && t('ποσό'), !parsed.due && t('λήξη')].filter(Boolean);
    status.textContent = found.length
      ? `${t(source === 'ocr' ? 'Από αναγνώριση εικόνας' : 'Από το PDF')}: ${found.join(', ')}.${missing.length ? ` ${t('Συμπλήρωσε: {fields}.', { fields: missing.join(', ') })}` : ''} ${t('Έλεγξε και πάτα Αποθήκευση.')}`
      : t('Δεν βρέθηκαν στοιχεία λογαριασμού στο αρχείο. Συμπλήρωσε τα στοιχεία με το χέρι.');
    setBillDuplicate(parsed.name || parsed.reference ? findDuplicateBill(state.bills || [], { ...parsed, amount: parsed.amount ?? 0 }) : null);
  } catch (error) {
    status.textContent = t('Δεν ήταν δυνατή η ανάγνωση του αρχείου. Συμπλήρωσε τα στοιχεία με το χέρι.');
  }
}

// A file shared to the app (Web Share Target) waits in the SW cache; import it once.
async function takeSharedFile() {
  if (!new URLSearchParams(location.search).has('share') || !('caches' in window)) return;
  history.replaceState(null, '', `${location.pathname}#bills`);
  try {
    const cache = await caches.open('spitothiki-share');
    const response = await cache.match('./__shared-file');
    if (!response) { showToast('Δεν βρέθηκε το κοινοποιημένο αρχείο.'); return; }
    await cache.delete('./__shared-file');
    const blob = await response.blob();
    const file = new File([blob], decodeURIComponent(response.headers.get('x-file-name') || 'shared'), { type: response.headers.get('content-type') || blob.type });
    navigate('bills');
    importBillFile(file);
  } catch {}
}

function saveBillForm(form) {
  const error = document.querySelector('#bill-error');
  const id = form.elements.billId.value;
  const existing = (state.bills || []).find((bill) => bill.id === id);
  try {
    const bill = createBill({ ...(existing || {}), id: id || undefined, name: form.elements.name.value, type: form.elements.type.value, amount: form.elements.amount.value === '' ? NaN : form.elements.amount.value, due: form.elements.due.value, period: form.elements.period.value, remind: form.elements.remind.value, reference: form.elements.reference.value, billingFrom: form.elements.billingFrom.value, billingTo: form.elements.billingTo.value });
    state.bills = existing ? state.bills.map((entry) => (entry.id === id ? bill : entry)) : [...(state.bills || []), bill];
  } catch (err) { error.textContent = t(err.message); error.hidden = false; return; }
  if (!persist()) return;
  document.querySelector('#bill-dialog').close();
  renderApp(); scheduleBackgroundSnapshot();
  showToast(existing ? 'Ο λογαριασμός ενημερώθηκε.' : 'Ο λογαριασμός προστέθηκε.');
}

function renderBillsCard() {
  const stats = billStats(state.bills || [], billsYear);
  const short = (month) => new Intl.DateTimeFormat(locale(), { month: 'short' }).format(new Date(`${month}-15T12:00:00`));
  const current = Number(localDateKey().slice(0, 4));
  return `<section class="panel settings-card" id="bills-card"><span class="stat-icon">📄</span><h2>Λογαριασμοί</h2>
    <div class="month-switch" role="group" aria-label="Έτος"><button class="icon-button" type="button" data-action="bills-year" data-delta="-1" aria-label="Προηγούμενο έτος">‹</button><strong id="bills-year" data-no-i18n>${billsYear}</strong><button class="icon-button" type="button" data-action="bills-year" data-delta="1" aria-label="Επόμενο έτος" ${billsYear > current ? 'disabled' : ''}>›</button></div>
    <p class="big-number" id="bills-year-total">${escapeHtml(money(stats.total))}</p>
    <p class="field-hint">${escapeHtml(t('Σύνολο έτους · {month}: {sum}', { month: monthLabel(insightsMonth), sum: money(insightsMonth.startsWith(`${billsYear}-`) ? stats.months[Number(insightsMonth.slice(5, 7)) - 1].total : 0) }))}</p>
    ${stats.total ? `<div id="bills-months">${renderBars(stats.months.map((row) => ({ label: short(row.month), value: row.total })), money)}</div><h3 class="insights-subtitle">Ανά είδος</h3>${renderBars(stats.byType.map((row) => ({ label: `${BILL_ICONS[row.type]} ${t(BILL_TYPE_LABELS[row.type])}`, value: row.total })), money)}` : '<p class="subtle-empty">Δεν υπάρχουν λογαριασμοί για αυτό το έτος.</p>'}</section>`;
}

// ---------- Food waste ----------
const WASTE_LABELS = { expired: 'Έληξε', spoiled: 'Χάλασε', leftover: 'Περίσσεψε', other: 'Άλλος λόγος' };

function openWasteDialog(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const dialog = document.querySelector('#waste-dialog');
  const form = document.querySelector('#waste-form');
  form.elements.itemId.value = item.id;
  form.elements.quantity.value = item.quantity > 0 ? item.quantity : 1;
  form.elements.quantity.max = String(Math.max(Number(item.quantity), 1));
  form.elements.reason.innerHTML = WASTE_REASONS.map((reason) => `<option value="${reason}">${escapeHtml(t(WASTE_LABELS[reason]))}</option>`).join('');
  form.elements.reason.value = expiryStatus(item.expiry, localDateKey()) === 'expired' ? 'expired' : 'spoiled';
  document.querySelector('#waste-name').textContent = `${item.name} · ${item.quantity} ${t(item.unit)}`;
  document.querySelector('#waste-error').hidden = true;
  dialog.showModal();
}

// ---------- Insights: spending & waste ----------
let insightsMonth = monthKey(localDateKey());
const money = (value) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(value || 0);
const monthLabel = (month) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00`));

function renderBars(rows, format) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `<div class="bar-list">${rows.map((row) => `<div class="bar-row"><span class="bar-label">${escapeHtml(row.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, Math.round((row.value / max) * 100))}%"></span></span><strong class="bar-value">${escapeHtml(format(row.value))}</strong></div>`).join('')}</div>`;
}

function renderInsights() {
  const spending = monthlySpending(state.purchases || [], insightsMonth);
  const previous = monthlySpending(state.purchases || [], shiftMonth(insightsMonth, -1));
  const waste = wasteStats(state.waste || [], insightsMonth);
  const isCurrent = insightsMonth >= monthKey(localDateKey());
  return `${renderHeader('Σύνολο εξόδων', 'Πόσα ξοδεύεις και τι πετιέται, ανά μήνα.')}
    <div class="month-switch" role="group" aria-label="Μήνας"><button class="icon-button" type="button" data-action="insights-month" data-delta="-1" aria-label="Προηγούμενος μήνας">‹</button><strong id="insights-month" data-no-i18n>${escapeHtml(monthLabel(insightsMonth))}</strong><button class="icon-button" type="button" data-action="insights-month" data-delta="1" aria-label="Επόμενος μήνας" ${isCurrent ? 'disabled' : ''}>›</button></div>
    <div class="settings-grid insights-grid">${renderMonthTotals(spending)}
    <section class="panel settings-card" id="spending-card"><span class="stat-icon blue">€</span><h2>Έξοδα</h2>
      <p class="big-number" id="spending-total">${escapeHtml(money(spending.total))}</p>
      <p class="field-hint">${escapeHtml(t('{count} αγορές με τιμή · προηγούμενος μήνας: {prev}', { count: spending.count, prev: money(previous.total) }))}</p>
      ${spending.byCategory.length ? renderBars(spending.byCategory.map((row) => ({ label: categoryLabel(row.category), value: row.total })), money) : '<p class="subtle-empty">Όταν τσεκάρεις κάτι ως αγορασμένο, γράψε την τιμή του (€) στη λίστα αγορών για να βλέπεις εδώ τα έξοδα.</p>'}</section>
    <section class="panel settings-card" id="waste-card"><span class="stat-icon amber">🗑</span><h2>Σπατάλη τροφίμων</h2>
      <p class="big-number" id="waste-total">${waste.count}</p>
      <p class="field-hint">${escapeHtml(t(waste.count === 1 ? 'φορά που πετάχτηκε κάτι' : 'φορές που πετάχτηκε κάτι'))}</p>
      ${waste.count ? `${renderBars(WASTE_REASONS.filter((reason) => waste.byReason[reason]).map((reason) => ({ label: t(WASTE_LABELS[reason]), value: waste.byReason[reason] })), String)}
      <h3 class="insights-subtitle">Πετιούνται πιο συχνά</h3><ul class="waste-top">${waste.top.map((entry) => `<li><span class="product-name">${escapeHtml(entry.name)}</span><strong>× ${entry.count}</strong></li>`).join('')}</ul>` : '<p class="subtle-empty">Τίποτα αυτόν τον μήνα. Όταν πετάς κάτι, πάτα 🗑 στο απόθεμα για να το καταγράψεις.</p>'}</section>${renderBillsCard()}${renderTransportCard()}${renderExtrasCard()}</div>`;
}

function makeDemoItems() {
  const today = localDateKey();
  const addDays = (amount) => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() + amount); return localDateKey(date); };
  return [
    createPantryItem({ name: 'Γάλα', quantity: 1, unit: 'λίτρα', minimum: 2, category: 'Γαλακτοκομικά', location: 'Ψυγείο', expiry: addDays(3) }),
    createPantryItem({ name: 'Μήλα', quantity: 4, unit: 'τεμ.', minimum: 2, category: 'Φρούτα & λαχανικά', location: 'Ντουλάπι', expiry: addDays(6) }),
    createPantryItem({ name: 'Ρύζι', quantity: 2, unit: 'πακέτα', minimum: 1, category: 'Ξηρά τρόφιμα', location: 'Ντουλάπι' }),
    createPantryItem({ name: 'Γιαούρτι', quantity: 2, unit: 'τεμ.', minimum: 2, category: 'Γαλακτοκομικά', location: 'Ψυγείο', expiry: addDays(1) }),
    createPantryItem({ name: 'Ελαιόλαδο', quantity: 1, unit: 'λίτρα', minimum: 1, category: 'Ξηρά τρόφιμα', location: 'Ντουλάπι' })
  ];
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `spitothiki-backup-${localDateKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Το αντίγραφο ασφαλείας κατέβηκε.');
}

function handleAction(button) {
  const { action, id } = button.dataset;
  if (action === 'add-item') openItemDialog();
  else if (action === 'close-dialog') itemDialog.close();
  else if (action === 'edit-item') openItemDialog(id);
  else if (action === 'navigate') navigate(button.dataset.view);
  else if (action === 'adjust-quantity') {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    const nextQuantity = Math.min(MAX_QUANTITY, Math.max(0, Number(item.quantity) + Number(button.dataset.delta)));
    if (nextQuantity === Number(item.quantity) && Number(button.dataset.delta) > 0) { showToast(t('Η μέγιστη ποσότητα είναι {max}.', { max: MAX_QUANTITY })); return; }
    state.items = state.items.map((entry) => entry.id === id ? { ...entry, quantity: nextQuantity, updatedAt: new Date().toISOString() } : entry);
    persist(); renderApp();
  } else if (action === 'cart-scan') startCartScan();
  else if (action === 'cart-add-manual') { cartScanning = false; openCartItem({}); }
  else if (action === 'close-cart-item') { cartScanning = false; document.querySelector('#cart-item-dialog').close(); }
  else if (action === 'cart-from-list') { const row = state.shopping.find((entry) => entry.id === id); if (row) { cartScanning = false; openCartItem({ name: row.name, shoppingId: row.id, qty: normalizeUnit(row.unit) === 'κιλά' ? row.quantity : Math.max(1, Math.round(row.quantity)), unit: normalizeUnit(row.unit) === 'κιλά' ? 'κιλά' : 'τεμ.', category: rowCategory(row, state.items) }); } }
  else if (action === 'cart-edit') { cartScanning = false; openCartItem({ key: button.dataset.key }); }
  else if (action === 'cart-remove') { const trip = activeTrip(); if (trip && saveTrip(removeCartItem(trip, button.dataset.key))) renderApp(); }
  else if (action === 'cart-line-step') { const trip = activeTrip(); const item = trip?.items.find((entry) => entry.key === button.dataset.key); if (item && saveTrip(updateCartItem(trip, item.key, { qty: item.qty + Number(button.dataset.delta) }))) renderApp(); }
  else if (action === 'cart-qty-step') { const input = document.querySelector('#cart-item-qty'); const kg = document.querySelector('#cart-item-unit').value === 'κιλά'; input.value = String(Math.max(0, Math.round(((Number(input.value) || 0) + Number(button.dataset.delta) * (kg ? 0.1 : 1)) * 1000) / 1000)); }
  else if (action === 'keypad') {
    const input = document.querySelector('#cart-item-price');
    const key = button.dataset.key;
    let value = input.value.replace('.', ',');
    if (key === '⌫') value = value.slice(0, -1);
    else if (key === ',') { if (!value.includes(',')) value = `${value || '0'},`; }
    else if (!/,\d{2}$/.test(value)) value = value === '0' ? key : value + key;
    input.value = value;
  } else if (action === 'cart-finish') finishCart();
  else if (action === 'cart-cancel') {
    const trip = activeTrip();
    if (trip) showConfirm('Το καλάθι θα διαγραφεί χωρίς να καταγραφεί τίποτα.', () => { state.trips = state.trips.filter((entry) => entry.id !== trip.id); cartScanning = false; if (persist()) renderApp(); }, 'Ακύρωση καλαθιού;');
  } else if (action === 'open-menu') { const sheet = document.querySelector('#menu-sheet'); sheet.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.view === activeView)); sheet.showModal(); }
  else if (action === 'close-menu') document.querySelector('#menu-sheet').close();
  else if (action === 'quick') runQuickAction(button.dataset.quick);
  else if (action === 'close-quick') document.querySelector('#quick-sheet').close();
  else if (action === 'menu-receipt') { document.querySelector('#menu-sheet').close(); openReceiptDialog(); }
  else if (action === 'menu-mealplan') { document.querySelector('#menu-sheet').close(); navigate('cook'); setTimeout(() => document.querySelector('#plan-grid')?.scrollIntoView({ block: 'start' }), 50); }
  else if (action === 'transport-month') { transportMonthKey = shiftMonth(transportMonthKey, Number(button.dataset.delta)); renderApp(); if (transportHistoryDialog()?.open) renderTransportHistory(); }
  else if (action === 'transport-history') openTransportHistory();
  else if (action === 'extras-month') { extrasMonthKey = shiftMonth(extrasMonthKey, Number(button.dataset.delta)); renderApp(); if (extrasHistoryDialog()?.open) renderExtrasHistory(); }
  else if (action === 'extras-history') openExtrasHistory();
  else if (action === 'close-extras-history') closeExtrasHistory();
  else if (action === 'extras-quick') extrasQuick(id);
  else if (action === 'extras-ask-cancel') { extrasAsk = null; renderApp(); }
  else if (action === 'extras-suggest') { extrasAsk = `suggest:${id}`; extrasLast = null; renderApp(); requestAnimationFrame(() => document.querySelector('#extras-ask-amount')?.focus()); }
  else if (action === 'extras-suggest-off') { try { localStorage.setItem(SUGGEST_OFF_KEY, '1'); } catch {} renderApp(); }
  else if (action === 'extras-qty') { const e = (state.extras || []).find((x) => x.id === extrasLast); if (e) { state.extras = state.extras.map((x) => (x.id === e.id ? setExtraQty(e, e.qty + Number(button.dataset.delta)) : x)); if (persist()) renderApp(); } }
  else if (action === 'extras-undo') { const e = (state.extras || []).find((x) => x.id === extrasLast); if (e) { state.extras = state.extras.filter((x) => x.id !== e.id); extrasLast = null; if (persist()) { renderApp(); showToast('Αναιρέθηκε.'); } } }
  else if (action === 'extras-last-edit' || action === 'extras-edit') { const e = (state.extras || []).find((x) => x.id === (action === 'extras-edit' ? id : extrasLast)); if (e) { closeExtrasHistory(); extrasDraft = { ...e }; extrasLast = null; renderApp(); requestAnimationFrame(() => { document.querySelector('#extras-add')?.scrollIntoView({ block: 'center' }); const el = document.querySelector('#extras-amount'); el?.focus(); el?.select?.(); }); } }
  else if (action === 'extras-cancel') { extrasDraft = null; renderApp(); }
  else if (action === 'extras-delete') showConfirm('Θα διαγραφεί αυτό το μικροέξοδο.', () => { state.extras = (state.extras || []).filter((e) => e.id !== id); if (extrasLast === id) extrasLast = null; if (persist()) { renderApp(); if (extrasHistoryDialog()?.open) renderExtrasHistory(); } }, 'Διαγραφή εξόδου;');
  else if (action === 'extras-cat-edit') { extrasCatEdit = id; renderApp(); document.querySelector('#extras-cat-edit-form input[name="name"]')?.focus(); }
  else if (action === 'extras-cat-cancel') { extrasCatEdit = null; renderApp(); }
  else if (action === 'extras-cat-delete') showConfirm('Το κουμπί της κατηγορίας θα αφαιρεθεί. Τα έξοδα που έχεις ήδη καταχωρίσει μένουν στο ιστορικό και στα σύνολα.', () => { state.extraCategories = deleteExtraCategory(state.extraCategories || [], id); if (extrasAsk === id) extrasAsk = null; if (persist()) renderApp(); }, 'Αφαίρεση κατηγορίας;');
  else if (action === 'close-transport-history') closeTransportHistory();
  else if (action === 'transport-receipt') openReceiptDialog('transport');
  else if (action === 'receipt-to-transport') receiptToTransport();
  else if (action === 'transport-cancel') { transportDraft = null; renderApp(); }
  else if (action === 'transport-edit') { const e = (state.transport || []).find((x) => x.id === id); if (e) { closeTransportHistory(); transportDraft = { ...e }; renderApp(); document.querySelector('#transport-add')?.scrollIntoView({ behavior: 'smooth' }); } }
  else if (action === 'transport-delete') showConfirm('Θα διαγραφεί αυτό το έξοδο μετακίνησης.', () => { state.transport = (state.transport || []).filter((e) => e.id !== id); if (persist()) { renderApp(); if (transportHistoryDialog()?.open) renderTransportHistory(); } }, 'Διαγραφή εξόδου;');
  else if (action === 'transport-rule-delete') { state.transportRecurring = (state.transportRecurring || []).filter((r) => r.id !== id); if (persist()) renderApp(); }
  else if (action === 'vehicle-delete') { state.vehicles = (state.vehicles || []).filter((v) => v.id !== id); if (persist()) renderApp(); }
  else if (action === 'add-bill') openBillDialog();
  else if (action === 'close-bill') document.querySelector('#bill-dialog').close();
  else if (action === 'bill-edit') openBillDialog(id);
  else if (action === 'bill-scan') openScanner({ qr: 'any', onCode: applyBillCode });
  else if (action === 'bill-pay') {
    const { bills, next } = payBill(state.bills || [], id, localDateKey());
    state.bills = bills;
    if (persist()) { renderApp(); scheduleBackgroundSnapshot(); showToast(next ? t('Πληρώθηκε. Επόμενος: {date}', { date: formatDate(next.due) }) : 'Σημειώθηκε ως πληρωμένος.'); }
  } else if (action === 'bill-unpay') { state.bills = unpayBill(state.bills || [], id); if (persist()) { renderApp(); scheduleBackgroundSnapshot(); } }
  else if (action === 'bill-copy') {
    const bill = (state.bills || []).find((entry) => entry.id === id);
    navigator.clipboard?.writeText(bill?.reference || '').then(() => showToast('Ο κωδικός πληρωμής αντιγράφηκε.'), () => showToast(bill?.reference || ''));
  } else if (action === 'bill-delete') {
    const bill = (state.bills || []).find((entry) => entry.id === id);
    if (!bill) return;
    showConfirm(t('Θα διαγραφεί ο λογαριασμός «{name}».', { name: bill.name }), () => { state.bills = state.bills.filter((entry) => entry.id !== id); if (persist()) { renderApp(); scheduleBackgroundSnapshot(); } }, 'Διαγραφή λογαριασμού;');
  } else if (action === 'bills-year') { billsYear += Number(button.dataset.delta); renderApp(); }
  else if (action === 'cook-tab') { cookTab = button.dataset.tab; renderApp(); }
  else if (action === 'plan-week') { planWeek = Number(button.dataset.delta) ? shiftDays(planWeek, Number(button.dataset.delta)) : weekStart(localDateKey()); renderApp(); }
  else if (action === 'plan-meal') openMealDialog(button.dataset.date, button.dataset.slot);
  else if (action === 'close-meal') document.querySelector('#meal-dialog').close();
  else if (action === 'plan-pick') {
    const recipeIdValue = button.dataset.recipe;
    const recipe = BUILTIN_RECIPES.find((entry) => entry.id === recipeIdValue) || mealEdit?.results.find((entry) => entry.id === recipeIdValue);
    if (recipe) saveMeal(createMeal({ date: mealEdit.date, slot: mealEdit.slot, recipe: { source: 'builtin', ...recipe } }));
  } else if (action === 'plan-clear') {
    state.meals = (state.meals || []).filter((meal) => meal.id !== `meal-${mealEdit.date}-${mealEdit.slot}`);
    if (persist()) { document.querySelector('#meal-dialog').close(); renderApp(); }
  } else if (action === 'plan-copy') {
    const { meals, copied } = copyPreviousWeek(state.meals || [], planWeek);
    if (!copied) { showToast('Δεν υπάρχει κάτι να αντιγραφεί (ή οι θέσεις είναι ήδη γεμάτες).'); return; }
    state.meals = meals;
    if (persist()) { renderApp(); showToast(t('Αντιγράφηκαν {count} γεύματα.', { count: copied })); }
  } else if (action === 'plan-shopping') planToShopping();
  else if (action === 'open-receipt') openReceiptDialog();
  else if (action === 'close-receipt') document.querySelector('#receipt-dialog').close();
  else if (action === 'receipt-scan') openScanner({ qr: true, onCode: receiptCode });
  else if (action === 'receipt-reset') { receiptState = { step: 'start' }; renderReceipt(); }
  else if (action === 'delete-item') {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    showConfirm(t('Θα αφαιρεθεί το «{name}» από το απόθεμα.', { name: item.name }), () => {
      state.items = state.items.filter((entry) => entry.id !== id);
      persist(); renderApp(); showToast('Το προϊόν αφαιρέθηκε.');
    }, 'Αφαίρεση προϊόντος;');
  } else if (action === 'add-to-shopping') {
    const item = state.items.find((entry) => entry.id === id);
    if (item) addItemToShopping(item);
  } else if (action === 'toggle-shopping') {
    const row = state.shopping.find((entry) => entry.id === id);
    if (!row) return;
    const result = row.checked ? returnShoppingItem(state.items, row) : receiveShoppingItem(state.items, row);
    if (row.checked) state.purchases = (state.purchases || []).filter((p) => p.id !== `pur-${row.id}`);
    state.items = result.items;
    state.shopping = toggleShoppingItem(state.shopping, id).map((entry) => entry.id === id ? result.row : entry);
    persist(); renderApp();
    if (result.message) showToast(result.message);
  } else if (action === 'remove-shopping') {
    state.shopping = state.shopping.filter((entry) => entry.id !== id);
    persist(); renderApp(); showToast('Το προϊόν αφαιρέθηκε από τη λίστα.');
  } else if (action === 'sync-google') syncAction(() => sync.signInWithGoogle());
  else if (action === 'sync-signout') syncAction(() => sync.signOut(), 'Αποσυνδέθηκες. Τα δεδομένα μένουν σε αυτή τη συσκευή.');
  else if (action === 'sync-invite') syncAction(async () => {
    const code = await sync.createInvite();
    try { await navigator.clipboard.writeText(code); } catch {}
    showConfirm(t('Δώσε αυτόν τον κωδικό στο άλλο μέλος (αντιγράφηκε): {code}', { code }), null, 'Κωδικός πρόσκλησης');
  });
  else if (action === 'sync-leave') showConfirm('Θα επιστρέψεις στο δικό σου νοικοκυριό. Τα κοινά προϊόντα θα μείνουν στο κοινό νοικοκυριό.', () => syncAction(() => sync.leaveHousehold(), 'Αποχώρησες από το νοικοκυριό.'), 'Αποχώρηση;');
  else if (action === 'scan-barcode') openScanner();
  else if (action === 'scan-torch') { const on = button.getAttribute('aria-pressed') !== 'true'; stopScanner?.torch?.(on).then((ok) => { if (ok) button.setAttribute('aria-pressed', String(on)); }); }
  else if (action === 'close-scan') { cartScanning = false; closeScanner(); }
  else if (action === 'lookup-barcode') fillFromBarcode(itemForm.elements.barcode.value);
  else if (action === 'enable-notifications') enableNotifications();
  else if (action === 'disable-notifications') { saveNotifySettings({ enabled: false }); updateBackgroundCheck(); renderApp(); showToast('Οι ειδοποιήσεις απενεργοποιήθηκαν.'); }
  else if (action === 'set-theme') setTheme(button.dataset.theme);
  else if (action === 'set-store') { try { if (button.dataset.store) localStorage.setItem(STORE_KEY, button.dataset.store); else localStorage.removeItem(STORE_KEY); } catch {} renderApp(); }
  else if (action === 'vm-switch') {
    const trip = activeTrip();
    const form = document.querySelector('#cart-item-form');
    const raw = form.elements.raw.value;
    if (trip?.storeId) state.stores = state.stores.map((store) => (store.id === trip.storeId ? { ...store, vm: { ...(store.vm || {}), [button.dataset.prefix]: button.dataset.mode }, updatedAt: new Date().toISOString() } : store));
    persist();
    document.querySelector('#cart-item-dialog').close();
    const store = (state.stores || []).find((entry) => entry.id === trip?.storeId);
    if (!store) { const info = interpretCode(raw, { vmMode: () => button.dataset.mode }); openCartItem({ barcode: info.barcode, raw, fixed: '1', info, name: form.elements.name.value, ...(info.weightKg != null ? { unit: 'κιλά', qty: info.weightKg } : { unit: 'τεμ.', qty: 1, price: info.price }) }); }
    else { const keepName = form.elements.name.value; cartBarcode(raw).then(() => { const f = document.querySelector('#cart-item-form'); if (!f.elements.name.value) f.elements.name.value = keepName; }); }
    if (store) showToast(t('Το «{store}» θα διαβάζει το πρόθεμα {prefix} ως {mode}.', { store: store.name, prefix: button.dataset.prefix, mode: t(button.dataset.mode === 'price' ? 'τιμή' : 'βάρος') }));
  }
  else if (action === 'bills-history-toggle') { billsHistory.open = !billsHistory.open; billsHistory.limit = 10; renderApp(); }
  else if (action === 'bills-history-more') { billsHistory.limit += 10; renderApp(); }
  else if (action === 'toggle-stores') { storesOpen = !storesOpen; renderApp(); }
  else if (action === 'aisle-up' || action === 'aisle-down') {
    const store = activeStore();
    if (store) { state.stores = state.stores.map((entry) => entry.id === store.id ? moveCategory(entry, button.dataset.category, action === 'aisle-up' ? -1 : 1) : entry); persist(); renderApp(); }
  } else if (action === 'delete-store') {
    const store = activeStore();
    if (store) showConfirm(t('Θα διαγραφεί το κατάστημα «{name}». Η λίστα δεν αλλάζει.', { name: store.name }), () => { state.stores = state.stores.filter((entry) => entry.id !== store.id); try { localStorage.removeItem(STORE_KEY); } catch {} persist(); renderApp(); }, 'Διαγραφή καταστήματος;');
  }
  else if (action === 'waste-item') openWasteDialog(id);
  else if (action === 'close-waste') document.querySelector('#waste-dialog').close();
  else if (action === 'insights-month') { insightsMonth = shiftMonth(insightsMonth, Number(button.dataset.delta)); renderApp(); }
  else if (action === 'add-missing') addMissingToList(button.dataset.recipe);
  else if (action === 'retry-recipes') { onlineRecipes = { key: '', state: 'idle', list: [] }; renderApp(); }
  else if (action === 'voice-add') startVoiceAdd(button);
  else if (action === 'remove-recurring') { state.recurring = (state.recurring || []).filter((rule) => rule.id !== id); persist(); renderApp(); showToast('Το επαναλαμβανόμενο αφαιρέθηκε.'); }
  else if (action === 'set-lang') changeLanguage(button.dataset.lang);
  else if (action === 'toggle-lang') changeLanguage(getLang() === 'en' ? 'el' : 'en');
  else if (action === 'share-shopping') shareShoppingList();
  else if (action === 'copy-share') copyShareText();
  else if (action === 'close-share') document.querySelector('#share-dialog').close();
  else if (action === 'clear-completed') {
    state.shopping = state.shopping.filter((entry) => !entry.checked);
    persist(); renderApp(); showToast('Η λίστα καθαρίστηκε.');
  } else if (action === 'filter-category') {
    pantryCategory = button.dataset.category || 'Όλα';
    renderApp();
  } else if (action === 'clear-filters') {
    pantryCategory = 'Όλα'; pantryQuery = ''; pantryStatus = ''; renderApp();
  } else if (action === 'clear-pantry-status') { pantryStatus = ''; renderApp(); }
  else if (action === 'home-card') {
    // Each home count card opens the matching view: all products / only expiring / the open shopping list.
    const card = button.dataset.card;
    pantryCategory = 'Όλα'; pantryQuery = '';
    if (card === 'shopping') { navigate('shopping'); requestAnimationFrame(() => document.querySelector('.shopping-list')?.scrollIntoView({ block: 'start' })); return; }
    pantryStatus = card === 'expiring' ? 'expiring' : '';
    navigate('pantry');
  } else if (action === 'focus-shopping') {
    document.querySelector('#shopping-form input[name="name"]')?.focus();
  } else if (action === 'export-backup') downloadBackup();
  else if (action === 'import-backup') backupFile.click();
  else if (action === 'load-demo') {
    const loadDemo = () => { state = { ...state, items: makeDemoItems(), shopping: [] }; persist(); renderApp(); showToast('Τα παραδείγματα φορτώθηκαν.'); };
    if (state.items.length || state.shopping.length) showConfirm('Τα τωρινά δεδομένα θα αντικατασταθούν από δοκιμαστικά προϊόντα.', loadDemo, 'Φόρτωση παραδειγμάτων;');
    else loadDemo();
  } else if (action === 'clear-data') {
    showConfirm(`${t('Θα διαγραφούν όλα τα δεδομένα (απόθεμα, λίστες και έξοδα) από αυτή τη συσκευή.')}${syncStatus.user ? t(' Επειδή είσαι συνδεδεμένος, θα διαγραφούν και από τις συγχρονισμένες συσκευές.') : ''}${t(' Φρόντισε να έχεις αντίγραφο αν τα χρειάζεσαι.')}`, () => {
      state = { items: [], shopping: [], recurring: [], stores: [], purchases: [], waste: [], receipts: [], meals: [], bills: [], trips: [], prices: [], transport: [], transportRecurring: [], vehicles: [], extras: [], extraCategories: [] }; persist(); renderApp(); showToast('Τα δεδομένα διαγράφηκαν.');
    }, 'Διαγραφή όλων των δεδομένων;');
  }
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { event.preventDefault(); if (viewButton.closest('#menu-sheet')) document.querySelector('#menu-sheet').close(); navigate(viewButton.dataset.view); return; }
  if (event.target.id === 'menu-sheet' || event.target.id === 'quick-sheet') { event.target.close(); return; }
  const button = event.target.closest('[data-action]');
  if (button && button.type !== 'checkbox') handleAction(button);
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'extras-new-name') { const e = document.querySelector('#extras-new-emoji'); if (e) e.placeholder = suggestEmoji(event.target.value) || EXTRA_DEFAULT_EMOJI; }
  if (event.target.id === 'bill-name' && !event.target.form.dataset.typeTouched) event.target.form.elements.type.value = guessBillType(event.target.value);
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'transport-type') { const fuel = event.target.value === 'fuel'; document.querySelector('#transport-fuel').hidden = !fuel; document.querySelector('#transport-ppl').hidden = !fuel; }
  if (event.target.id === 'bill-type') event.target.form.dataset.typeTouched = '1';
  if (event.target.id === 'cart-item-unit') updateCartQtyLabel();
  if (event.target.id === 'bills-history-filter') { billsHistory.filter = event.target.value; billsHistory.limit = 10; renderApp(); return; }
  if (event.target.id === 'cart-store') { const row = document.querySelector('#cart-new-store-row'); row.hidden = event.target.value !== '__new'; if (!row.hidden) document.querySelector('#cart-new-store').focus(); }
  if (event.target.classList?.contains('vm-mode')) {
    const current = activeStore();
    if (current) { const vm = { ...(current.vm || {}) }; if (event.target.value === 'auto') delete vm[event.target.dataset.prefix]; else vm[event.target.dataset.prefix] = event.target.value; state.stores = state.stores.map((store) => (store.id === current.id ? { ...store, vm, updatedAt: new Date().toISOString() } : store)); persist(); showToast(t('Αποθηκεύτηκε.')); }
    return;
  }
  if (event.target.matches?.('[data-bill-file]')) { importBillFile(event.target.files?.[0]); event.target.value = ''; return; }
  if (event.target.matches?.('[data-receipt-photo]')) { loadReceiptPhoto(event.target.files?.[0]); return; }
  if (event.target.classList?.contains('price-input')) {
    const row = state.shopping.find((entry) => entry.id === event.target.dataset.id);
    if (!row) return;
    const value = event.target.value.trim();
    state.purchases = (state.purchases || []).filter((p) => p.id !== `pur-${row.id}`);
    if (value !== '') {
      try { state.purchases.push(purchaseFor(row, value, { items: state.items, date: localDateKey(), storeId: activeStore()?.id || '' })); }
      catch (error) { showToast(error.message); return; }
    }
    persist();
    showToast(value === '' ? 'Η τιμή αφαιρέθηκε.' : t('Η τιμή αποθηκεύτηκε: {price}', { price: money(Number(value.replace(',', '.'))) }));
    return;
  }
  const checkbox = event.target.closest('[data-action="toggle-shopping"]');
  if (checkbox) handleAction(checkbox);
  if (event.target === backupFile && backupFile.files?.[0]) {
    const file = backupFile.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseBackup(reader.result);
        showConfirm(t('Το αντίγραφο περιέχει {items} προϊόντα και {shopping} είδη στη λίστα. Θα αντικαταστήσει τα τωρινά δεδομένα.', { items: imported.items.length, shopping: imported.shopping.length }), () => {
          state = { ...state, ...imported }; persist(); renderApp(); showToast('Το αντίγραφο εισήχθη.');
        }, 'Εισαγωγή αντιγράφου;');
      } catch (error) { showToast(error.message || 'Δεν ήταν δυνατή η εισαγωγή.'); }
      backupFile.value = '';
    };
    reader.onerror = () => showToast('Δεν ήταν δυνατή η ανάγνωση του αρχείου.');
    reader.readAsText(file);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'notify-days') {
    const days = Math.round(Number(event.target.value));
    if (Number.isFinite(days) && days >= 0 && days <= 30) { saveNotifySettings({ days, lastNotified: '' }); scheduleBackgroundSnapshot(); }
  }
  if (event.target.id === 'item-name') updateNameCounter();
  if (event.target.id === 'item-expiry') updateExpiryWarning();
  if (event.target.id === 'pantry-search') {
    const caret = event.target.selectionStart;
    pantryQuery = event.target.value;
    renderPantryList();
    const input = document.querySelector('#pantry-search');
    input?.focus(); input?.setSelectionRange(caret, caret);
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'bill-form') { event.preventDefault(); saveBillForm(event.target); return; }
  if (event.target.id === 'transport-form') { event.preventDefault(); saveTransportForm(event.target); return; }
  if (event.target.id === 'extras-form') { event.preventDefault(); saveExtrasForm(event.target); return; }
  if (event.target.id === 'extras-new-form') { event.preventDefault(); saveExtrasNew(event.target); return; }
  if (event.target.id === 'extras-cat-edit-form') { event.preventDefault(); saveExtraCategory(event.target, true); return; }
  if (event.target.id === 'extras-price-form') {
    event.preventDefault();
    const f = event.target;
    try {
      let category = f.elements.category.value;
      const entry = createExtra({ category, amount: f.elements.amount.value, qty: 1, date: localDateKey() });
      const sug = EXTRA_SUGGESTIONS.find((x) => `suggest:${x.id}` === category);
      if (sug) {
        // A suggestion chip becomes a real button (fixed id, so synced devices don't duplicate it).
        const stored = (state.extraCategories || []).filter((c) => c.id !== sug.id);
        const existing = findExtraCategory(extraCats(), t(sug.name));
        if (existing) category = existing.id;
        else { state.extraCategories = [...stored, createExtraCategory({ id: sug.id, name: t(sug.name), emoji: sug.emoji }, stored)]; category = sug.id; }
      }
      addExtra({ ...entry, category }, true);
    }
    catch (err) { const e = document.querySelector('#extras-ask-error'); e.textContent = t(err.message); e.hidden = false; }
    return;
  }
  if (event.target.id === 'transport-recurring-form') {
    event.preventDefault();
    const f = event.target; const err = document.querySelector('#transport-recurring-error');
    const day = Math.min(28, Math.max(1, Number(f.elements.day.value) || 1));
    const today = localDateKey();
    const start = `${today.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    try { state.transportRecurring = [...(state.transportRecurring || []), createTransportRecurring({ type: f.elements.type.value, amount: f.elements.amount.value, note: f.elements.note.value, day, start: start > today ? `${shiftMonth(today.slice(0, 7), 1)}-${String(day).padStart(2, '0')}` : start })]; }
    catch (e) { err.textContent = t(e.message); err.hidden = false; return; }
    runTransportRecurring(); if (persist()) { renderApp(); showToast('Το μηνιαίο πάγιο προστέθηκε.'); }
    return;
  }
  if (event.target.id === 'vehicle-form') {
    event.preventDefault();
    const name = event.target.elements.name.value.trim();
    if (!name) return;
    state.vehicles = [...(state.vehicles || []), { id: globalThis.crypto?.randomUUID ? crypto.randomUUID() : `veh-${Date.now()}`, name: name.slice(0, 40), updatedAt: new Date().toISOString() }];
    if (persist()) renderApp();
    return;
  }
  if (event.target.id === 'cart-item-form') { event.preventDefault(); saveCartItem(event.target); return; }
  if (event.target.id === 'cart-start-form') {
    event.preventDefault();
    const form = event.target;
    let store = (state.stores || []).find((entry) => entry.id === form.elements.store.value) || null;
    const typed = form.elements.storeName.value.trim();
    if (form.elements.store.value === '__new' && typed) {
      store = (state.stores || []).find((entry) => normalizeSearch(entry.name).trim() === normalizeSearch(typed).trim()) || null;
      if (!store) {
        try { store = createStore({ name: typed }); } catch (error) { showToast(t(error.message)); return; }
        state.stores = [...(state.stores || []), store];
        showToast(t('Το κατάστημα «{name}» αποθηκεύτηκε.', { name: store.name }));
      }
    }
    if (store) { try { localStorage.setItem(STORE_KEY, store.id); } catch {} }
    if (saveTrip(createTrip({ store, budget: form.elements.budget.value }))) renderApp();
    return;
  }
  if (event.target === itemForm) {
    event.preventDefault();
    const formData = new FormData(itemForm);
    const current = state.items.find((item) => item.id === String(formData.get('id') || ''));
    try {
      const item = createPantryItem({
        id: current?.id,
        createdAt: current?.createdAt,
        name: formData.get('name'), quantity: formData.get('quantity'), unit: formData.get('unit'),
        minimum: formData.get('minimum'), category: formData.get('category'), location: formData.get('location'), expiry: formData.get('expiry'),
        barcode: normalizeBarcode(formData.get('barcode'))
      });
      if (current) state.shopping = syncShoppingWithItem(state.shopping, current, item);
      state.items = current ? state.items.map((entry) => entry.id === current.id ? item : entry) : [item, ...state.items];
      if (persist()) { itemDialog.close(); renderApp(); showToast(current ? 'Οι αλλαγές αποθηκεύτηκαν.' : 'Το προϊόν προστέθηκε.'); }
    } catch (error) {
      const message = document.querySelector('#form-error');
      message.textContent = t(error.message || 'Έλεγξε τα στοιχεία και δοκίμασε ξανά.');
      message.hidden = false;
    }
  }

  if (event.target.id === 'sync-email-form') {
    event.preventDefault();
    const email = String(event.target.elements.email.value || '').trim();
    const password = String(event.target.elements.password.value || '');
    const mode = event.submitter?.value || 'signin';
    if (!email) { showToast('Γράψε το email σου.'); return; }
    if (mode === 'reset') { syncAction(() => sync.resetPassword(email), 'Σου στείλαμε email για νέο κωδικό.'); return; }
    if (password.length < 6) { showToast('Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες.'); return; }
    syncAction(() => mode === 'signup' ? sync.signUpWithEmail(email, password) : sync.signInWithEmail(email, password));
    return;
  }
  if (event.target.id === 'sync-join-form') {
    event.preventDefault();
    const invite = String(event.target.elements.invite.value || '').trim();
    if (!invite) { showToast('Γράψε τον κωδικό πρόσκλησης.'); return; }
    syncAction(() => sync.joinHousehold(invite), 'Μπήκες στο κοινό νοικοκυριό.');
    return;
  }

  if (event.target.id === 'meal-text-form') {
    event.preventDefault();
    try { saveMeal(createMeal({ date: mealEdit.date, slot: mealEdit.slot, text: event.target.elements.text.value })); }
    catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.id === 'meal-search-form') {
    event.preventDefault();
    const query = event.target.elements.q.value.trim();
    if (query) searchMeals(query);
    return;
  }
  if (event.target.id === 'receipt-link-form') {
    event.preventDefault();
    loadReceipt(event.target.elements.link.value);
    return;
  }
  if (event.target.id === 'receipt-review-form') {
    event.preventDefault();
    importReceipt(event.target);
    return;
  }
  if (event.target.id === 'proxy-form') {
    event.preventDefault();
    const value = event.target.elements.proxy.value.trim();
    if (value && !/^https:\/\/[^\s/]+/.test(value)) { showToast('Ο σύνδεσμος πρέπει να ξεκινά με https://'); return; }
    try { if (value) localStorage.setItem(PROXY_KEY, value.replace(/\/+$/, '')); else localStorage.removeItem(PROXY_KEY); } catch {}
    showToast(value ? 'Ο proxy αποθηκεύτηκε.' : 'Ο proxy αφαιρέθηκε.');
    renderApp();
    return;
  }

  if (event.target.id === 'store-form') {
    event.preventDefault();
    try {
      const store = createStore({ name: event.target.elements.name.value });
      state.stores = [...(state.stores || []), store];
      try { localStorage.setItem(STORE_KEY, store.id); } catch {}
      persist(); renderApp(); showToast(t('Το κατάστημα «{name}» προστέθηκε.', { name: store.name }));
    } catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.id === 'waste-form') {
    event.preventDefault();
    const item = state.items.find((entry) => entry.id === event.target.elements.itemId.value);
    if (!item) return;
    try {
      const record = createWaste(item, { quantity: event.target.elements.quantity.value, reason: event.target.elements.reason.value }, localDateKey());
      state.waste = [...(state.waste || []), record];
      state.items = applyWaste(state.items, record);
      if (persist()) { document.querySelector('#waste-dialog').close(); renderApp(); showToast(t('Καταγράφηκε ως σπατάλη: {name}.', { name: item.name })); }
    } catch (error) { const message = document.querySelector('#waste-error'); message.textContent = t(error.message); message.hidden = false; }
    return;
  }

  if (event.target.id === 'recurring-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      const rule = createRecurring({ name: formData.get('name'), quantity: formData.get('quantity'), unit: formData.get('unit'), everyDays: formData.get('everyDays') }, localDateKey());
      state.recurring = [...(state.recurring || []), rule];
      persist();
      showToast(t('Το «{name}» θα μπαίνει στη λίστα: {every}.', { name: rule.name, every: intervalLabel(rule.everyDays).toLocaleLowerCase(locale()) }));
      runRecurring(); runTransportRecurring(); renderApp();
    } catch (error) {
      const message = document.querySelector('#recurring-error');
      message.textContent = t(error.message || 'Έλεγξε τα στοιχεία.');
      message.hidden = false;
    }
    return;
  }

  if (event.target.id === 'shopping-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      const category = String(formData.get('category') || '');
      state.shopping.push({ ...createShoppingItem({ name: formData.get('name'), quantity: formData.get('quantity'), unit: formData.get('unit') }), ...(CATEGORIES.includes(category) ? { category } : {}) });
      if (persist()) { renderApp(); showToast('Προστέθηκε στη λίστα αγορών.'); document.querySelector('#shopping-form input[name="name"]')?.focus(); }
      return;
    } catch (error) {
      const message = document.querySelector('#shopping-error');
      message.textContent = t(error.message || 'Έλεγξε τα στοιχεία.');
      message.hidden = false;
    }
  }
});

transportHistoryDialog().addEventListener('close', () => { if (history.state?.transportHistory) history.back(); });
window.addEventListener('popstate', () => { if (transportHistoryDialog().open && !history.state?.transportHistory) transportHistoryDialog().close(); });
extrasHistoryDialog().addEventListener('close', () => { if (history.state?.extrasHistory) history.back(); });
window.addEventListener('popstate', () => { if (extrasHistoryDialog().open && !history.state?.extrasHistory) extrasHistoryDialog().close(); });
document.querySelector('#scan-dialog').addEventListener('close', () => { stopScanner?.(); stopScanner = null; });
itemForm.elements.barcode.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); fillFromBarcode(event.target.value); }
});

confirmDialog.addEventListener('close', () => {
  if (confirmDialog.returnValue === 'confirm' && confirmAction) confirmAction();
  confirmAction = null;
});

applyLanguage();
applyTheme();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));

state.items = state.items.map((item) => ({ ...item, unit: normalizeUnit(item.unit) }));
state.shopping = state.shopping.map((item) => ({ ...item, unit: normalizeUnit(item.unit) }));
renderApp();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

takeSharedFile();

function runDailyChecks() {
  runRecurring();
  runTransportRecurring();
  checkExpiryNotifications();
}
runDailyChecks();
updateBackgroundCheck();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runDailyChecks(); });
// While the app stays open (e.g. a tablet in the kitchen), re-check every hour so a new day is noticed.
setInterval(runDailyChecks, 60 * 60 * 1000);

startSync();
