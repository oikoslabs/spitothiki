import { MAX_QUANTITY, createPantryItem, createShoppingItem, expiringWithin, expiryStatus, expiryWarning, normalizeSearch, normalizeUnit, pantrySummary, receiveShoppingItem, returnShoppingItem, shoppingListText, syncShoppingWithItem, toggleShoppingItem } from './domain.js';
import { lookupBarcode, normalizeBarcode, startScanner } from './barcode.js';
import { authProviders, firebaseConfig } from './firebase-config.js';
import { loadState, parseBackup, saveState } from './storage.js';
import { getLang, locale, setLang, t, translateDom, untranslatedGreek } from './i18n.js';

const viewRoot = document.querySelector('#view-content');
const itemDialog = document.querySelector('#item-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
const itemForm = document.querySelector('#item-form');
const backupFile = document.querySelector('#backup-file');
const toast = document.querySelector('#toast');

let state = loadState();
const VIEWS = ['overview', 'pantry', 'shopping', 'settings'];
let activeView = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
let pantryQuery = '';
let pantryCategory = 'Όλα';
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
    return true;
  } catch {
    showToast('Δεν ήταν δυνατή η αποθήκευση στη συσκευή.');
    return false;
  }
}

function renderNavCounts() {
  document.querySelector('#nav-pantry-count').textContent = String(state.items.length);
  document.querySelector('#nav-shopping-count').textContent = String(state.shopping.filter((item) => !item.checked).length);
}

function pendingLabel(count) {
  return t(count === 1 ? '{count} εκκρεμές προϊόν' : '{count} εκκρεμή προϊόντα', { count });
}

function setActiveNavigation() {
  document.body.dataset.screen = activeView;
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === activeView;
    button.classList.toggle('is-active', active);
    if (button.classList.contains('nav-item')) {
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  });
}

function renderHeader(title, description, actionLabel = '') {
  return `<header class="page-heading"><div><p class="eyebrow">ΣΠΙΤΟΘΗΚΗ</p><h1>${title}</h1><p>${description}</p></div>${actionLabel ? `<button class="button button-primary" type="button" data-action="add-item"><span aria-hidden="true">＋</span>${actionLabel}</button>` : ''}</header>`;
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
      <button class="icon-button danger" type="button" data-action="delete-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Διαγραφή {name}', { name: item.name }))}">×</button>
      <button class="button button-quiet small-action" type="button" data-action="add-to-shopping" data-id="${escapeHtml(item.id)}">Στη λίστα</button>
    </div>
  </article>`;
}

function renderOverview() {
  const summary = pantrySummary(state.items, localDateKey());
  const upcoming = state.items.filter((item) => ['soon', 'expired'].includes(expiryStatus(item.expiry, localDateKey())))
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry))).slice(0, 4);
  const lowStock = state.items.filter((item) => Number(item.minimum) > 0 && Number(item.quantity) <= Number(item.minimum)).slice(0, 4);
  return `<section class="hero-panel"><div class="hero-copy"><p class="eyebrow">ΜΙΚΡΕΣ ΣΥΝΗΘΕΙΕΣ, ΠΙΟ ΗΡΕΜΟ ΣΠΙΤΙ</p><h1>Η κουζίνα σου,<br>με μια ματιά.</h1><p>Ξέρεις τι έχεις, τι τελειώνει και τι χρειάζεται να μπει στη λίστα.</p></div><div class="hero-illustration" aria-hidden="true"><span>🫒</span></div></section>
    <section class="stats-grid" aria-label="Σύνοψη αποθέματος">
      <article class="stat-card"><span class="stat-icon">🧺</span><div><strong>${summary.products}</strong><span>προϊόντα στο σπίτι</span></div></article>
      <article class="stat-card"><span class="stat-icon amber">◷</span><div><strong>${summary.expiringSoon + summary.expired}</strong><span>λήγουν ή έληξαν</span></div></article>
      <article class="stat-card"><span class="stat-icon blue">＋</span><div><strong>${summary.lowStock}</strong><span>χρειάζονται αναπλήρωση</span></div></article>
    </section>
    ${summary.expired ? `<div class="alert-banner" role="status">${t(summary.expired === 1 ? '⚠️ Έχεις {count} προϊόν που έχει λήξει. Έλεγξέ τα πριν τα χρησιμοποιήσεις.' : '⚠️ Έχεις {count} προϊόντα που έχουν λήξει. Έλεγξέ τα πριν τα χρησιμοποιήσεις.', { count: summary.expired })}</div>` : ''}
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-heading"><div><h2>Έλεγξε τις ημερομηνίες</h2><p>Ό,τι λήγει μέσα στις επόμενες 7 ημέρες</p></div><button class="panel-link" type="button" data-view="pantry">Όλο το απόθεμα →</button></div><div class="product-list">${upcoming.length ? upcoming.map(renderMiniProduct).join('') : renderEmpty('Όλα καλά εδώ', 'Δεν έχεις προϊόντα που λήγουν σύντομα.', 'add-item', 'Πρόσθεσε προϊόν', '🌿')}</div></section>
      <div class="dashboard-side"><section class="panel"><div class="panel-heading"><div><h2>Χρειάζονται αναπλήρωση</h2><p>Με βάση το ελάχιστο απόθεμα</p></div></div><div class="product-list">${lowStock.length ? lowStock.map(renderMiniProduct).join('') : `<p class="subtle-empty">${state.items.length ? 'Δεν υπάρχει κάτι που να χρειάζεται αναπλήρωση.' : 'Όταν προσθέσεις προϊόντα, θα τα βλέπεις εδώ.'}</p>`}</div>${lowStock.length ? '<button class="button button-quiet full-width" type="button" data-view="pantry">Δες το απόθεμα</button>' : ''}</section>
      <section class="panel quick-panel"><div class="panel-heading"><div><h2>Γρήγορες κινήσεις</h2><p>Τα βασικά, χωρίς ψάξιμο</p></div></div><div class="quick-actions"><button class="quick-action" type="button" data-action="add-item"><span class="quick-action-icon">＋</span><span><strong>Πρόσθεσε προϊόν</strong><small>Καταχώρισε κάτι που έφερες σπίτι</small></span><span class="arrow">›</span></button><button class="quick-action" type="button" data-view="shopping"><span class="quick-action-icon">✓</span><span><strong>Άνοιξε τη λίστα</strong><small>${t('{pending} για ψώνια', { pending: pendingLabel(state.shopping.filter((item) => !item.checked).length) })}</small></span><span class="arrow">›</span></button></div></section></div>
    </div>`;
}

function renderPantryList() {
  const list = document.querySelector('#inventory-list');
  const count = document.querySelector('#inventory-count');
  if (!list || !count) return;
  const q = normalizeSearch(pantryQuery.trim());
  const filtered = state.items.filter((item) => {
    const matchesText = !q || normalizeSearch(`${item.name} ${item.category} ${item.location} ${t(item.category)} ${t(item.location)}`).includes(q);
    const matchesCategory = pantryCategory === 'Όλα' || item.category === pantryCategory;
    return matchesText && matchesCategory;
  }).sort((a, b) => a.name.localeCompare(b.name, getLang()));
  count.textContent = t(filtered.length === 1 ? '{count} προϊόν' : '{count} προϊόντα', { count: filtered.length });
  list.innerHTML = filtered.length ? filtered.map(renderInventoryCard).join('') : renderEmpty(state.items.length ? 'Δεν βρήκα προϊόντα' : 'Το απόθεμα είναι άδειο', state.items.length ? 'Δοκίμασε άλλη αναζήτηση ή κατηγορία.' : 'Πρόσθεσε τα πρώτα προϊόντα που έχεις στο σπίτι.', state.items.length ? 'clear-filters' : 'add-item', state.items.length ? 'Καθαρισμός φίλτρων' : 'Προσθήκη προϊόντος');
  translateDom(list);
  translateDom(count);
}

function renderPantry() {
  const categories = ['Όλα', ...new Set(state.items.map((item) => item.category || 'Άλλο'))];
  return `${renderHeader('Το απόθεμά μου', 'Όσα έχεις στο σπίτι, οργανωμένα σε ένα σημείο.', 'Προσθήκη προϊόντος')}
    <section class="panel"><div class="toolbar"><label class="search-wrap"><span aria-hidden="true">⌕</span><input id="pantry-search" class="search-input" type="search" value="${escapeHtml(pantryQuery)}" placeholder="Αναζήτηση προϊόντος ή θέσης" aria-label="Αναζήτηση στο απόθεμα"></label><span class="inventory-count" id="inventory-count">${t('{count} προϊόντα', { count: state.items.length })}</span></div>
    <div class="filter-row" aria-label="Φίλτρο κατηγορίας">${categories.map((category) => `<button type="button" class="filter-chip ${pantryCategory === category ? 'is-active' : ''}" data-action="filter-category" data-category="${escapeHtml(category)}" aria-pressed="${pantryCategory === category}">${category === 'Όλα' ? '' : `<span aria-hidden="true">${CATEGORY_ICONS[category] || '🧺'}</span> `}${escapeHtml(category)}</button>`).join('')}</div>
    <div id="inventory-list" class="inventory-list"></div></section>`;
}

function renderShoppingRow(item) {
  return `<div class="shopping-row ${item.checked ? 'checked' : ''}"><input class="shopping-check" type="checkbox" data-action="toggle-shopping" data-id="${escapeHtml(item.id)}" ${item.checked ? 'checked' : ''} aria-label="${escapeHtml(t(item.checked ? 'Ολοκληρώθηκε: {name}' : 'Σημείωση ως αγορασμένο: {name}', { name: item.name }))}"><div><strong class="shopping-row-name">${escapeHtml(item.name)}</strong><div class="shopping-row-detail">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))}</div></div><span class="shopping-state">${item.checked ? (item.pantryAdded ? 'Μπήκε στο απόθεμα' : 'Μπήκε στο καλάθι') : ''}</span><button class="icon-button danger" type="button" data-action="remove-shopping" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Αφαίρεση {name} από τη λίστα', { name: item.name }))}">×</button></div>`;
}

function renderShopping() {
  const pending = state.shopping.filter((item) => !item.checked);
  const checked = state.shopping.filter((item) => item.checked);
  return `${renderHeader('Λίστα αγορών', 'Σημείωσε όσα χρειάζεσαι και πάρε τη λίστα μαζί σου.')}
    <div class="shopping-layout"><section class="panel"><div class="panel-heading"><div><h2>Τι χρειάζεται το σπίτι;</h2><p>${pending.length ? pendingLabel(pending.length) : 'Κανένα εκκρεμές προϊόν'}</p></div><div class="panel-links">${pending.length ? '<button class="panel-link" type="button" data-action="share-shopping">↗ Κοινοποίηση</button>' : ''}${checked.length ? '<button class="panel-link" type="button" data-action="clear-completed">Καθάρισε τα αγορασμένα</button>' : ''}</div></div>
    <form id="shopping-form" class="shopping-add-form" novalidate><input class="field-input" name="name" required maxlength="80" placeholder="π.χ. Φέτα" aria-label="Προϊόν για αγορά"><input class="field-input" name="quantity" type="number" min="0.1" max="${MAX_QUANTITY}" step="0.1" value="1" aria-label="Ποσότητα"><select class="field-input unit-select" name="unit" aria-label="Μονάδα"><option value="τεμ.">τεμ.</option><option value="πακέτα">πακέτα</option><option value="κιλά">κιλά</option><option value="γραμμάρια">γραμμάρια</option><option value="λίτρα">λίτρα</option></select><button class="button button-primary" type="submit">＋ Προσθήκη</button></form>
    <p class="form-error" id="shopping-error" role="alert" hidden></p>
    <div class="shopping-list">${state.shopping.length ? [...pending, ...checked].map(renderShoppingRow).join('') : renderEmpty('Η λίστα είναι άδεια', 'Πρόσθεσε όσα χρειάζεσαι πριν πας για ψώνια.', 'focus-shopping', 'Γράψε το πρώτο προϊόν', '🛒')}</div></section>
    <aside class="panel shopping-summary"><span class="stat-icon">🛍️</span><h2>Μικρή υπενθύμιση</h2><p>Κράτησε τη λίστα απλή και πρόσθεσε μόνο ό,τι χρειάζεσαι.</p><div class="shopping-summary-list"><div class="summary-line"><span>Εκκρεμούν</span><strong>${pending.length}</strong></div><div class="summary-line"><span>Στο καλάθι</span><strong>${checked.length}</strong></div><div class="summary-line"><span>Στη συσκευή</span><strong>Ιδιωτικά</strong></div></div></aside></div>`;
}

function renderSettings() {
  return `${renderHeader('Ρυθμίσεις', 'Διαχείριση και αντίγραφο ασφαλείας των δεδομένων σου.')}
    <div class="settings-grid"><section class="panel settings-card"><span class="stat-icon">🔒</span><h2>Απόρρητο πρώτα</h2><p>Αυτή η έκδοση αποθηκεύει το απόθεμα και τη λίστα αγορών μόνο στον browser της συσκευής. Δεν υπάρχει λογαριασμός ή συγχρονισμός με cloud.</p><div class="privacy-note">Αν καθαρίσεις τα δεδομένα του browser ή αλλάξεις συσκευή, χρησιμοποίησε αντίγραφο ασφαλείας για να μεταφέρεις τα δεδομένα σου.</div></section>
    <section class="panel settings-card"><span class="stat-icon">◐</span><h2>Εμφάνιση</h2><p>Διάλεξε φωτεινό ή σκούρο θέμα, ή άφησέ το να ακολουθεί τη συσκευή.</p><div class="theme-options" role="group" aria-label="Θέμα">${[['auto', 'Αυτόματο'], ['light', 'Φωτεινό'], ['dark', 'Σκούρο']].map(([value, label]) => `<button type="button" class="filter-chip ${currentTheme() === value ? 'is-active' : ''}" data-action="set-theme" data-theme="${value}" aria-pressed="${currentTheme() === value}">${label}</button>`).join('')}</div></section>
    ${renderLanguageCard()}
    ${renderSyncCard()}
    ${renderNotificationCard()}
    <section class="panel settings-card"><span class="stat-icon blue">↗</span><h2>Αντίγραφο ασφαλείας</h2><p>Εξήγαγε ή εισήγαγε ένα αρχείο JSON. Το αρχείο περιέχει τα προϊόντα και τη λίστα αγορών σου.</p><div class="settings-actions"><button class="button button-primary" type="button" data-action="export-backup">⬇ Εξαγωγή αντιγράφου</button><button class="button button-quiet" type="button" data-action="import-backup">⬆ Εισαγωγή αντιγράφου</button></div></section>
    <section class="panel settings-card"><span class="stat-icon amber">✨</span><h2>Δοκιμαστικά δεδομένα</h2><p>Γέμισε την εφαρμογή με ενδεικτικά προϊόντα για να δεις πώς λειτουργεί.</p><div class="settings-actions"><button class="button button-quiet" type="button" data-action="load-demo">Φόρτωση παραδειγμάτων</button></div></section>
    <section class="panel settings-card danger-zone"><span class="stat-icon" style="background:var(--red-soft)">⌫</span><h2>Καθαρισμός δεδομένων</h2><p>Διέγραψε όλα τα προϊόντα και τις λίστες από αυτή τη συσκευή.</p><div class="settings-actions"><button class="button button-danger" type="button" data-action="clear-data">Διαγραφή όλων</button></div></section></div>`;
}

function renderApp() {
  setActiveNavigation();
  renderNavCounts();
  if (activeView === 'overview') viewRoot.innerHTML = renderOverview();
  else if (activeView === 'pantry') viewRoot.innerHTML = renderPantry();
  else if (activeView === 'shopping') viewRoot.innerHTML = renderShopping();
  else viewRoot.innerHTML = renderSettings();
  if (activeView === 'pantry') renderPantryList();
  translateDom(viewRoot);
}

function navigate(view) {
  if (!VIEWS.includes(view)) return;
  activeView = view;
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  pantryQuery = view === 'pantry' ? pantryQuery : '';
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

async function fillFromBarcode(code) {
  const status = document.querySelector('#barcode-status');
  const barcode = normalizeBarcode(code);
  itemForm.elements.barcode.value = barcode || String(code || '');
  if (!barcode) { status.textContent = t('Ο κωδικός δεν είναι έγκυρος barcode.'); return; }
  const editingId = itemForm.elements.id.value;
  const known = state.items.find((item) => item.barcode === barcode && item.id !== editingId);
  if (known) {
    itemForm.elements.name.value = itemForm.elements.name.value || known.name;
    itemForm.elements.category.value = known.category || itemForm.elements.category.value;
    updateNameCounter();
    status.textContent = t('Υπάρχει ήδη στο απόθεμα ως «{name}».', { name: known.name });
    return;
  }
  status.textContent = t('Αναζήτηση στο Open Food Facts…');
  try {
    const product = await lookupBarcode(barcode);
    if (!product) { status.textContent = t('Δεν βρέθηκε το προϊόν. Γράψε το όνομα και θα το θυμάμαι για αυτόν τον barcode.'); return; }
    if (!itemForm.elements.name.value.trim() || !editingId) itemForm.elements.name.value = product.name;
    if (product.category) itemForm.elements.category.value = product.category;
    updateNameCounter();
    status.textContent = t('Βρέθηκε: {name}. Έλεγξε τα στοιχεία πριν την αποθήκευση.', { name: product.name });
  } catch (error) {
    status.textContent = t(navigator.onLine === false ? 'Χωρίς σύνδεση: η αναζήτηση δεν είναι διαθέσιμη.' : t(error.message || 'Η αναζήτηση απέτυχε.'));
  }
}

async function openScanner() {
  const dialog = document.querySelector('#scan-dialog');
  const status = document.querySelector('#scan-status');
  status.textContent = t('Άνοιγμα κάμερας…');
  dialog.showModal();
  try {
    stopScanner = await startScanner(document.querySelector('#scan-video'), (code) => {
      stopScanner = null;
      dialog.close();
      fillFromBarcode(code);
    });
    if (dialog.open) status.textContent = t('Στόχευσε τον barcode με την κάμερα.');
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

function notifySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}');
    return { enabled: Boolean(saved.enabled), days: Number.isInteger(saved.days) && saved.days >= 0 && saved.days <= 30 ? saved.days : 3, lastNotified: String(saved.lastNotified || '') };
  } catch { return { enabled: false, days: 3, lastNotified: '' }; }
}

function saveNotifySettings(changes) {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify({ ...notifySettings(), ...changes })); } catch {}
}

function notificationsSupported() {
  return 'Notification' in window;
}

async function showNotification(title, body) {
  const options = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'spitothiki-expiry', lang: getLang() };
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (registration?.showNotification) return registration.showNotification(title, options);
  return new Notification(title, options);
}

// Checks expiries when the app opens or comes back to the foreground; notifies at most once per day.
async function checkExpiryNotifications() {
  const settings = notifySettings();
  if (!settings.enabled || !notificationsSupported() || Notification.permission !== 'granted') return;
  const today = localDateKey();
  if (settings.lastNotified === today) return;
  const due = expiringWithin(state.items, today, settings.days);
  if (!due.length) return;
  const names = due.slice(0, 3).map((item) => `${item.name} (${expiryLabel(item.expiry).toLocaleLowerCase(locale())})`).join(', ');
  const more = due.length > 3 ? t(' και {count} ακόμη', { count: due.length - 3 }) : '';
  try {
    await showNotification(due.length === 1 ? t('1 προϊόν λήγει σύντομα') : t('{count} προϊόντα λήγουν σύντομα', { count: due.length }), `${names}${more}.`);
    saveNotifySettings({ lastNotified: today });
  } catch {}
}

async function enableNotifications() {
  if (!notificationsSupported()) { showToast('Ο browser δεν υποστηρίζει ειδοποιήσεις.'); return; }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') { showToast('Οι ειδοποιήσεις δεν επιτράπηκαν. Μπορείς να τις ενεργοποιήσεις από τις ρυθμίσεις του browser.'); renderApp(); return; }
  saveNotifySettings({ enabled: true, lastNotified: '' });
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
    <p class="field-hint">Οι ειδοποιήσεις εμφανίζονται όταν ανοίγεις την εφαρμογή ή επιστρέφεις σε αυτή. Ειδοποιήσεις με την εφαρμογή κλειστή χρειάζονται server (push), που αυτή η έκδοση δεν έχει.</p></section>`;
}

function renderLanguageCard() {
  const lang = getLang();
  return `<section class="panel settings-card"><span class="stat-icon blue">🌐</span><h2>Γλώσσα</h2><p>Διάλεξε τη γλώσσα της εφαρμογής. Τα δεδομένα σου δεν αλλάζουν.</p><div class="theme-options" role="group" aria-label="Γλώσσα" data-no-i18n>${[['el', 'Ελληνικά'], ['en', 'English']].map(([value, label]) => `<button type="button" class="filter-chip ${lang === value ? 'is-active' : ''}" data-action="set-lang" data-lang="${value}" lang="${value}" aria-pressed="${lang === value}">${label}</button>`).join('')}</div></section>`;
}

function applyLanguage() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = t('Σπιτοθήκη — Το σπίτι σε τάξη');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('Οργάνωσε τα τρόφιμα του σπιτιού, τις ημερομηνίες λήξης και τη λίστα αγορών σου.'));
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
  } else if (action === 'delete-item') {
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
  else if (action === 'close-scan') closeScanner();
  else if (action === 'lookup-barcode') fillFromBarcode(itemForm.elements.barcode.value);
  else if (action === 'enable-notifications') enableNotifications();
  else if (action === 'disable-notifications') { saveNotifySettings({ enabled: false }); renderApp(); showToast('Οι ειδοποιήσεις απενεργοποιήθηκαν.'); }
  else if (action === 'set-theme') setTheme(button.dataset.theme);
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
    pantryCategory = 'Όλα'; pantryQuery = ''; renderApp();
  } else if (action === 'focus-shopping') {
    document.querySelector('#shopping-form input[name="name"]')?.focus();
  } else if (action === 'export-backup') downloadBackup();
  else if (action === 'import-backup') backupFile.click();
  else if (action === 'load-demo') {
    const loadDemo = () => { state = { items: makeDemoItems(), shopping: [] }; persist(); renderApp(); showToast('Τα παραδείγματα φορτώθηκαν.'); };
    if (state.items.length || state.shopping.length) showConfirm('Τα τωρινά δεδομένα θα αντικατασταθούν από δοκιμαστικά προϊόντα.', loadDemo, 'Φόρτωση παραδειγμάτων;');
    else loadDemo();
  } else if (action === 'clear-data') {
    showConfirm(`${t('Θα διαγραφούν όλα τα προϊόντα και η λίστα αγορών από αυτή τη συσκευή.')}${syncStatus.user ? t(' Επειδή είσαι συνδεδεμένος, θα διαγραφούν και από τις συγχρονισμένες συσκευές.') : ''}${t(' Φρόντισε να έχεις αντίγραφο αν τα χρειάζεσαι.')}`, () => {
      state = { items: [], shopping: [] }; persist(); renderApp(); showToast('Τα δεδομένα διαγράφηκαν.');
    }, 'Διαγραφή όλων των δεδομένων;');
  }
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { event.preventDefault(); navigate(viewButton.dataset.view); return; }
  const button = event.target.closest('[data-action]');
  if (button && button.type !== 'checkbox') handleAction(button);
});

document.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-action="toggle-shopping"]');
  if (checkbox) handleAction(checkbox);
  if (event.target === backupFile && backupFile.files?.[0]) {
    const file = backupFile.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseBackup(reader.result);
        showConfirm(t('Το αντίγραφο περιέχει {items} προϊόντα και {shopping} είδη στη λίστα. Θα αντικαταστήσει τα τωρινά δεδομένα.', { items: imported.items.length, shopping: imported.shopping.length }), () => {
          state = imported; persist(); renderApp(); showToast('Το αντίγραφο εισήχθη.');
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
    if (Number.isFinite(days) && days >= 0 && days <= 30) saveNotifySettings({ days, lastNotified: '' });
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

  if (event.target.id === 'shopping-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      state.shopping.push(createShoppingItem({ name: formData.get('name'), quantity: formData.get('quantity'), unit: formData.get('unit') }));
      if (persist()) { renderApp(); showToast('Προστέθηκε στη λίστα αγορών.'); document.querySelector('#shopping-form input[name="name"]')?.focus(); }
      return;
    } catch (error) {
      const message = document.querySelector('#shopping-error');
      message.textContent = t(error.message || 'Έλεγξε τα στοιχεία.');
      message.hidden = false;
    }
  }
});

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

checkExpiryNotifications();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkExpiryNotifications(); });

startSync();
